import type {
  CourtSession,
  CourtSpeaker,
  PartySide,
  TranscriptMessage,
} from "./types";

export function createCourtSession(caseId: string): CourtSession {
  if (!caseId) throw new Error("AI People's Court requires a case id");
  return {
    caseId,
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
  memoryFacts: readonly string[],
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
    memoryFacts: [
      ...next.memoryFacts,
      ...memoryFacts.filter((fact) => !next.memoryFacts.includes(fact)),
    ].slice(-8),
    turnNumber: session.turnNumber + 1,
  };
}

export function deliverVerdict(
  session: CourtSession,
  verdict: PartySide,
): CourtSession {
  if (session.verdict) return session;
  return { ...session, verdict };
}
