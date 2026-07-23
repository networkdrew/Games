import { courtCases, getCourtCase } from "./cases";
import type { CourtSession, PartySide } from "./types";

export function createCourtSession(caseIndex = 0): CourtSession {
  const normalizedIndex =
    ((caseIndex % courtCases.length) + courtCases.length) % courtCases.length;
  const courtCase = courtCases[normalizedIndex];
  if (!courtCase) throw new Error("AI People's Court has no cases");
  return {
    caseId: courtCase.id,
    inspectedEvidence: [],
    askedQuestions: [],
    verdict: null,
    score: null,
  };
}

export function inspectEvidence(
  session: CourtSession,
  evidenceId: string,
): CourtSession {
  const courtCase = getCourtCase(session.caseId);
  if (!courtCase.evidence.some((item) => item.id === evidenceId))
    return session;
  if (session.inspectedEvidence.includes(evidenceId)) return session;
  return {
    ...session,
    inspectedEvidence: [...session.inspectedEvidence, evidenceId],
  };
}

export function askCourtQuestion(
  session: CourtSession,
  questionId: string,
): CourtSession {
  const courtCase = getCourtCase(session.caseId);
  if (!courtCase.questions.some((item) => item.id === questionId))
    return session;
  if (session.askedQuestions.includes(questionId)) return session;
  return {
    ...session,
    askedQuestions: [...session.askedQuestions, questionId],
  };
}

export function deliverVerdict(
  session: CourtSession,
  verdict: PartySide,
): CourtSession {
  if (session.verdict) return session;
  const courtCase = getCourtCase(session.caseId);
  const evidencePoints = Math.round(
    (session.inspectedEvidence.length / courtCase.evidence.length) * 25,
  );
  const questionPoints = Math.round(
    (session.askedQuestions.length / courtCase.questions.length) * 15,
  );
  const preparationBonus =
    session.inspectedEvidence.length === courtCase.evidence.length &&
    session.askedQuestions.length >= 2
      ? 10
      : 0;
  const accuracyPoints = verdict === courtCase.correctVerdict ? 50 : 0;

  return {
    ...session,
    verdict,
    score: accuracyPoints + evidencePoints + questionPoints + preparationBonus,
  };
}
