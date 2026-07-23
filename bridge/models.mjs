// Single source of truth for which LM Studio model backs the game, and the
// inference settings tuned for it. Nothing else in the bridge or client
// hardcodes a model identifier or per-model inference parameter — see
// docs/dungeon-chat-model-selection.md for how MODEL_ALIAS's target and
// these settings were chosen.
//
// The game only ever asks for the stable alias "dungeon-chat" — lmstudio.mjs
// resolves it to whichever real LM Studio identifier is configured below (or
// via BRIDGE_MODEL), and applies that model's own tuned settings on every
// request. This is the "per-model prompt/inference adapter" the game uses;
// there is deliberately only ever one *active* primary model at a time.

/** The stable identifier the game (client + bridge) always uses. Never the raw LM Studio id. */
export const MODEL_ALIAS = "dungeon-chat";
/** Explicit, clearly-labeled reference/fallback tier — never selected as the default. */
export const REFERENCE_ALIAS = "dungeon-chat-reference";
/** Explicit, clearly-labeled experimental low-power tier. */
export const TINY_ALIAS = "dungeon-chat-tiny";

/**
 * Per-model configuration. `lmStudioId` must be the exact id LM Studio
 * reports via GET /v1/models — never guessed. `reasoningDisableParams` is
 * sent on every request for models known to emit hidden chain-of-thought
 * unless told not to (see docs/model-selection.md for how this was found).
 */
const MODEL_CONFIGS = {
  // Winner of the live evaluation in docs/dungeon-chat-model-selection.md —
  // see that document for the full scorecard and why it beat every larger
  // and every other installed candidate, including the qwen/qwen3.5-9b
  // baseline this project was asked to start from (43% protocol success —
  // it does not win by default just for being the suggested starting point).
  [MODEL_ALIAS]: {
    lmStudioId: process.env.BRIDGE_MODEL ?? "allenai_sera-8b",
    temperature: 0.8,
    topP: 0.9,
    maxTokens: 220,
    contextLength: 8192,
    gpuOffload: "max",
    flashAttention: true,
    ttlSeconds: 900,
    stopSequences: [],
    // Not a reasoning model — harmless no-op params, kept for consistency
    // and in case a future re-evaluation swaps in a reasoning-tier model.
    reasoningDisableParams: {
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "none",
    },
  },
  [REFERENCE_ALIAS]: {
    lmStudioId: process.env.BRIDGE_REFERENCE_MODEL ?? "ornith-1.0-9b",
    temperature: 0.75,
    topP: 0.9,
    maxTokens: 240,
    contextLength: 8192,
    gpuOffload: "max",
    flashAttention: true,
    ttlSeconds: 900,
    stopSequences: [],
    reasoningDisableParams: {
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "none",
    },
  },
  [TINY_ALIAS]: {
    lmStudioId: process.env.BRIDGE_TINY_MODEL ?? "qwen2.5-0.5b-instruct",
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 200,
    contextLength: 4096,
    gpuOffload: "max",
    flashAttention: true,
    ttlSeconds: 600,
    stopSequences: [],
    reasoningDisableParams: {},
  },
};

export function getModelConfig(alias) {
  return MODEL_CONFIGS[alias] ?? null;
}

export function allAliases() {
  return Object.keys(MODEL_CONFIGS);
}

/** Friendly display names for the UI — never a raw LM Studio id shown to a normal player. */
export const FRIENDLY_NAMES = {
  "allenai_sera-8b": "Sera 8B",
  "qwen/qwen3.5-9b": "Qwen3.5 9B",
  "ornith-1.0-9b": "Ornith 9B",
  "qwen2.5-0.5b-instruct": "Tiny (0.5B)",
  "smollm2-360m-instruct": "Tiny (360M)",
  "granite-4.1-8b": "Granite 4.1 8B",
  "google/gemma-4-e4b": "Gemma 4 e4B",
  "glm-4-9b-0414": "GLM-4 9B",
};

export function friendlyModelName(lmStudioId) {
  return FRIENDLY_NAMES[lmStudioId] ?? lmStudioId;
}
