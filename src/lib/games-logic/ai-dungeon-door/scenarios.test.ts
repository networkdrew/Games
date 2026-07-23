import { describe, expect, it } from "vitest";
import { SCENARIOS, getScenario, pickScenario } from "./scenarios";
import { applyAction, createNewGame } from "./engine";

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

  it("gives every scenario a starting inventory, intro, and suggestions", () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.intro.length).toBeGreaterThan(0);
      expect(scenario.startingInventory.length).toBeGreaterThan(0);
      expect(scenario.startingSuggestions.length).toBeGreaterThan(0);
      expect(scenario.maxTurns).toBeGreaterThanOrEqual(5);
      expect(scenario.maxTurns).toBeLessThanOrEqual(10);
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

  it("every scenario has at least one reachable win path from its opening state", () => {
    // A small scripted playthrough per scenario proves a real win path
    // exists — not just that resolve() can technically return kind: "win".
    const scripts: Record<string, string[]> = {
      "sleeping-creature": ["listen at the door", "use the rusty key"],
      "trapped-adventurer": ["ask who is inside", "use the rusty key"],
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
        state = applyAction(state, line).state;
      }
      expect(state.status, `${scenario.id} did not win via its script`).toBe(
        "won",
      );
    }
  });
});
