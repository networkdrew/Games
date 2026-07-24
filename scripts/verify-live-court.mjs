import {
  buildCourtSpeakerSystemPrompt,
  buildCourtSpeakerUserPrompt,
  parseCourtControl,
  sanitizeCourtDialogue,
  textAfterCourtResponseMarker,
} from "../bridge/court-protocol.mjs";
import {
  chatCompletionOnce,
  ensureModelLoaded,
  resolveAlias,
} from "../bridge/lmstudio.mjs";
import { MODEL_ALIAS } from "../bridge/models.mjs";

const config = await resolveAlias(MODEL_ALIAS);
if (!config) {
  console.error(`Configured model for ${MODEL_ALIAS} is not installed.`);
  process.exitCode = 1;
} else {
  await ensureModelLoaded(config);
  const body = {
    caseId: "orchid-window",
    caseTitle: "The Orchid and the Open Window",
    publicBrief:
      'Mara Venn seeks $420 after her orchid froze. Exhibits: the care card says "One cup Wednesday. Do not move from the blue table" but does not mention the window; Ellis texted that the room smelled damp so Ellis opened the window; the superintendent recorded the window closed before Ellis visited.',
    privateTruth:
      "Ellis opened the window after watering the orchid and forgot to close it. The freeze killed the orchid. Mara knows her care card omitted a window instruction. Ellis initially minimizes the mistake but admits it when confronted with the text.",
    participants: [
      {
        id: "bailiff",
        name: "Bailiff Arden",
        role: "Bailiff",
        voice: "formal and concise",
        privateKnowledge: "No private case knowledge.",
      },
      {
        id: "clerk",
        name: "Clerk Sol",
        role: "Court clerk",
        voice: "neutral and procedural",
        privateKnowledge: "Knows the public record.",
      },
      {
        id: "plaintiff",
        name: "Mara Venn",
        role: "Plaintiff and orchid collector",
        voice: "precise, controlled, emotionally attached to the orchid",
        privateKnowledge:
          "Mara knows the care card omitted the window and concedes that when asked directly.",
      },
      {
        id: "defendant",
        name: "Ellis Rowe",
        role: "Defendant and neighbor",
        voice: "friendly but defensive, with short explanations",
        privateKnowledge:
          "Ellis opened the window and forgot it, but initially minimizes the mistake.",
      },
      {
        id: "witness",
        name: "Ivo Chen",
        role: "Building superintendent",
        voice: "matter-of-fact and observant",
        privateKnowledge:
          "Ivo recorded the window closed before Ellis visited but did not see who opened it.",
      },
    ],
    phase: "hearing",
    turnNumber: 2,
    speakerSequence: ["defendant"],
    playerMessage:
      process.argv.slice(2).join(" ") ||
      "Ellis, explain why you opened the window without permission.",
    memorySummary:
      "The case was called. Mara blamed Ellis for the frozen orchid. Ellis denied receiving a window instruction.",
    memoryFacts: [
      "Mara admits her written care card did not mention the window.",
    ],
    recentMessages: [
      {
        name: "Mara Venn",
        text: "The plant was healthy when I left.",
      },
      {
        name: "Ellis Rowe",
        text: "I followed the written card exactly.",
      },
    ],
  };

  const activeParticipant = body.participants[3];
  const raw = await chatCompletionOnce({
    modelId: config.lmStudioId,
    systemPrompt: buildCourtSpeakerSystemPrompt(activeParticipant),
    userPrompt: buildCourtSpeakerUserPrompt(body, activeParticipant),
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    topP: config.topP,
    stop: config.stopSequences,
    reasoningDisableParams: config.reasoningDisableParams,
  });

  console.log("RAW RESPONSE");
  console.log(raw);
  console.log("\nPARSED RESPONSE");
  const parsed = {
    ...parseCourtControl(raw),
    dialogue: sanitizeCourtDialogue(textAfterCourtResponseMarker(raw)),
  };
  console.dir(parsed, { depth: null });
  if (!parsed.memorySummary || !parsed.dialogue) process.exitCode = 2;
}
