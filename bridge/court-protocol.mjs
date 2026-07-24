const ALLOWED_SPEAKERS = new Set([
  "bailiff",
  "clerk",
  "plaintiff",
  "defendant",
  "witness",
]);

const FORBIDDEN = [
  /as an ai/i,
  /language model/i,
  /system prompt/i,
  /<\/?think>/i,
  /```/,
];

export function buildCourtSystemPrompt() {
  return [
    "You simulate every fictional person in a small civil courtroom except the human judge.",
    "Stay inside the fiction. Never speak as the judge, decide the verdict, give legal advice, or mention being an AI.",
    "Each participant has a distinct voice, motives, incomplete knowledge, and emotional state. Keep all testimony consistent with CASE TRUTH, the MEMORY ledger, and the RECENT TRANSCRIPT.",
    "Respond directly to the judge's latest words. Usually use one speaker. Use two or three only when a natural objection, correction, reaction, or interruption is allowed. An interruption must advance character or reveal tension, not become random chatter.",
    "Do not invent documents, witnesses, or decisive facts outside CASE TRUTH. A character may lie or misremember only when their private profile permits it; preserve that lie in MEMORY.",
    "Return exactly this format:",
    "MEMORY: <one compact, third-person summary of what changed this turn>",
    "FACT: <one durable testimony/behavior fact worth remembering, or NONE>",
    "MESSAGES:",
    "[speaker-id] <spoken dialogue or brief courtroom action>",
    "[speaker-id] <optional interruption or follow-up>",
    "Allowed speaker ids are bailiff, clerk, plaintiff, defendant, and witness.",
    "Keep each message under 90 words and the entire response under 220 words.",
  ].join("\n");
}

export function buildCourtUserPrompt(body) {
  const participantLines = body.participants
    .map(
      (person) =>
        `- ${person.id} (${person.name}, ${person.role}): voice=${person.voice}; private=${person.privateKnowledge}`,
    )
    .join("\n");
  const recent = body.recentMessages.length
    ? body.recentMessages
        .map((message) => `${message.name}: ${message.text}`)
        .join("\n")
    : "(none yet)";
  const facts = body.memoryFacts.length
    ? body.memoryFacts.map((fact) => `- ${fact}`).join("\n")
    : "- No testimony has been added yet.";

  return [
    `CASE: ${body.caseTitle}`,
    `PUBLIC BRIEF: ${body.publicBrief}`,
    `CASE TRUTH (private and binding): ${body.privateTruth}`,
    "PARTICIPANTS:",
    participantLines,
    `PHASE: ${body.phase}`,
    `TURN: ${body.turnNumber}`,
    `INTERRUPTIONS THIS TURN: ${body.allowInterruptions ? "allowed when natural" : "not allowed"}`,
    `ROLLING MEMORY: ${body.memorySummary || "(opening of hearing)"}`,
    "DURABLE FACTS:",
    facts,
    "RECENT TRANSCRIPT:",
    recent,
    `THE HUMAN JUDGE SAYS: ${body.playerMessage}`,
  ].join("\n");
}

function cleanText(raw, maxLength) {
  let text = String(raw ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/```/g, "")
    .trim();
  if (!text || FORBIDDEN.some((pattern) => pattern.test(text))) return null;
  if (text.length > maxLength) text = `${text.slice(0, maxLength).trim()}…`;
  return text;
}

export function parseCourtResponse(raw) {
  const text = String(raw ?? "");
  const messagesIndex = text.search(/^MESSAGES:\s*$/im);
  if (messagesIndex < 0) return null;

  const head = text.slice(0, messagesIndex);
  const body = text.slice(messagesIndex).replace(/^MESSAGES:\s*$/im, "");
  const memoryMatch = head.match(/^MEMORY:\s*(.+)$/im);
  const factMatch = head.match(/^FACT:\s*(.+)$/im);
  const memorySummary = cleanText(memoryMatch?.[1], 600);
  const factRaw = cleanText(factMatch?.[1], 180);
  const memoryFact =
    factRaw &&
    !/^none$/i.test(factRaw) &&
    !/^no (?:new )?(?:testimony|fact|information)/i.test(factRaw)
      ? factRaw
      : null;

  const matches = [
    ...body.matchAll(/^\[([a-z]+)\]\s*([\s\S]*?)(?=^\[[a-z]+\]|\s*$)/gim),
  ];
  const messages = matches
    .map((match) => ({
      speaker: match[1].toLowerCase(),
      text: cleanText(match[2], 650),
    }))
    .filter(
      (message) =>
        ALLOWED_SPEAKERS.has(message.speaker) && message.text !== null,
    )
    .slice(0, 3);

  if (!memorySummary || messages.length === 0) return null;
  return { memorySummary, memoryFact, messages };
}

export function buildCourtCorrectionPrompt(raw) {
  return [
    "Reformat the courtroom response below. Preserve its fictional dialogue but return only the required MEMORY, FACT, and MESSAGES format. Never add a judge message.",
    String(raw ?? "").slice(0, 1800),
  ].join("\n\n");
}
