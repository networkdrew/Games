import { parseAction } from "./intent";
import { pickScenario, randomSeed, getScenario } from "./scenarios";
import type { EventEntry, GameState, GameStatus, Outcome } from "./types";

const TENSION_SNAP_THRESHOLD = 100;
const TENSION_SNAP_DAMAGE = 20;

export interface ActionResult {
  state: GameState;
  outcome: Outcome;
  /** True if this action was a free, meta action (inventory check) that cost no turn and needs no narration/model call. */
  free: boolean;
}

export function createNewGame(seed: number = randomSeed()): GameState {
  const scenario = pickScenario(seed);
  return {
    scenarioId: scenario.id,
    seed,
    turn: 0,
    maxTurns: scenario.maxTurns,
    health: scenario.maxHealth,
    maxHealth: scenario.maxHealth,
    tension: 10,
    inventory: [...scenario.startingInventory],
    clues: [],
    history: [],
    status: "playing",
    suggestedActions: [...scenario.startingSuggestions],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Applies one player action to the authoritative game state. This is the
 * single place turn count, health, tension, inventory, clues, and win/loss
 * are ever decided — see the module docstring in types.ts. Returns the new
 * state plus the deterministic Outcome, so the caller can hand a compact,
 * already-decided summary to the model for narration (never the state
 * itself, and never a request for the model to decide anything).
 */
export function applyAction(state: GameState, rawInput: string): ActionResult {
  if (state.status !== "playing") {
    throw new Error("Cannot act after the game has ended");
  }

  const scenario = getScenario(state.scenarioId);
  const action = parseAction(rawInput, state.inventory);

  if (action.intent === "inventory") {
    return { state, outcome: buildInventoryOutcome(state), free: true };
  }

  const outcome = scenario.resolve(action, state);
  const nextTurn = state.turn + 1;

  let health = state.health;
  const tension = clamp(state.tension + (outcome.tensionDelta ?? 0), 0, 100);
  const clues = outcome.clueGained
    ? Array.from(new Set([...state.clues, outcome.clueGained]))
    : state.clues;
  let inventory = state.inventory;
  if (outcome.itemGained) {
    inventory = Array.from(new Set([...inventory, outcome.itemGained]));
  }
  if (outcome.itemConsumed) {
    inventory = inventory.filter((i) => i !== outcome.itemConsumed);
  }

  if (outcome.damage) {
    health = clamp(health - outcome.damage, 0, state.maxHealth);
  }

  let snapped = false;
  if (
    tension >= TENSION_SNAP_THRESHOLD &&
    state.tension < TENSION_SNAP_THRESHOLD
  ) {
    health = clamp(health - TENSION_SNAP_DAMAGE, 0, state.maxHealth);
    snapped = true;
  }

  let status: GameStatus = state.status;
  let ending = state.ending;

  if (outcome.kind === "win") {
    status = "won";
    ending = outcome.fallbackNarration;
  } else if (health <= 0) {
    status = "lost";
    ending =
      "Your strength gives out. The dark behind the door closes in, and your run ends here.";
  } else if (nextTurn >= scenario.maxTurns) {
    status = "lost";
    ending =
      "Time runs out. Whatever chance you had slips away, and the door stays exactly as shut as when you arrived.";
  }

  const finalOutcome: Outcome = snapped
    ? {
        ...outcome,
        summary: `${outcome.summary} The rising tension finally snaps something loose, causing extra harm.`,
        fallbackNarration: `${outcome.fallbackNarration} Something in the air finally snaps — a jolt of harm you didn't see coming.`,
      }
    : outcome;

  const nextState: GameState = {
    ...state,
    turn: nextTurn,
    health,
    tension,
    inventory,
    clues,
    status,
    ending,
    suggestedActions: outcome.suggestedActions ?? state.suggestedActions,
  };

  return { state: nextState, outcome: finalOutcome, free: false };
}

export function appendHistory(
  state: GameState,
  action: string,
  narration: string,
  aiNarrated: boolean,
): GameState {
  const entry: EventEntry = {
    turn: state.turn,
    action,
    narration,
    aiNarrated,
  };
  return { ...state, history: [...state.history, entry] };
}

function buildInventoryOutcome(state: GameState): Outcome {
  const list = state.inventory.length
    ? state.inventory.join(", ")
    : "nothing but your own two hands";
  const text = `You check what you're carrying: ${list}.`;
  return {
    kind: "neutral",
    summary: text,
    fallbackNarration: text,
  };
}
