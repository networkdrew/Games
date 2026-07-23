/**
 * All authoritative game state and outcome shapes for AI Dungeon Door.
 *
 * Architecture (two parallel paths, see docs/architecture.md):
 *
 * 1. **The free-form AI path** (normal play, model connected): the model is
 *    the game master. It interprets the player's free-text action however
 *    it judges best, and proposes a `ControlProposal` — small, bounded
 *    numeric deltas plus optional clue/item/ending picks from
 *    scenario-defined allowlists. The engine (`applyControlProposal`) never
 *    trusts the proposal blindly: every field is clamped to the scenario's
 *    `StateBounds`, every id is checked against the scenario's own
 *    allowlists, and an ending is only ever accepted if the scenario's own
 *    `checkEnding` predicate agrees it's currently reachable. The model
 *    never touches `GameState` directly.
 * 2. **The deterministic path** (offline play, or the final safe fallback
 *    after a malformed AI response can't be corrected): the original
 *    closed-vocabulary `LegalOutcome` system below, unchanged. It exists
 *    purely so the game is always playable with zero AI, and so a failed AI
 *    turn always has an identical, always-reliable place to land.
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
  /** 0-100 trust the entity has in the player; gates the more cooperative outcomes (including most wins/endings). */
  trust: number;
  /** Scenario-internal progress flag (0 = nothing unlocked yet, 1 = a stage-one condition has been met). */
  stage: number;
  inventory: string[];
  clues: string[];
  history: EventEntry[];
  status: GameStatus;
  /** Bounded rolling memory of continuity facts (promises, lies, discoveries) — capped, see engine.ts's MEMORY_CAP. */
  memory: MemoryFact[];
  /** Last few action/narration pairs, capped — sent to the model for short-term continuity without resending the whole transcript. */
  recentExchanges: RecentExchange[];
  /** Set once, on win/loss, to a deterministic ending line — never re-narrated by the model. */
  ending?: string;
  /** True once the model has generated (and the player has received) the opening scene for this run. */
  openingDelivered: boolean;
}

// ---------------------------------------------------------------------------
// Free-form AI game-master protocol (see module docstring above).
// ---------------------------------------------------------------------------

/** Symmetric per-turn magnitude caps the engine enforces on the model's proposed numeric deltas — never sent as "permission" for the full range, just a clamp ceiling. */
export interface StateBounds {
  maxHealthDelta: number;
  maxTensionDelta: number;
  maxTrustDelta: number;
}

/** One clue or item the model is allowed to award — id is the only thing the wire protocol/engine trusts; `hint` is player-invisible authoring context for the model's own judgment, never validated. */
export interface AllowlistEntry {
  id: string;
  hint: string;
}

export type EndingKind = "WIN" | "LOSS";

export interface EndingDef {
  id: string;
  kind: EndingKind;
  /** Plain-language condition shown to the model, describing when this ending is earned — the engine's own `checkEnding` is what actually gates it, this is context only. */
  hint: string;
}

/** Static, author-time character/scenario depth — never sent to the model verbatim in full; `buildCharacterPrompt`/`buildScenarioBriefing` in scenarios.ts compress this into the bounded prompt fields actually sent over the wire. */
export interface EntityProfile {
  identity: string;
  personality: string;
  goals: string;
  fear: string;
  desire: string;
  /** The entity's starting stance toward the player. */
  relationship: string;
  voice: string;
}

/**
 * The model's proposed consequence of one player turn — analogous to
 * `StateChangeSpec` but proposed by the model and always clamped/validated
 * by the engine before it can affect `GameState`, never applied as-is.
 */
export interface ControlProposal {
  /** Model's short interpretation of what the player attempted — diagnostics only, never shown to the player, never trusted for anything mechanical. */
  intent: string;
  healthDelta: number;
  tensionDelta: number;
  trustDelta: number;
  discoverClue: string | null;
  gainItem: string | null;
  consumeItem: string | null;
  advanceStage: boolean;
  ending: EndingKind | null;
  memory: string | null;
}

export interface ApplyControlResult {
  state: GameState;
  snapped: boolean;
  /** Fields the engine rejected/clamped this turn, for diagnostics — never shown to the player. */
  corrections: string[];
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  /** Compact character prompt (identity, personality, goals, what it knows/wants, what angers/earns trust, speech style) handed to the model. Never the secret itself. Authored directly, consistent with (but not mechanically derived from) the richer `entity`/`environment`/`objects` fields below. */
  doorPersonality: string;
  /** Hidden scenario truth — sent to the model as private context so it can roleplay consistently, but instructed never to reveal it directly. Never shown to the player except through the model's own narration or a legal outcome's fallback text. */
  secretTruth: string;
  /** Deterministic opening line shown at run start when offline, or while the model's own opening scene is still streaming in. */
  intro: string;
  startingInventory: string[];
  maxTurns: number;
  maxHealth: number;

  // --- Free-form AI game-master protocol (see types.ts module docstring) ---
  entity: EntityProfile;
  environment: string;
  objects: string[];
  factsKnown: string[];
  factsRevealable: string[];
  factsHidden: string[];
  memoryPriorities: string[];
  bounds: StateBounds;
  clueAllowlist: AllowlistEntry[];
  itemAllowlist: AllowlistEntry[];
  endings: EndingDef[];
  /** Engine-side authority on whether a model-proposed ending is currently reachable — the model's `ending` field is only ever a *request*, never a grant. */
  checkEnding: (state: GameState, kind: EndingKind) => boolean;

  // --- Deterministic path (offline play, and the final safe fallback) ---
  /** Pure function: the full set of outcomes that are legal right now, given scenario progress so far. */
  getLegalOutcomes: (state: GameState) => LegalOutcome[];
  /**
   * Deterministic outcome chooser, used only when no model is available
   * (offline fallback) or as the final safe pick after two invalid model
   * attempts. Never used while a model is actively narrating a turn.
   */
  chooseDeterministicOutcome: (
    action: ParsedAction,
    state: GameState,
    legal: LegalOutcome[],
  ) => LegalOutcome;
}
