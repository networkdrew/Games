/**
 * All authoritative game state and outcome shapes for AI Dungeon Door.
 *
 * Architecture: the engine (this module + engine.ts + scenarios.ts) decides
 * the full set of outcomes that are *legal* right now — never the model.
 * The model's only two jobs are (1) interpret the player's free-text action
 * well enough to pick exactly one of those legal outcomes, and (2) narrate
 * it. The numeric/state consequence of each legal outcome (how much damage,
 * which clue, whether it wins) is baked into the `LegalOutcome` object by
 * the engine *before* the model ever sees it — the model can only select an
 * id from a fixed list, never invent a new one or its magnitude. See
 * docs/architecture.md's "critical architecture rule" section.
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

/**
 * The fixed vocabulary of outcomes the model (or the deterministic chooser)
 * may select from. Never extended per-request — this is the entire universe
 * of things that can ever happen, and the engine only ever offers the
 * subset that's legal for the current scenario/state as `LegalOutcome[]`.
 */
export type LegalOutcomeId =
  | "NO_EFFECT"
  | "REVEAL_SOUND_CLUE"
  | "REVEAL_VISUAL_CLUE"
  | "DOOR_RESPONDS"
  | "ENTITY_ANGER_INCREASES"
  | "ENTITY_TRUST_INCREASES"
  | "TAKE_MINOR_DAMAGE"
  | "TAKE_MAJOR_DAMAGE"
  | "GAIN_ITEM"
  | "USE_ITEM_SUCCESS"
  | "USE_ITEM_FAILURE"
  | "UNLOCK_STAGE_ONE"
  | "OPEN_DOOR"
  | "ESCAPE"
  | "PLAYER_DEFEATED";

/** The bounded, engine-decided state consequence of one legal outcome. Never chosen or sized by the model. */
export interface StateChangeSpec {
  damage?: number;
  tensionDelta?: number;
  trustDelta?: number;
  clueGained?: string;
  itemGained?: string;
  itemConsumed?: string;
  /** Advances the scenario's internal progress flag (gates later outcomes, e.g. a win becoming legal). */
  advancesStage?: boolean;
  isWin?: boolean;
  isLose?: boolean;
}

/**
 * One outcome the engine currently considers legal, with everything the
 * model needs to judge whether the player's action fits it (`description`,
 * `matchesIntents` as a hint) and everything the engine needs to apply it
 * once chosen (`change`) or narrate it without AI (`fallbackNarration`).
 */
export interface LegalOutcome {
  id: LegalOutcomeId;
  /** Plain-language description of when this outcome fits, shown to the model. Never reveals hidden scenario facts beyond what the outcome itself permits. */
  description: string;
  change: StateChangeSpec;
  /** Prewritten atmospheric line used verbatim in deterministic/fallback mode, or when the model's output fails validation. */
  fallbackNarration: string;
  /** Base intents this outcome is a good fit for — used only by the deterministic chooser, never sent to the model. */
  matchesIntents: BaseIntent[];
}

export interface EventEntry {
  turn: number;
  action: string;
  narration: string;
  /** True if `narration` came from a model rather than deterministic/fallback text. */
  aiNarrated: boolean;
  /** True if the model's first response was invalid and a corrected/fallback outcome had to be used instead. */
  requiredFallback: boolean;
}

export type GameStatus = "playing" | "won" | "lost";

/** One fact the entity/game should keep remembering across turns — capped and sanitized, never raw model output. */
export type MemoryFact = string;

export interface RecentExchange {
  action: string;
  narration: string;
}

export interface GameState {
  scenarioId: ScenarioId;
  seed: number;
  turn: number;
  maxTurns: number;
  health: number;
  maxHealth: number;
  /** 0-100 danger/tension level; rising tension shifts the entity's tone and raises the odds of a bad outcome. */
  tension: number;
  /** 0-100 trust the entity has in the player; gates the more cooperative outcomes (including most wins). */
  trust: number;
  /** Scenario-internal progress flag (0 = nothing unlocked yet, 1 = a stage-one condition has been met). */
  stage: number;
  inventory: string[];
  clues: string[];
  history: EventEntry[];
  status: GameStatus;
  suggestedActions: string[];
  /** Bounded rolling memory of continuity facts (promises, lies, discoveries) — capped, see engine.ts's MEMORY_CAP. */
  memory: MemoryFact[];
  /** Last few action/narration pairs, capped — sent to the model for short-term continuity without resending the whole transcript. */
  recentExchanges: RecentExchange[];
  /** Set once, on win/loss, to a deterministic ending line — never re-narrated by the model. */
  ending?: string;
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  /** Compact character prompt (identity, personality, goals, what it knows/wants, what angers/earns trust, speech style) handed to the model. Never the secret itself. */
  doorPersonality: string;
  /** Hidden scenario truth — sent to the model as private context so it can roleplay consistently, but instructed never to reveal it directly. Never shown to the player except through a legal outcome's own narration. */
  secretTruth: string;
  /** Deterministic opening line shown at run start (no model call needed to start a run). */
  intro: string;
  startingInventory: string[];
  startingSuggestions: string[];
  maxTurns: number;
  maxHealth: number;
  /** Pure function: the full set of outcomes that are legal right now, given scenario progress so far. */
  getLegalOutcomes: (state: GameState) => LegalOutcome[];
  /**
   * Deterministic outcome chooser, used only when no model is available
   * (offline fallback) or as the final safe pick after two invalid model
   * attempts. Never used while a model is actively narrating.
   */
  chooseDeterministicOutcome: (
    action: ParsedAction,
    state: GameState,
    legal: LegalOutcome[],
  ) => LegalOutcome;
}
