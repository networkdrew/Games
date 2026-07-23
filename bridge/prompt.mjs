// Mirrors the shape of src/lib/games-logic/ai-dungeon-door/narration.ts, kept
// as a small standalone copy here on purpose: the bridge is a separate,
// dependency-free Node process (no TypeScript build step), so it never
// imports from src/. Keep the two in sync by hand if the prompt contract
// changes — see docs/bridge.md.

// No few-shot example on purpose: testing against qwen2.5-0.5b-instruct
// showed it would echo an in-prompt example almost verbatim regardless of
// the real outcome (see docs/model-selection.md). Using OUTCOME/DOOR
// PERSONALITY/TENSION labels instead of a worked example measurably reduced
// that drift.
export function buildSystemPrompt() {
  return [
    "You are the narrator of a dungeon-door text adventure game.",
    "Each turn you receive an OUTCOME describing something that just happened. Your ONLY job is to describe that exact OUTCOME in 1-2 short, atmospheric sentences, second person, present tense.",
    "Do not invent new events. Only describe the OUTCOME given below.",
    "No markdown, no quotation marks, no prefixes.",
  ].join("\n");
}

export function buildUserPrompt({ doorPersonality, tension, outcomeSummary }) {
  const tensionWord =
    tension >= 70 ? "very tense" : tension >= 35 ? "tense" : "calm";
  return [
    `DOOR PERSONALITY: ${doorPersonality}`,
    `TENSION: ${tensionWord}`,
    `OUTCOME: ${outcomeSummary}`,
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

export function sanitizeNarration(raw, hardMaxTokens) {
  let text = String(raw ?? "").trim();

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/^(narrator|response|assistant|ai)\s*:\s*/i, "");
  text = text.replace(/```/g, "").replace(/`/g, "").trim();
  text = text.replace(/^["'“]+|["'”]+$/g, "").trim();

  if (text.length === 0) return null;
  if (FORBIDDEN_PATTERNS.some((p) => p.test(text))) return null;

  const words = text.split(/\s+/);
  if (words.length > hardMaxTokens) {
    text =
      words
        .slice(0, hardMaxTokens)
        .join(" ")
        .replace(/[,;:]?\s*$/, "") + "…";
  }
  if (text.length > 400) {
    text = text.slice(0, 400).trimEnd() + "…";
  }
  return text;
}
