/**
 * All authoritative game state and outcome shapes for AI Dungeon Door. The
 * language model never sees or touches any of this directly — it only ever
 * receives a compact `NarrationRequest` built from an already-decided
 * `Outcome` (see narration.ts) and returns flavor text. Every field that
 * matters to winning or losing lives here, decided by engine.ts and the
 * scenario's own resolve() function, never by model output.
 */

export type ScenarioId =
  | "sleeping-creature"
  | "trapped-adventurer"
  | "mimic"
  | "cursed-vault"
  | "guard-password"
  | "flooding-chamber"
  | "sound-reactive"
  | "deceptive-spirit";

export type BaseIntent =
  | "listen"
  | "knock"
  | "look-under"
  | "search-wall"
  | "use-key"
  | "use-item"
  | "ask"
  | "force"
  | "offer"
  | "wait"
  | "inventory"
  | "freeform";

export interface ParsedAction {
  intent: BaseIntent;
  /** Extracted item name for "use-item" / "offer" (e.g. "rusty key", "bread"). */
  item?: string;
  raw: string;
}

export type OutcomeKind =
  | "neutral"
  | "clue"
  | "item-gained"
  | "item-consumed"
  | "damage"
  | "tension-only"
  | "win"
  | "lose";

/**
 * The deterministic, authoritative result of one player action. Everything
 * here is decided by game logic before the model is ever asked for
 * anything; the model only rewrites `summary`/`fallbackNarration` into one
 * atmospheric line (see narration.ts).
 */
export interface Outcome {
  kind: OutcomeKind;
  /** Compact factual description of what happened — the only game content sent to the model. */
  summary: string;
  /** Prewritten atmospheric line used verbatim if the model is unavailable or its response fails validation. */
  fallbackNarration: string;
  damage?: number;
  tensionDelta?: number;
  clueGained?: string;
  itemGained?: string;
  itemConsumed?: string;
  /** Suggested next actions shown as quick-pick chips (never the only way to act). */
  suggestedActions?: string[];
}

export interface EventEntry {
  turn: number;
  action: string;
  narration: string;
  /** True if `narration` came from the model rather than deterministic fallback. */
  aiNarrated: boolean;
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  scenarioId: ScenarioId;
  seed: number;
  turn: number;
  maxTurns: number;
  health: number;
  maxHealth: number;
  /** 0–100; rising tension shifts the door's tone and eventually pressures the player toward a mistake. */
  tension: number;
  inventory: string[];
  clues: string[];
  history: EventEntry[];
  status: GameStatus;
  suggestedActions: string[];
  /** Set once, on win/loss, to a deterministic ending line — never re-narrated by the model. */
  ending?: string;
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  /** Tone descriptor handed to the model as the door's "personality" — never the secret itself. */
  doorPersonality: string;
  /** Deterministic opening line shown at run start (no model call needed to start a run). */
  intro: string;
  startingInventory: string[];
  startingSuggestions: string[];
  maxTurns: number;
  maxHealth: number;
  /** Pure function: given the parsed action and current state, decide the real outcome. */
  resolve: (action: ParsedAction, state: GameState) => Outcome;
}
