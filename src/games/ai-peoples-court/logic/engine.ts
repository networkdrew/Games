import { courtCases, getCourtCase } from "./cases";
import type {
  CourtSession,
  CourtSpeaker,
  PartySide,
  TranscriptMessage,
} from "./types";

export function createCourtSession(caseIndex = 0): CourtSession {
  const normalizedIndex =
    ((caseIndex % courtCases.length) + courtCases.length) % courtCases.length;
  const courtCase = courtCases[normalizedIndex];
  if (!courtCase) throw new Error("AI People's Court has no cases");
  return {
    caseId: courtCase.id,
    transcript: [],
    memorySummary: "",
    memoryFacts: [],
    turnNumber: 0,
    verdict: null,
  };
}

export function addTranscriptMessage(
  session: CourtSession,
  message: Omit<TranscriptMessage, "id">,
): CourtSession {
  return {
    ...session,
    transcript: [
      ...session.transcript,
      {
        ...message,
        id: `${session.turnNumber}-${session.transcript.length}-${message.speaker}`,
      },
    ],
  };
}

export function addJudgeMessage(
  session: CourtSession,
  text: string,
): CourtSession {
  return addTranscriptMessage(session, {
    speaker: "judge",
    name: "You, Presiding Judge",
    text,
  });
}

export function applySimulatedTurn(
  session: CourtSession,
  messages: readonly {
    speaker: Exclude<CourtSpeaker, "judge">;
    name: string;
    text: string;
  }[],
  memorySummary: string,
  memoryFact: string | null,
): CourtSession {
  let next = session;
  messages.forEach((message, index) => {
    next = addTranscriptMessage(next, {
      ...message,
      interrupted: index > 0,
    });
  });
  return {
    ...next,
    memorySummary,
    memoryFacts:
      memoryFact && !next.memoryFacts.includes(memoryFact)
        ? [...next.memoryFacts, memoryFact].slice(-8)
        : next.memoryFacts,
    turnNumber: session.turnNumber + 1,
  };
}

export function deliverVerdict(
  session: CourtSession,
  verdict: PartySide,
): CourtSession {
  if (session.verdict) return session;
  getCourtCase(session.caseId);
  return { ...session, verdict };
}
