// Local-only configuration for the AI Dungeon Door bridge. Everything here
// is deliberately hardcoded/env-overridable, never accepted from an
// incoming request — see server.mjs and docs/bridge.md. Per-model inference
// settings (temperature, tokens, TTL, etc.) live in models.mjs, not here.

export const HOST = process.env.BRIDGE_HOST ?? "127.0.0.1"; // loopback only by default, on purpose
export const PORT = Number(process.env.BRIDGE_PORT ?? 8934);

export const LM_STUDIO_URL =
  process.env.LM_STUDIO_URL ?? "http://127.0.0.1:1234";

export const ALLOWED_ORIGINS = [
  "https://games.drewcassidy.dev",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "http://localhost:4322",
  "http://127.0.0.1:4322",
];

// --- Request body caps (POST /api/dungeon/turn) ---------------------------
export const MAX_BODY_BYTES = 14_000;
// Court turns carry five bounded character profiles plus transcript memory.
// This cap matches the validator's worst-case accepted shape while remaining
// far below a general prompt/proxy payload.
export const MAX_COURT_BODY_BYTES = 24_000;
export const MAX_FIELD_LENGTH = 900; // characterPrompt, secretTruth, environment
export const MAX_STATE_SUMMARY_LENGTH = 400;
export const MAX_ALLOWLIST_ENTRIES = 16;
export const MAX_ALLOWLIST_HINT_LENGTH = 220;
export const MAX_MEMORY_FACTS = 8;
export const MAX_MEMORY_FACT_LENGTH = 160;
export const MAX_RECENT_EXCHANGES = 5;
// Narration itself is capped at ~700 chars by narration.ts's sanitizer (see
// HARD_MAX_NARRATION_WORDS), so recentExchanges entries need headroom above
// that, not below it — a too-small cap here previously caused a normal
// ~100-word response to be silently rejected as "too long" on the next
// turn's context (see docs/model-selection.md's "critical finding").
export const MAX_EXCHANGE_FIELD_LENGTH = 900;
export const MAX_PLAYER_ACTION_LENGTH = 500;

// --- Generation shape -------------------------------------------------------
export const HARD_MAX_NARRATION_WORDS = 130; // absolute ceiling enforced on parsed narration text
export const OPENING_MAX_WORDS = 150; // the opening scene is allowed a little more room to establish atmosphere
export const LM_STUDIO_TIMEOUT_MS = 25_000; // a 9B model's full generation, not just a health check
export const MODEL_LOAD_TIMEOUT_MS = 120_000; // cold-loading a multi-GB gguf can genuinely take this long
export const MIN_REQUEST_INTERVAL_MS = 800; // simple per-process rate limit; also enforces "one active request at a time"

// --- Idle unload -------------------------------------------------------------
// How long the bridge waits after the *bridge process itself* last served a
// turn before proactively releasing the model it loaded, as a backstop on
// top of LM Studio's own native `--ttl` (see models.mjs). Kept generous
// relative to the per-model TTL so LM Studio's own mechanism is normally
// what actually unloads it — see docs/bridge.md's TTL section.
export const IDLE_UNLOAD_CHECK_MS = 60_000;
