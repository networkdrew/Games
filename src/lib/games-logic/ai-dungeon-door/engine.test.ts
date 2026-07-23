import { describe, expect, it } from "vitest";
import { applyAction, createNewGame } from "./engine";
import { SCENARIOS } from "./scenarios";

describe("createNewGame", () => {
  it("creates a playing game with full health and starting inventory", () => {
    const state = createNewGame(0);
    expect(state.status).toBe("playing");
    expect(state.turn).toBe(0);
    expect(state.health).toBe(state.maxHealth);
    expect(state.inventory.length).toBeGreaterThan(0);
    expect(state.clues).toEqual([]);
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

describe("applyAction", () => {
  it("increments the turn counter for a normal action", () => {
    const state = createNewGame(0); // sleeping-creature
    const { state: next } = applyAction(state, "listen at the door");
    expect(next.turn).toBe(1);
  });

  it("does not consume a turn for an inventory check", () => {
    const state = createNewGame(0);
    const { state: next, free } = applyAction(state, "check my inventory");
    expect(free).toBe(true);
    expect(next.turn).toBe(state.turn);
  });

  it("throws if acting after the game has ended", () => {
    let state = createNewGame(0);
    // Force a loss via repeated forceful actions.
    for (let i = 0; i < 20 && state.status === "playing"; i++) {
      state = applyAction(state, "kick the door").state;
    }
    expect(state.status).not.toBe("playing");
    expect(() => applyAction(state, "listen")).toThrow();
  });

  it("reduces health on a damaging outcome", () => {
    const state = createNewGame(0); // sleeping-creature
    const { state: next } = applyAction(state, "kick the door");
    expect(next.health).toBeLessThan(state.health);
  });

  it("clamps health at zero and never below", () => {
    let state = createNewGame(0);
    for (let i = 0; i < 20 && state.health > 0; i++) {
      state = applyAction(state, "kick the door").state;
    }
    expect(state.health).toBeGreaterThanOrEqual(0);
  });

  it("ends the run as lost once maxTurns is reached without winning", () => {
    let state = createNewGame(1); // trapped-adventurer, gentle actions
    for (let i = 0; i < state.maxTurns + 2 && state.status === "playing"; i++) {
      state = applyAction(state, "wait quietly").state;
    }
    expect(state.status).not.toBe("playing");
  });

  it("wins the sleeping-creature scenario via listen then the rusty key", () => {
    let state = createNewGame(0);
    expect(state.scenarioId).toBe("sleeping-creature");
    state = applyAction(state, "listen at the door").state;
    expect(state.clues).toContain("breathing-is-slow");
    state = applyAction(state, "use the rusty key").state;
    expect(state.status).toBe("won");
    expect(state.ending).toBeTruthy();
  });

  it("adds a clue only once for repeated identical actions", () => {
    let state = createNewGame(0);
    state = applyAction(state, "listen at the door").state;
    const cluesAfterFirst = state.clues.length;
    state = applyAction(state, "listen at the door").state;
    expect(state.clues.length).toBe(cluesAfterFirst);
  });

  it("keeps tension within 0-100", () => {
    let state = createNewGame(4); // guard-password, has tension-raising wrong guesses
    for (let i = 0; i < 15 && state.status === "playing"; i++) {
      state = applyAction(state, "ask who is inside").state;
    }
    expect(state.tension).toBeGreaterThanOrEqual(0);
    expect(state.tension).toBeLessThanOrEqual(100);
  });
});
