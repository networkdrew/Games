import type { LegalOutcome, LegalOutcomeId } from "./types";

/**
 * Client-side protocol helpers. The bridge (bridge/dungeonPrompt.mjs +
 * bridge/protocol.mjs) owns building the actual system/user prompt and
 * does the primary parsing/validation of the model's raw response — it has
 * to, since it's the one reading the live stream. Everything here is a
 * defense-in-depth second check the browser applies to whatever the bridge
 * hands back, and the sanitizers used verbatim for the offline/deterministic
 * path where there's no model response to parse at all (just an already
 * authored `LegalOutcome.fallbackNarration`).
 */

export const NARRATION_SOFT_MAX_WORDS = 90;
export const NARRATION_HARD_MAX_WORDS = 130;

const FORBIDDEN_PATTERNS = [
  /as an ai/i,
  /language model/i,
  /<\/?think>/i,
  /^```/,
  /I cannot/i,
  /I can't help/i,
  /\blegal outcomes?\b/i,
  /\bsystem prompt\b/i,
];

const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Cleans narration text of any source (model or fallback): strips HTML
 * tags, code fences, role prefixes, wrapping quotes, and enforces a hard
 * word cap. Returns null if the result is empty or matches a forbidden
 * meta-commentary pattern — callers should fall back to the outcome's
 * prewritten `fallbackNarration` in that case.
 */
export function sanitizeNarrationText(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let text = raw.trim();

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/^(narrator|response|assistant|ai)\s*:\s*/i, "");
  text = text.replace(/```/g, "").replace(/`/g, "").trim();
  text = text.replace(HTML_TAG_PATTERN, "");
  text = text.replace(/^["'“]+|["'”]+$/g, "").trim();
  // Some models occasionally repeat a stray protocol line (e.g. a second
  // "MEMORY:"/"OUTCOME:") after the real narration — seen live against
  // ornith-1.0-9b (see docs/model-selection.md). Truncate at the first one
  // rather than showing it to the player.
  text = text.split(/\n\s*(?:OUTCOME|MEMORY|NARRATION)\s*:/i)[0]!.trim();

  if (text.length === 0) return null;
  if (FORBIDDEN_PATTERNS.some((p) => p.test(text))) return null;

  const words = text.split(/\s+/);
  if (words.length > NARRATION_HARD_MAX_WORDS) {
    text =
      words
        .slice(0, NARRATION_HARD_MAX_WORDS)
        .join(" ")
        .replace(/[,;:]?\s*$/, "") + "…";
  }
  if (text.length > 700) {
    text = text.slice(0, 700).trimEnd() + "…";
  }
  return text;
}

const MAX_MEMORY_FACT_LENGTH = 140;

/**
 * Sanitizes a single continuity fact before it's added to the rolling
 * memory (see engine.ts's `pushMemoryFact`). Rejects anything that looks
 * like an instruction rather than a short factual statement, and caps
 * length so memory can never grow into a second transcript.
 */
export function sanitizeMemoryFact(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let text = raw.trim();
  if (text.length === 0) return null;
  if (/^none$/i.test(text)) return null;

  text = text.replace(HTML_TAG_PATTERN, "");
  text = text.replace(/^["'“]+|["'”]+$/g, "").trim();

  if (FORBIDDEN_PATTERNS.some((p) => p.test(text))) return null;
  // A memory fact should read like a statement, not an imperative directive
  // aimed at the model itself — reject anything that looks like a
  // prompt-injection attempt riding along in the "memory" field.
  if (/^(ignore|disregard|you must|system:|assistant:)/i.test(text))
    return null;

  if (text.length > MAX_MEMORY_FACT_LENGTH) {
    text = text.slice(0, MAX_MEMORY_FACT_LENGTH).trimEnd() + "…";
  }
  return text;
}

/** Confirms an outcome id the bridge claims the model chose is actually in the legal list for this turn — never trust the network layer alone. */
export function findValidatedOutcome(
  outcomeId: string | null | undefined,
  legal: readonly LegalOutcome[],
): LegalOutcome | null {
  if (!outcomeId) return null;
  return legal.find((o) => o.id === (outcomeId as LegalOutcomeId)) ?? null;
}
