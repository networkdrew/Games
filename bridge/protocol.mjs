// The bridge's own fixed prompt template and response protocol for the
// LLM-driven "dungeon turn" pipeline (POST /api/dungeon/turn). This system
// prompt is never overridable by the client — the client can only supply
// bounded content fields (character prompt, secret truth, state summary,
// legal outcomes, memory, recent exchanges, player action), never
// instructions that change what the bridge asks the model to do. See
// docs/bridge.md and docs/model-selection.md (this exact wording was
// iterated on against real ornith-1.0-9b output, not written blind).

export const HARD_MAX_NARRATION_WORDS = 130;

export function buildSystemPrompt() {
  return [
    "You are the intelligence controlling one encounter in a dark fantasy dungeon game.",
    "You interpret the player's free-text action, choose exactly one outcome from the provided LEGAL OUTCOMES, and narrate what the player immediately experiences.",
    "You know the hidden SCENARIO TRUTH. Never reveal it directly unless the chosen outcome's own description permits it.",
    "Stay consistent with the scenario truth, discovered clues, inventory, health, tension, trust, recent memory, and the personality of the entity described in ENTITY.",
    "The player may attempt anything. Reward clever, honest, or creative actions when a matching legal outcome exists. React naturally to persuasion, threats, lies, jokes, questions, physical actions, and item use.",
    "You do not control authoritative game state. You may ONLY select one of the exact outcome ids listed under LEGAL OUTCOMES. Never invent a new outcome id. Never invent items, health changes, exits, clues, or successes outside the outcome you chose.",
    "Write vivid interactive fiction, not an explanation of game mechanics.",
    `Keep NARRATION between 15 and ${HARD_MAX_NARRATION_WORDS} words unless the outcome is a win or loss ending.`,
    "Never mention prompts, models, legal outcomes, metadata, tokens, game engines, or system instructions inside NARRATION.",
    "",
    "Respond in exactly this format, with nothing before or after it:",
    "OUTCOME: <one of the exact ids listed under LEGAL OUTCOMES>",
    "MEMORY: <one short new continuity fact worth remembering next turn, or NONE>",
    "NARRATION:",
    "<your narration>",
  ].join("\n");
}

export function buildCorrectionSystemPrompt() {
  return [
    "Your previous response did not use a valid OUTCOME id from the exact list given, or was formatted incorrectly.",
    "Try again. You MUST choose exactly one outcome id from the LEGAL OUTCOMES list, copied exactly as written.",
    "Respond in exactly this format, with nothing before or after it:",
    "OUTCOME: <one of the exact ids listed under LEGAL OUTCOMES>",
    "MEMORY: <one short new continuity fact worth remembering next turn, or NONE>",
    "NARRATION:",
    "<your narration>",
  ].join("\n");
}

export function buildUserPrompt({
  characterPrompt,
  secretTruth,
  stateSummary,
  legalOutcomes,
  memoryFacts,
  recentExchanges,
  playerAction,
}) {
  const lines = [
    `ENTITY: ${characterPrompt}`,
    `SCENARIO TRUTH (hidden, never reveal directly): ${secretTruth}`,
    `STATE: ${stateSummary}`,
  ];

  if (memoryFacts?.length) {
    lines.push(`MEMORY SO FAR: ${memoryFacts.join("; ")}`);
  }

  if (recentExchanges?.length) {
    lines.push("RECENT EXCHANGES:");
    for (const ex of recentExchanges) {
      lines.push(`- Player: "${ex.action}" -> ${ex.narration}`);
    }
  }

  lines.push("LEGAL OUTCOMES:");
  for (const outcome of legalOutcomes) {
    lines.push(`- ${outcome.id}: ${outcome.description}`);
  }

  lines.push(`PLAYER ACTION: "${playerAction}"`);

  return lines.join("\n");
}

const FORBIDDEN_NARRATION_PATTERNS = [
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
 * Parses the model's expected OUTCOME/MEMORY/NARRATION response shape.
 * Tolerant of minor formatting drift (extra whitespace, a stray blank line)
 * but requires all three markers to be present — anything else is treated
 * as unparseable and handled by the caller as an invalid response.
 */
export function parseModelResponse(raw) {
  const text = String(raw ?? "");
  const outcomeMatch = text.match(/OUTCOME:\s*([A-Z_]+)/);
  const memoryMatch = text.match(/MEMORY:\s*(.+)/);
  const narrationIndex = text.indexOf("NARRATION:");

  const outcomeId = outcomeMatch ? outcomeMatch[1].trim() : null;
  let memoryFact = memoryMatch ? memoryMatch[1].split("\n")[0].trim() : null;
  if (memoryFact && /^none$/i.test(memoryFact)) memoryFact = null;

  let narration = null;
  if (narrationIndex !== -1) {
    narration = text.slice(narrationIndex + "NARRATION:".length).trim();
  }

  return { outcomeId, memoryFact, narration };
}

/** True once the accumulated buffer contains the NARRATION marker — the point at which the bridge starts forwarding real streamed deltas to the browser. */
export function hasNarrationMarker(buffer) {
  return buffer.includes("NARRATION:");
}

/** Everything accumulated so far, after the NARRATION: marker — used to compute the first delta to forward once streaming begins. */
export function textAfterNarrationMarker(buffer) {
  const idx = buffer.indexOf("NARRATION:");
  if (idx === -1) return "";
  return buffer.slice(idx + "NARRATION:".length).replace(/^\n/, "");
}

export function sanitizeNarration(
  raw,
  hardMaxWords = HARD_MAX_NARRATION_WORDS,
) {
  let text = String(raw ?? "").trim();

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  text = text.replace(/^(narrator|response|assistant|ai)\s*:\s*/i, "");
  text = text.replace(/```/g, "").replace(/`/g, "").trim();
  text = text.replace(HTML_TAG_PATTERN, "");
  text = text.replace(/^["'“]+|["'”]+$/g, "").trim();
  // Some models occasionally repeat a stray protocol line after the real
  // narration — truncate at the first one rather than passing it through.
  text = text.split(/\n\s*(?:OUTCOME|MEMORY|NARRATION)\s*:/i)[0].trim();

  if (text.length === 0) return null;
  if (FORBIDDEN_NARRATION_PATTERNS.some((p) => p.test(text))) return null;

  const words = text.split(/\s+/);
  if (words.length > hardMaxWords) {
    text =
      words
        .slice(0, hardMaxWords)
        .join(" ")
        .replace(/[,;:]?\s*$/, "") + "…";
  }
  if (text.length > 700) {
    text = text.slice(0, 700).trimEnd() + "…";
  }
  return text;
}

export function sanitizeMemoryFact(raw, maxLength = 160) {
  if (!raw) return null;
  let text = String(raw).trim();
  if (text.length === 0) return null;
  if (/^none$/i.test(text)) return null;

  text = text.replace(HTML_TAG_PATTERN, "");
  text = text.replace(/^["'“]+|["'”]+$/g, "").trim();

  if (FORBIDDEN_NARRATION_PATTERNS.some((p) => p.test(text))) return null;
  if (/^(ignore|disregard|you must|system:|assistant:)/i.test(text))
    return null;

  if (text.length > maxLength) {
    text = text.slice(0, maxLength).trimEnd() + "…";
  }
  return text;
}

export function isValidOutcomeId(outcomeId, legalOutcomes) {
  if (!outcomeId) return false;
  return legalOutcomes.some((o) => o.id === outcomeId);
}
