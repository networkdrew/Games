import { describe, expect, it } from "vitest";
import {
  addJudgeMessage,
  applySimulatedTurn,
  createCourtSession,
  deliverVerdict,
} from "./engine";

describe("court engine", () => {
  it("keeps a rolling transcript and durable memory ledger", () => {
    let session = createCourtSession(0);
    session = addJudgeMessage(session, "Call the plaintiff.");
    session = applySimulatedTurn(
      session,
      [
        {
          speaker: "plaintiff",
          name: "Mara Venn",
          text: "I am ready, Your Honor.",
        },
        {
          speaker: "defendant",
          name: "Ellis Rowe",
          text: "I object to that characterization.",
        },
      ],
      "The judge called Mara; Ellis reacted.",
      "Ellis objected before a question was asked.",
    );

    expect(session.transcript).toHaveLength(3);
    expect(session.transcript[2]?.interrupted).toBe(true);
    expect(session.memoryFacts).toEqual([
      "Ellis objected before a question was asked.",
    ]);
    expect(session.turnNumber).toBe(1);
  });

  it("makes the human verdict final", () => {
    const session = createCourtSession(0);
    const decided = deliverVerdict(session, "plaintiff");
    expect(decided.verdict).toBe("plaintiff");
    expect(deliverVerdict(decided, "defendant")).toBe(decided);
  });
});
