import { parseAction } from "./intent";
import { pickScenario, randomSeed, getScenario } from "./scenarios";
import type {
  EventEntry,
  GameState,
  GameStatus,
  LegalOutcome,
  MemoryFact,
  ParsedAction,
  Scenario,
} from "./types";

const TENSION_SNAP_THRESHOLD = 100;
const TENSION_SNAP_DAMAGE = 20;
/** Rolling memory is intentionally short — a handful of facts is enough for continuity without unbounded context growth (see docs/architecture.md). */
export const MEMORY_CAP = 8;
/** How many recent action/narration pairs are kept for short-term continuity in the prompt — never the whole transcript. */
export const RECENT_EXCHANGES_CAP = 5;

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
    trust: 30,
    stage: 0,
    inventory: [...scenario.startingInventory],
    clues: [],
    history: [],
    status: "playing",
    suggestedActions: [...scenario.startingSuggestions],
    memory: [],
    recentExchanges: [],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Parses free text into a rough intent — used only by the deterministic chooser (offline/no-model play), never sent to a model as "the interpretation." */
export function parseFreeText(
  raw: string,
  inventory: readonly string[],
): ParsedAction {
  return parseAction(raw, inventory);
}

/** True when this input is the free "check my inventory" meta-action — costs no turn and never involves a model. */
export function isInventoryCheck(
  raw: string,
  inventory: readonly string[],
): boolean {
  return parseAction(raw, inventory).intent === "inventory";
}

export function buildInventoryNarration(state: GameState): string {
  const list = state.inventory.length
    ? state.inventory.join(", ")
    : "nothing but your own two hands";
  return `You check what you're carrying: ${list}.`;
}

/**
 * The full set of outcomes legal right now, for a given scenario/state.
 * This is the entire vocabulary a model (or the deterministic chooser) is
 * allowed to select from this turn — see types.ts's module docstring.
 */
export function getLegalOutcomes(state: GameState): LegalOutcome[] {
  return getScenario(state.scenarioId).getLegalOutcomes(state);
}

/** Picks a plausible legal outcome without any model, using keyword/intent matching — offline play and the "Tiny Model" experimental path both use this when a model attempt fails. */
export function chooseDeterministicOutcome(
  action: ParsedAction,
  state: GameState,
  legal: LegalOutcome[],
): LegalOutcome {
  return getScenario(state.scenarioId).chooseDeterministicOutcome(
    action,
    state,
    legal,
  );
}

/** The safe, always-legal pick used after a model's output fails validation twice in a row. */
export function getSafeFallbackOutcome(legal: LegalOutcome[]): LegalOutcome {
  return (
    legal.find((o) => o.id === "NO_EFFECT") ??
    legal.find((o) => o.id === "DOOR_RESPONDS") ??
    legal[0]!
  );
}

export interface ApplyOutcomeResult {
  state: GameState;
  outcome: LegalOutcome;
  /** True if the tension-snap threshold was crossed this turn (extra, unannounced damage). */
  snapped: boolean;
}

/**
 * Applies one already-chosen, already-validated LegalOutcome to state. This
 * is the only place health/tension/trust/inventory/clues/stage/win-loss are
 * ever mutated — called identically whether the outcome was chosen by a
 * model, the deterministic chooser, or the safe fallback. The model never
 * reaches this function's inputs; it only ever supplies an `id` that must
 * already appear in `getLegalOutcomes(state)`.
 */
export function applyLegalOutcome(
  state: GameState,
  outcome: LegalOutcome,
): ApplyOutcomeResult {
  if (state.status !== "playing") {
    throw new Error("Cannot act after the game has ended");
  }

  const { change } = outcome;
  const nextTurn = state.turn + 1;

  let health = state.health;
  const tension = clamp(state.tension + (change.tensionDelta ?? 0), 0, 100);
  const trust = clamp(state.trust + (change.trustDelta ?? 0), 0, 100);
  const stage = change.advancesStage ? state.stage + 1 : state.stage;
  const clues = change.clueGained
    ? Array.from(new Set([...state.clues, change.clueGained]))
    : state.clues;

  let inventory = state.inventory;
  if (change.itemGained) {
    inventory = Array.from(new Set([...inventory, change.itemGained]));
  }
  if (change.itemConsumed) {
    inventory = inventory.filter((i) => i !== change.itemConsumed);
  }

  if (change.damage) {
    health = clamp(health - change.damage, 0, state.maxHealth);
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

  if (change.isWin) {
    status = "won";
    ending = outcome.fallbackNarration;
  } else if (health <= 0 || change.isLose) {
    status = "lost";
    ending =
      "Your strength gives out. The dark behind the door closes in, and your run ends here.";
  } else if (nextTurn >= getScenario(state.scenarioId).maxTurns) {
    status = "lost";
    ending =
      "Time runs out. Whatever chance you had slips away, and the door stays exactly as shut as when you arrived.";
  }

  const nextState: GameState = {
    ...state,
    turn: nextTurn,
    health,
    tension,
    trust,
    stage,
    inventory,
    clues,
    status,
    ending,
  };

  return { state: nextState, outcome, snapped };
}

/** Appends one action/narration pair to history and the capped rolling recent-exchanges window. */
export function appendExchange(
  state: GameState,
  action: string,
  narration: string,
  aiNarrated: boolean,
  requiredFallback: boolean,
): GameState {
  const entry: EventEntry = {
    turn: state.turn,
    action,
    narration,
    aiNarrated,
    requiredFallback,
  };
  const recentExchanges = [
    ...state.recentExchanges,
    { action, narration },
  ].slice(-RECENT_EXCHANGES_CAP);
  return { ...state, history: [...state.history, entry], recentExchanges };
}

/** Adds a sanitized continuity fact to the bounded rolling memory (oldest dropped first). Never raw/unsanitized model output — see narration.ts's `sanitizeMemoryFact`. */
export function pushMemoryFact(
  state: GameState,
  fact: MemoryFact | null,
): GameState {
  if (!fact) return state;
  if (state.memory.includes(fact)) return state;
  const memory = [...state.memory, fact].slice(-MEMORY_CAP);
  return { ...state, memory };
}

/** Compact plain-text summary of current state for the model prompt — never the raw GameState object. */
export function buildStateSummary(state: GameState): string {
  const scenario = getScenario(state.scenarioId);
  const clueText = state.clues.length > 0 ? state.clues.join(", ") : "none yet";
  return [
    `health=${state.health}/${state.maxHealth}`,
    `tension=${state.tension}/100`,
    `trust=${state.trust}/100`,
    `turn=${state.turn + 1}/${scenario.maxTurns}`,
    `stage=${state.stage}`,
    `inventory=[${state.inventory.join(", ")}]`,
    `discovered_clues=[${clueText}]`,
  ].join(" ");
}

export interface TurnContext {
  scenario: Scenario;
  characterPrompt: string;
  secretTruth: string;
  stateSummary: string;
  legalOutcomes: LegalOutcome[];
  memoryFacts: MemoryFact[];
  recentExchanges: GameState["recentExchanges"];
}

/** Assembles everything a turn needs to send to the model (or the deterministic chooser) — built once per turn, entirely client-side; the bridge never needs scenario knowledge. */
export function buildTurnContext(state: GameState): TurnContext {
  const scenario = getScenario(state.scenarioId);
  return {
    scenario,
    characterPrompt: scenario.doorPersonality,
    secretTruth: scenario.secretTruth,
    stateSummary: buildStateSummary(state),
    legalOutcomes: getLegalOutcomes(state),
    memoryFacts: state.memory,
    recentExchanges: state.recentExchanges,
  };
}

export interface DeterministicActionResult {
  state: GameState;
  narration: string;
  free: boolean;
}

/**
 * Bundles parse -> choose -> apply -> append for the fully offline path (no
 * model at all) and for the "Tiny Model" experimental path's own safe
 * fallback. Never used while a capable model is actively narrating a turn —
 * that path calls `applyLegalOutcome`/`appendExchange` directly once the
 * model's chosen outcome has been validated and its narration has finished
 * streaming, so a cancelled generation never reaches here.
 */
export function applyDeterministicAction(
  state: GameState,
  rawInput: string,
  /** Pass true when this call is itself a fallback from a failed/unavailable AI turn attempt, so the history entry is honestly labeled — never true for genuinely offline play. */
  requiredFallback = false,
): DeterministicActionResult {
  if (state.status !== "playing") {
    throw new Error("Cannot act after the game has ended");
  }

  if (isInventoryCheck(rawInput, state.inventory)) {
    return { state, narration: buildInventoryNarration(state), free: true };
  }

  const action = parseFreeText(rawInput, state.inventory);
  const legal = getLegalOutcomes(state);
  const chosen = chooseDeterministicOutcome(action, state, legal);
  const { state: appliedState } = applyLegalOutcome(state, chosen);
  const finalState = appendExchange(
    appliedState,
    rawInput,
    chosen.fallbackNarration,
    false,
    requiredFallback,
  );
  return {
    state: finalState,
    narration: chosen.fallbackNarration,
    free: false,
  };
}
