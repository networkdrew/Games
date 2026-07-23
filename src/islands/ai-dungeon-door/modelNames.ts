/** Friendly display names for known LM Studio model ids — falls back to the raw id for anything unrecognized. */
const FRIENDLY_NAMES: Record<string, string> = {
  "ornith-1.0-9b": "Ornith 9B",
  "qwen/qwen3.5-9b": "Qwen3.5 9B",
  "granite-4.1-8b": "Granite 4.1 8B",
  "google/gemma-4-e4b": "Gemma 4 e4B",
  "qwen2.5-0.5b-instruct": "Tiny (0.5B)",
  "smollm2-360m-instruct": "Tiny (360M)",
};

export function friendlyModelName(modelId: string | null | undefined): string {
  if (!modelId) return "unknown model";
  return FRIENDLY_NAMES[modelId] ?? modelId;
}
