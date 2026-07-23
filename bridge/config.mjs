// Local-only configuration for the AI Dungeon Door bridge. Everything here
// is deliberately hardcoded/env-overridable, never accepted from an
// incoming request — see server.mjs and docs/bridge.md.

export const HOST = process.env.BRIDGE_HOST ?? "127.0.0.1"; // loopback only by default, on purpose
export const PORT = Number(process.env.BRIDGE_PORT ?? 8934);

export const LM_STUDIO_URL =
  process.env.LM_STUDIO_URL ?? "http://127.0.0.1:1234";

/**
 * The normal, default gameplay tier: a capable instruct model that can
 * actually interpret free-text actions and roleplay a character, not just
 * cosmetically rewrite a line. In priority order — the first one LM Studio
 * actually reports (via GET /v1/models) is used, never assumed. See
 * docs/model-selection.md for why this order and what was tested.
 *
 * `ornith-1.0-9b` and `qwen/qwen3.5-9b` were confirmed live on this machine.
 * The next two are untested placeholders for "another capable installed
 * 7B-10B instruct model" per the project's own fallback priority — replace
 * or reorder them once you've actually verified one works well here.
 */
export const PRIMARY_MODEL_PRIORITY = process.env.BRIDGE_MODEL
  ? [process.env.BRIDGE_MODEL]
  : [
      "ornith-1.0-9b",
      "qwen/qwen3.5-9b",
      "granite-4.1-8b",
      "google/gemma-4-e4b",
    ];

/** The explicitly-labeled experimental "Tiny Model / Low Power" tier — never selected automatically for normal play. */
export const TINY_MODEL_PRIORITY = process.env.BRIDGE_TINY_MODEL
  ? [process.env.BRIDGE_TINY_MODEL]
  : ["qwen2.5-0.5b-instruct", "smollm2-360m-instruct"];

export const ALLOWED_ORIGINS = [
  "https://games.drewcassidy.dev",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "http://localhost:4322",
  "http://127.0.0.1:4322",
];

export const MAX_BODY_BYTES = 12_000; // the full turn payload (state summary, legal outcomes, memory, recent exchanges) is bigger than the old cosmetic-narrate payload, still tightly capped
export const MAX_FIELD_LENGTH = 800; // per-field cap (characterPrompt, secretTruth)
export const MAX_STATE_SUMMARY_LENGTH = 400;
export const MAX_LEGAL_OUTCOMES = 12;
// A real scenario description was found live at 221 chars — one over a
// previous 220 cap — silently rejecting the whole turn request. Raised
// with real headroom; this cap exists to bound a buggy/adversarial client,
// not to micromanage scenario prose length.
export const MAX_OUTCOME_DESCRIPTION_LENGTH = 320;
export const MAX_MEMORY_FACTS = 8;
export const MAX_MEMORY_FACT_LENGTH = 160;
export const MAX_RECENT_EXCHANGES = 5;
// Narration itself is capped at ~700 chars by sanitizeNarration/sanitizeNarrationText
// (HARD_MAX_NARRATION_WORDS ≈ 130 words), so recentExchanges entries need
// headroom above that, not below it. A too-small cap here was found live
// against ornith-1.0-9b: a normal ~100-word response (600+ chars) got
// silently rejected by request validation, causing an unnecessary
// deterministic-fallback turn — see docs/model-selection.md.
export const MAX_EXCHANGE_FIELD_LENGTH = 900;
export const MAX_PLAYER_ACTION_LENGTH = 400;

/** Mirrors types.ts's LegalOutcomeId union — duplicated intentionally, same reason bridge/protocol.mjs duplicates narration.ts instead of importing it: the bridge is a separate, dependency-free JS runtime with no TypeScript build step. Used only to reject a request whose "legal outcome" ids aren't even in the known vocabulary — the actual legality check (is this id legal *right now*) still comes entirely from the client-supplied list. */
export const KNOWN_OUTCOME_IDS = [
  "NO_EFFECT",
  "REVEAL_SOUND_CLUE",
  "REVEAL_VISUAL_CLUE",
  "DOOR_RESPONDS",
  "ENTITY_ANGER_INCREASES",
  "ENTITY_TRUST_INCREASES",
  "TAKE_MINOR_DAMAGE",
  "TAKE_MAJOR_DAMAGE",
  "GAIN_ITEM",
  "USE_ITEM_SUCCESS",
  "USE_ITEM_FAILURE",
  "UNLOCK_STAGE_ONE",
  "OPEN_DOOR",
  "ESCAPE",
  "PLAYER_DEFEATED",
];

// Requested from the model — narration + short OUTCOME/MEMORY header. Seen
// live: a genuinely good, dramatic ornith-1.0-9b response got cut off
// mid-sentence at 175/180 tokens on a longer multi-turn payoff. 240 gives
// real headroom while staying well short of a wasteful/rambling response.
export const MAX_TOKENS = 240;
export const HARD_MAX_NARRATION_WORDS = 130; // absolute ceiling enforced on the parsed narration text
export const LM_STUDIO_TIMEOUT_MS = 20_000; // a 9B model's full generation, not just a health check
export const MIN_REQUEST_INTERVAL_MS = 800; // simple per-process rate limit; also enforces "one active request at a time"

/**
 * Some installed models (Ornith included) are "reasoning" models that emit
 * a hidden chain-of-thought via a separate `reasoning_content` field and
 * will silently burn the entire token budget on it — producing empty
 * `content` — unless reasoning is explicitly disabled. Both parameters
 * below were required together in live testing against ornith-1.0-9b (see
 * docs/model-selection.md); harmless extra fields for models that don't
 * support them.
 */
export const REASONING_DISABLE_PARAMS = {
  chat_template_kwargs: { enable_thinking: false },
  reasoning_effort: "none",
};
