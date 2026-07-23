import { describe, expect, it } from "vitest";
import {
  applyDeterministicAction,
  applyLegalOutcome,
  buildTurnContext,
  createNewGame,
  getLegalOutcomes,
  pushMemoryFact,
} from "./engine";
import { SCENARIOS } from "./scenarios";

describe("createNewGame", () => {
  it("creates a playing game with full health, base trust, and starting inventory", () => {
    const state = createNewGame(0);
    expect(state.status).toBe("playing");
    expect(state.turn).toBe(0);
    expect(state.health).toBe(state.maxHealth);
    expect(state.trust).toBe(30);
    expect(state.stage).toBe(0);
    expect(state.inventory.length).toBeGreaterThan(0);
    expect(state.clues).toEqual([]);
    expect(state.memory).toEqual([]);
    expect(state.recentExchanges).toEqual([]);
  });

  it("is deterministic for a given seed", () => {
    const a = createNewGame(42);
    const b = createNewGame(42);
    expect(a.scenarioId).toBe(b.scenarioId);
  });

  it("covers every scenario across the seed space", () => {
    const seen = new Set(SCENARIOS.map((_, i) => createNewGame(i).scenarioId));
    expect(seen.size).toBe(SCENARIOS.length);
  });
});

describe("getLegalOutcomes", () => {
  it("always offers at least one outcome", () => {
    for (let i = 0; i < SCENARIOS.length; i++) {
      const state = createNewGame(i);
      expect(getLegalOutcomes(state).length).toBeGreaterThan(0);
    }
  });

  it("stops offering a clue outcome once its clue has already been found", () => {
    let state = createNewGame(0); // sleeping-creature
    const before = getLegalOutcomes(state);
    expect(
      before.some((o) => o.change.clueGained === "breathing-is-slow"),
    ).toBe(true);

    state = applyDeterministicAction(state, "listen at the door").state;
    const after = getLegalOutcomes(state);
    expect(after.some((o) => o.change.clueGained === "breathing-is-slow")).toBe(
      false,
    );
  });
});

describe("applyDeterministicAction", () => {
  it("increments the turn counter for a normal action", () => {
    const state = createNewGame(0);
    const { state: next } = applyDeterministicAction(
      state,
      "listen at the door",
    );
    expect(next.turn).toBe(1);
  });

  it("does not consume a turn for an inventory check", () => {
    const state = createNewGame(0);
    const { state: next, free } = applyDeterministicAction(
      state,
      "check my inventory",
    );
    expect(free).toBe(true);
    expect(next.turn).toBe(state.turn);
  });

  it("throws if acting after the game has ended", () => {
    let state = createNewGame(0);
    for (let i = 0; i < 20 && state.status === "playing"; i++) {
      state = applyDeterministicAction(state, "kick the door").state;
    }
    expect(state.status).not.toBe("playing");
    expect(() => applyDeterministicAction(state, "listen")).toThrow();
  });

  it("reduces health on a damaging outcome", () => {
    const state = createNewGame(0); // sleeping-creature
    const { state: next } = applyDeterministicAction(state, "kick the door");
    expect(next.health).toBeLessThan(state.health);
  });

  it("clamps health at zero and never below", () => {
    let state = createNewGame(0);
    for (let i = 0; i < 20 && state.health > 0; i++) {
      state = applyDeterministicAction(state, "kick the door").state;
    }
    expect(state.health).toBeGreaterThanOrEqual(0);
  });

  it("ends the run as lost once maxTurns is reached without winning", () => {
    let state = createNewGame(1); // imprisoned knight, gentle actions
    for (let i = 0; i < state.maxTurns + 2 && state.status === "playing"; i++) {
      state = applyDeterministicAction(state, "wait quietly").state;
    }
    expect(state.status).not.toBe("playing");
  });

  it("wins the sleeping-creature scenario via listen then the rusty key", () => {
    let state = createNewGame(0);
    expect(state.scenarioId).toBe("sleeping-creature");
    state = applyDeterministicAction(state, "listen at the door").state;
    expect(state.clues).toContain("breathing-is-slow");
    state = applyDeterministicAction(state, "use the rusty key").state;
    expect(state.status).toBe("won");
    expect(state.ending).toBeTruthy();
  });

  it("adds a clue only once for repeated identical actions", () => {
    let state = createNewGame(0);
    state = applyDeterministicAction(state, "listen at the door").state;
    const cluesAfterFirst = state.clues.length;
    state = applyDeterministicAction(state, "listen at the door").state;
    expect(state.clues.length).toBe(cluesAfterFirst);
  });

  it("keeps tension and trust within 0-100", () => {
    let state = createNewGame(4); // password guard, has tension-raising wrong guesses
    for (let i = 0; i < 15 && state.status === "playing"; i++) {
      state = applyDeterministicAction(state, "ask who is inside").state;
    }
    expect(state.tension).toBeGreaterThanOrEqual(0);
    expect(state.tension).toBeLessThanOrEqual(100);
    expect(state.trust).toBeGreaterThanOrEqual(0);
    expect(state.trust).toBeLessThanOrEqual(100);
  });

  it("records history entries with aiNarrated=false and requiredFallback=false for deterministic play", () => {
    const state = createNewGame(0);
    const { state: next } = applyDeterministicAction(
      state,
      "listen at the door",
    );
    expect(next.history).toHaveLength(1);
    expect(next.history[0]!.aiNarrated).toBe(false);
    expect(next.history[0]!.requiredFallback).toBe(false);
  });
});

describe("applyLegalOutcome", () => {
  it("throws if the game has already ended", () => {
    let state = createNewGame(0);
    for (let i = 0; i < 20 && state.status === "playing"; i++) {
      state = applyDeterministicAction(state, "kick the door").state;
    }
    const legal = getLegalOutcomes(state);
    expect(() => applyLegalOutcome(state, legal[0]!)).toThrow();
  });

  it("marks a snap when tension crosses the threshold within one outcome", () => {
    let state = createNewGame(0);
    // Push tension close to the snap threshold first.
    for (
      let i = 0;
      i < 6 && state.status === "playing" && state.tension < 90;
      i++
    ) {
      state = applyDeterministicAction(state, "kick the door").state;
    }
    if (state.status === "playing") {
      const legal = getLegalOutcomes(state);
      const angerOutcome = legal.find(
        (o) =>
          o.id === "ENTITY_ANGER_INCREASES" || o.id === "TAKE_MAJOR_DAMAGE",
      );
      if (
        angerOutcome &&
        state.tension + (angerOutcome.change.tensionDelta ?? 0) >= 100
      ) {
        const result = applyLegalOutcome(state, angerOutcome);
        expect(result.snapped).toBe(true);
      }
    }
  });
});

describe("buildTurnContext", () => {
  it("includes a character prompt, secret truth, state summary, and legal outcomes", () => {
    const state = createNewGame(0);
    const ctx = buildTurnContext(state);
    expect(ctx.characterPrompt.length).toBeGreaterThan(0);
    expect(ctx.secretTruth.length).toBeGreaterThan(0);
    expect(ctx.stateSummary).toContain("health=");
    expect(ctx.legalOutcomes.length).toBeGreaterThan(0);
    expect(ctx.memoryFacts).toEqual([]);
    expect(ctx.recentExchanges).toEqual([]);
  });
});

describe("pushMemoryFact", () => {
  it("adds a new fact", () => {
    const state = createNewGame(0);
    const next = pushMemoryFact(state, "The player promised to return.");
    expect(next.memory).toContain("The player promised to return.");
  });

  it("ignores null facts", () => {
    const state = createNewGame(0);
    const next = pushMemoryFact(state, null);
    expect(next).toBe(state);
  });

  it("does not duplicate an existing fact", () => {
    let state = createNewGame(0);
    state = pushMemoryFact(state, "fact one");
    state = pushMemoryFact(state, "fact one");
    expect(state.memory).toEqual(["fact one"]);
  });

  it("caps memory at MEMORY_CAP, dropping the oldest first", () => {
    let state = createNewGame(0);
    for (let i = 0; i < 12; i++) {
      state = pushMemoryFact(state, `fact ${i}`);
    }
    expect(state.memory.length).toBeLessThanOrEqual(8);
    expect(state.memory[state.memory.length - 1]).toBe("fact 11");
    expect(state.memory).not.toContain("fact 0");
  });
});
