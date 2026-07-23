import { describe, expect, it } from "vitest";
import { SCENARIOS, getScenario, pickScenario } from "./scenarios";
import {
  applyDeterministicAction,
  createNewGame,
  getLegalOutcomes,
} from "./engine";

describe("scenarios", () => {
  it("has exactly the 8 required scenario templates", () => {
    const ids = SCENARIOS.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        "cursed-vault",
        "deceptive-spirit",
        "flooding-chamber",
        "guard-password",
        "mimic",
        "sleeping-creature",
        "sound-reactive",
        "trapped-adventurer",
      ].sort(),
    );
  });

  it("gives every scenario a character prompt, secret truth, intro, and starting inventory", () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.doorPersonality.length).toBeGreaterThan(20);
      expect(scenario.secretTruth.length).toBeGreaterThan(20);
      expect(scenario.intro.length).toBeGreaterThan(0);
      expect(scenario.startingInventory.length).toBeGreaterThan(0);
      expect(scenario.maxTurns).toBeGreaterThanOrEqual(5);
      expect(scenario.maxTurns).toBeLessThanOrEqual(10);
    }
  });

  it("gives every scenario a complete free-form profile (entity, environment, bounds, allowlists, endings)", () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.entity.identity.length).toBeGreaterThan(0);
      expect(scenario.entity.personality.length).toBeGreaterThan(0);
      expect(scenario.entity.voice.length).toBeGreaterThan(0);
      expect(scenario.environment.length).toBeGreaterThan(0);
      expect(scenario.objects.length).toBeGreaterThan(0);
      expect(scenario.bounds.maxHealthDelta).toBeGreaterThan(0);
      expect(scenario.bounds.maxTensionDelta).toBeGreaterThan(0);
      expect(scenario.bounds.maxTrustDelta).toBeGreaterThan(0);
      expect(scenario.endings.length).toBeGreaterThan(0);
      for (const ending of scenario.endings) {
        expect(["WIN", "LOSS"]).toContain(ending.kind);
      }
    }
  });

  it("every clueAllowlist id referenced by getLegalOutcomes is actually declared in the allowlist", () => {
    for (const scenario of SCENARIOS) {
      const allowedIds = new Set(scenario.clueAllowlist.map((c) => c.id));
      const state = createNewGame(
        SCENARIOS.findIndex((s) => s.id === scenario.id),
      );
      for (const outcome of getLegalOutcomes(state)) {
        if (outcome.change.clueGained) {
          expect(
            allowedIds.has(outcome.change.clueGained),
            `${scenario.id}'s clueAllowlist is missing "${outcome.change.clueGained}"`,
          ).toBe(true);
        }
      }
    }
  });

  it("checkEnding never grants WIN from the opening state (every win requires real progress)", () => {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const scenario = SCENARIOS[i]!;
      const state = createNewGame(i);
      // flooding-chamber is deliberately low-friction by design (decisive
      // action wins immediately), and sleeping-creature's win condition is
      // "tension is still low" which is trivially true at the very start —
      // every other scenario requires real built-up trust/clue/state change.
      if (
        scenario.id === "flooding-chamber" ||
        scenario.id === "sleeping-creature"
      )
        continue;
      expect(
        scenario.checkEnding(state, "WIN"),
        `${scenario.id} grants WIN from the opening state`,
      ).toBe(false);
    }
  });

  it("picks scenarios deterministically by seed and wraps around", () => {
    expect(pickScenario(0).id).toBe(SCENARIOS[0]!.id);
    expect(pickScenario(SCENARIOS.length).id).toBe(SCENARIOS[0]!.id);
  });

  it("throws for an unknown scenario id", () => {
    // @ts-expect-error deliberately invalid id for the runtime guard
    expect(() => getScenario("not-a-real-scenario")).toThrow();
  });

  it("keeps every legal outcome description within the bridge's request-validation cap", () => {
    // Mirrors bridge/config.mjs's MAX_OUTCOME_DESCRIPTION_LENGTH — a real
    // scenario description once exceeded the (then-smaller) cap by a single
    // character and silently triggered a deterministic-fallback turn. Kept
    // as a plain literal here (not imported) since the bridge is a
    // separate, dependency-free JS runtime with no shared build step.
    const BRIDGE_MAX_OUTCOME_DESCRIPTION_LENGTH = 320;
    for (let i = 0; i < SCENARIOS.length; i++) {
      let state = createNewGame(i);
      // Sample the legal-outcomes list at several points across a run, not
      // just the opening state, since descriptions vary by progress.
      const actionsToTry = [
        "listen",
        "look under",
        "search wall",
        "ask",
        "offer",
        "use key",
      ];
      for (const action of actionsToTry) {
        if (state.status !== "playing") break;
        for (const outcome of getLegalOutcomes(state)) {
          expect(
            outcome.description.length,
            `${state.scenarioId}'s "${outcome.id}" description is too long for the bridge`,
          ).toBeLessThanOrEqual(BRIDGE_MAX_OUTCOME_DESCRIPTION_LENGTH);
        }
        state = applyDeterministicAction(state, action).state;
      }
    }
  });

  it("never offers a duplicate outcome id in the same legal-outcomes list", () => {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const state = createNewGame(i);
      const legal = getLegalOutcomes(state);
      const ids = legal.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every scenario has at least one reachable win path from its opening state (deterministic chooser)", () => {
    // A small scripted playthrough per scenario proves a real win path
    // exists via the deterministic chooser — not just that some outcome
    // object happens to have isWin: true somewhere in the code.
    const scripts: Record<string, string[]> = {
      "sleeping-creature": ["listen at the door", "use the rusty key"],
      "trapped-adventurer": ["offer the waterskin", "use the rusty key"],
      mimic: ["search the surrounding wall", "use the rusty key"],
      "cursed-vault": ["offer the silver coin", "use the rusty key"],
      "guard-password": [
        "look underneath it",
        "listen at the door",
        "ask who is inside",
      ],
      "flooding-chamber": ["use the rusty key"],
      "sound-reactive": ["listen at the door", "knock three times"],
      "deceptive-spirit": ["search the surrounding wall", "use the rusty key"],
    };

    for (const scenario of SCENARIOS) {
      const script = scripts[scenario.id];
      expect(script, `missing script for ${scenario.id}`).toBeTruthy();

      const seedIndex = SCENARIOS.findIndex((s) => s.id === scenario.id);
      let state = createNewGame(seedIndex);
      for (const line of script!) {
        if (state.status !== "playing") break;
        state = applyDeterministicAction(state, line).state;
      }
      expect(state.status, `${scenario.id} did not win via its script`).toBe(
        "won",
      );
    }
  });

  it("every scenario is losable by repeated forceful actions or a timeout", () => {
    for (let i = 0; i < SCENARIOS.length; i++) {
      let state = createNewGame(i);
      const scenario = SCENARIOS[i]!;
      for (
        let turn = 0;
        turn < scenario.maxTurns + 2 && state.status === "playing";
        turn++
      ) {
        state = applyDeterministicAction(state, "kick the door").state;
      }
      expect(state.status, `${scenario.id} never ended`).not.toBe("playing");
    }
  });
});
