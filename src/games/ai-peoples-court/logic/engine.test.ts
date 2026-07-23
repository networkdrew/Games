import { describe, expect, it } from "vitest";
import {
  askCourtQuestion,
  createCourtSession,
  deliverVerdict,
  inspectEvidence,
} from "./engine";

describe("court engine", () => {
  it("keeps evidence and question progress code-owned", () => {
    const session = createCourtSession(0);
    const withEvidence = inspectEvidence(session, "care-card");
    const withQuestion = askCourtQuestion(withEvidence, "ellis-window");

    expect(withQuestion.inspectedEvidence).toEqual(["care-card"]);
    expect(withQuestion.askedQuestions).toEqual(["ellis-window"]);
    expect(inspectEvidence(withQuestion, "not-an-exhibit")).toBe(withQuestion);
  });

  it("scores an accurate and fully prepared verdict at 100", () => {
    let session = createCourtSession(0);
    for (const id of ["care-card", "weather-log", "message"]) {
      session = inspectEvidence(session, id);
    }
    for (const id of [
      "mara-instructions",
      "mara-value",
      "ellis-window",
      "ellis-warning",
    ]) {
      session = askCourtQuestion(session, id);
    }

    const decided = deliverVerdict(session, "plaintiff");
    expect(decided.score).toBe(100);
    expect(decided.verdict).toBe("plaintiff");
    expect(deliverVerdict(decided, "defendant")).toBe(decided);
  });
});
