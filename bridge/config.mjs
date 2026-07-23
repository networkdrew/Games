// Local-only configuration for the AI Dungeon Door bridge. Everything here
// is deliberately hardcoded/env-overridable, never accepted from an
// incoming request — see server.mjs and docs/bridge.md.

export const HOST = process.env.BRIDGE_HOST ?? "127.0.0.1"; // loopback only by default, on purpose
export const PORT = Number(process.env.BRIDGE_PORT ?? 8934);

export const LM_STUDIO_URL =
  process.env.LM_STUDIO_URL ?? "http://127.0.0.1:1234";

/** Preferred model id, in priority order. First one LM Studio actually reports is used — never assumed. */
export const PREFERRED_MODEL_IDS = process.env.BRIDGE_MODEL
  ? [process.env.BRIDGE_MODEL]
  : ["qwen2.5-0.5b-instruct", "smollm2-360m-instruct"];

export const ALLOWED_ORIGINS = [
  "https://games.drewcassidy.dev",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "http://localhost:4322",
  "http://127.0.0.1:4322",
];

export const MAX_BODY_BYTES = 4_000; // generous for the tiny narrate payload, tight enough to reject abuse
export const MAX_FIELD_LENGTH = 600; // per-field cap on doorPersonality/outcomeSummary
export const MAX_TOKENS = 60; // requested from the model
export const HARD_MAX_TOKENS = 70; // absolute ceiling, enforced both in the request and on the response
export const LM_STUDIO_TIMEOUT_MS = 10_000;
export const MIN_REQUEST_INTERVAL_MS = 1_200; // simple per-process rate limit; also enforces "one active request at a time"
