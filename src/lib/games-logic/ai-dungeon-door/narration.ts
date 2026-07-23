import type { Outcome } from "./types";

/**
 * Everything needed to build the tiny prompt sent to the local model, and to
 * turn its raw text back into something safe to show. The model is asked to
 * do exactly one thing: rewrite an already-decided outcome into one short
 * atmospheric line. It never receives the full transcript, game state, or
 * anything it could use to invent its own outcome — see docs/bridge.md.
 */

export const MAX_NARRATION_TOKENS = 60;
export const HARD_MAX_NARRATION_TOKENS = 70;

export interface NarrationContext {
  doorPersonality: string;
  tension: number;
  outcome: Outcome;
}

/**
 * Compact system prompt establishing tone and the exact output contract:
 * one short sentence or two, describing ONLY the given outcome, no
 * formatting, no meta-commentary. Kept intentionally tiny — the whole
 * point is that a ~0.5B model can follow it. Deliberately has no few-shot
 * example: testing against qwen2.5-0.5b-instruct showed it would echo an
 * in-prompt example almost verbatim regardless of the real outcome (see
 * docs/model-selection.md) — dropping the example and using OUTCOME/DOOR
 * PERSONALITY/TENSION labels instead measurably reduced that drift.
 */
export function buildSystemPrompt(): string {
  return [
    "You are the narrator of a dungeon-door text adventure game.",
    "Each turn you receive an OUTCOME describing something that just happened. Your ONLY job is to describe that exact OUTCOME in 1-2 short, atmospheric sentences, second person, present tense.",
    "Do not invent new events. Only describe the OUTCOME given below.",
    "No markdown, no quotation marks, no prefixes.",
  ].join("\n");
}

export function buildUserPrompt(ctx: NarrationContext): string {
  const tensionWord =
    ctx.tension >= 70 ? "very tense" : ctx.tension >= 35 ? "tense" : "calm";
  return [
    `DOOR PERSONALITY: ${ctx.doorPersonality}`,
    `TENSION: ${tensionWord}`,
    `OUTCOME: ${ctx.outcome.summary}`,
    "Write 1-2 sentences describing ONLY this OUTCOME.",
  ].join("\n");
}

const FORBIDDEN_PATTERNS = [
  /as an ai/i,
  /language model/i,
  /<\/?think>/i,
  /^```/,
  /I cannot/i,
  /I can't help/i,
];

/**
 * Cleans raw model output: strips code fences/backticks, reasoning tags,
 * role prefixes, surrounding quotes, and collapses whitespace. Returns null
 * if the result is empty, too long, or matches a forbidden pattern — the
 * caller should fall back to `outcome.fallbackNarration` in that case.
 */
export function sanitizeNarration(raw: string): string | null {
  let text = raw.trim();

  // Strip a <think>...</think> reasoning block some models emit even when told not to.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Strip a leading role/label prefix like "Narrator:" or "Response:".
  text = text.replace(/^(narrator|response|assistant|ai)\s*:\s*/i, "");
  // Strip markdown code fence markers (keep the text inside them) and stray backticks.
  text = text.replace(/```/g, "").replace(/`/g, "").trim();
  // Strip wrapping quotes.
  text = text.replace(/^["'“]+|["'”]+$/g, "").trim();

  if (text.length === 0) return null;
  if (FORBIDDEN_PATTERNS.some((p) => p.test(text))) return null;

  const words = text.split(/\s+/);
  if (words.length > HARD_MAX_NARRATION_TOKENS) {
    text = words.slice(0, HARD_MAX_NARRATION_TOKENS).join(" ");
    // Avoid ending mid-sentence on a dangling word after truncation.
    text = text.replace(/[,;:]?\s*$/, "") + "…";
  }

  if (text.length > 400) {
    text = text.slice(0, 400).trimEnd() + "…";
  }

  return text;
}

/** The line actually shown to the player: sanitized model output, or the deterministic fallback if narration is missing/invalid. */
export function resolveNarration(
  outcome: Outcome,
  rawModelResponse: string | null,
): { text: string; aiNarrated: boolean } {
  if (rawModelResponse === null) {
    return { text: outcome.fallbackNarration, aiNarrated: false };
  }
  const sanitized = sanitizeNarration(rawModelResponse);
  if (sanitized === null) {
    return { text: outcome.fallbackNarration, aiNarrated: false };
  }
  return { text: sanitized, aiNarrated: true };
}
