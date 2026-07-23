import { useState } from "react";
import GameAppShell from "@/components/react/GameAppShell";
import Icon from "@/components/react/Icon";
import { courtCases, getCourtCase } from "./logic/cases";
import {
  askCourtQuestion,
  createCourtSession,
  deliverVerdict,
  inspectEvidence,
} from "./logic/engine";
import type { PartySide } from "./logic/types";

interface AIPeoplesCourtGameProps {
  initialCaseIndex?: number;
}

function sideLabel(side: PartySide): string {
  return side === "plaintiff" ? "Plaintiff" : "Defendant";
}

export default function AIPeoplesCourtGame({
  initialCaseIndex = 0,
}: AIPeoplesCourtGameProps) {
  const [caseIndex, setCaseIndex] = useState(initialCaseIndex);
  const [session, setSession] = useState(() =>
    createCourtSession(initialCaseIndex),
  );
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("Court is now in session.");
  const courtCase = getCourtCase(session.caseId);
  const selectedItem = courtCase.evidence.find(
    (item) => item.id === selectedEvidence,
  );

  function startNextCase() {
    const nextIndex = (caseIndex + 1) % courtCases.length;
    setCaseIndex(nextIndex);
    setSession(createCourtSession(nextIndex));
    setSelectedEvidence(null);
    setAnnouncement("A new case is now before the court.");
  }

  function reviewEvidence(evidenceId: string) {
    const item = courtCase.evidence.find(
      (candidate) => candidate.id === evidenceId,
    );
    if (!item) return;
    setSelectedEvidence(evidenceId);
    setSession((current) => inspectEvidence(current, evidenceId));
    setAnnouncement(`${item.title} entered into the record.`);
  }

  function ask(questionId: string) {
    const question = courtCase.questions.find(
      (candidate) => candidate.id === questionId,
    );
    if (!question) return;
    setSession((current) => askCourtQuestion(current, questionId));
    setAnnouncement(`${sideLabel(question.side)} answered the question.`);
  }

  function ruleFor(side: PartySide) {
    setSession((current) => deliverVerdict(current, side));
    setAnnouncement(`Judgment entered for the ${side}.`);
  }

  const accuracy =
    session.verdict === null
      ? null
      : session.verdict === courtCase.correctVerdict;

  return (
    <GameAppShell
      gameTitle="AI People's Court"
      className="peoples-court"
      backLabel="All games"
      onNewGame={startNextCase}
      newGameLabel="Next case"
      actionsSlot={
        <span className="courtroom-docket hidden text-xs font-semibold sm:inline">
          {courtCase.docket}
        </span>
      }
    >
      <main className="courtroom-backdrop h-full min-h-0 overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_19rem]">
          <aside className="courtroom-panel overflow-hidden rounded-xl border">
            <div className="courtroom-rail h-1.5" aria-hidden="true" />
            <div className="p-4">
              <p className="courtroom-kicker text-[11px] font-bold tracking-[0.18em] uppercase">
                Case file · {courtCase.docket}
              </p>
              <h1 className="courtroom-heading mt-2 text-xl font-bold">
                {courtCase.title}
              </h1>
              <p className="courtroom-copy mt-3 text-sm leading-6">
                {courtCase.claim}
              </p>
              <p className="courtroom-note mt-3 text-xs font-semibold">
                Claim: {courtCase.stakes}
              </p>
            </div>

            <div className="courtroom-divider border-t px-4 py-4">
              <h2 className="courtroom-heading flex items-center gap-2 text-sm font-bold">
                <Icon name="search" className="h-4 w-4" />
                Evidence
              </h2>
              <div className="mt-3 space-y-2">
                {courtCase.evidence.map((item) => {
                  const reviewed = session.inspectedEvidence.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => reviewEvidence(item.id)}
                      aria-pressed={selectedEvidence === item.id}
                      className="courtroom-evidence w-full rounded-lg border p-3 text-left transition-colors"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {item.title}
                        </span>
                        {reviewed && (
                          <span className="courtroom-reviewed text-[10px] font-bold uppercase">
                            Reviewed
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-5 opacity-75">
                        {item.summary}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="courtroom-panel overflow-hidden rounded-xl border">
            <div className="courtroom-bench px-4 py-5 text-center sm:px-7">
              <div className="courtroom-seal mx-auto flex h-14 w-14 items-center justify-center rounded-full border">
                <Icon name="hammer" className="h-7 w-7" />
              </div>
              <p className="mt-3 text-[10px] font-bold tracking-[0.22em] uppercase opacity-75">
                The Honorable Player Presiding
              </p>
              <h2 className="mt-1 text-2xl font-bold">Court is in session</h2>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              {(["plaintiff", "defendant"] as const).map((side) => {
                const party = courtCase[side];
                return (
                  <article
                    key={side}
                    className="courtroom-party rounded-xl border p-4"
                  >
                    <p className="courtroom-kicker text-[10px] font-bold tracking-[0.16em] uppercase">
                      {sideLabel(side)}
                    </p>
                    <h3 className="courtroom-heading mt-1 text-lg font-bold">
                      {party.name}
                    </h3>
                    <p className="courtroom-note text-xs">{party.role}</p>
                    <blockquote className="courtroom-copy mt-3 text-sm leading-6">
                      “{party.opening}”
                    </blockquote>
                  </article>
                );
              })}
            </div>

            <div className="courtroom-divider border-t p-4 sm:p-5">
              <h2 className="courtroom-heading flex items-center gap-2 text-base font-bold">
                <Icon name="message-circle" className="h-4 w-4" />
                Question the parties
              </h2>
              <p className="courtroom-copy mt-1 text-xs">
                Ask as many questions as you need. Their answers become part of
                the record.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {courtCase.questions.map((question) => {
                  const asked = session.askedQuestions.includes(question.id);
                  return (
                    <div
                      key={question.id}
                      className="courtroom-question rounded-lg border p-3"
                    >
                      <p className="courtroom-kicker text-[10px] font-bold uppercase">
                        For the {question.side}
                      </p>
                      <button
                        type="button"
                        onClick={() => ask(question.id)}
                        disabled={asked}
                        className="courtroom-question-button mt-1 text-left text-sm font-semibold"
                      >
                        {question.prompt}
                      </button>
                      {asked && (
                        <p className="courtroom-answer mt-2 border-l-2 pl-3 text-sm leading-6">
                          {question.answer}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="courtroom-panel rounded-xl border p-4">
              <h2 className="courtroom-heading flex items-center gap-2 text-sm font-bold">
                <Icon name="scroll-text" className="h-4 w-4" />
                Judge's notes
              </h2>
              {selectedItem ? (
                <div className="courtroom-document mt-3 rounded-lg border p-4">
                  <p className="text-sm font-bold">{selectedItem.title}</p>
                  <p className="mt-2 text-sm leading-6">
                    {selectedItem.detail}
                  </p>
                </div>
              ) : (
                <p className="courtroom-copy mt-3 text-sm leading-6">
                  Select an evidence item to inspect its full contents.
                </p>
              )}
              <div className="courtroom-progress mt-4 rounded-lg p-3 text-xs">
                Record reviewed: {session.inspectedEvidence.length}/
                {courtCase.evidence.length} exhibits ·{" "}
                {session.askedQuestions.length}/{courtCase.questions.length}{" "}
                questions
              </div>
            </section>

            <section className="courtroom-panel rounded-xl border p-4">
              {session.verdict === null ? (
                <>
                  <h2 className="courtroom-heading text-base font-bold">
                    Deliver your verdict
                  </h2>
                  <p className="courtroom-copy mt-2 text-sm leading-6">
                    You control the decision. Review the record, then rule for
                    one party.
                  </p>
                  <div className="mt-4 grid gap-2">
                    <button
                      type="button"
                      onClick={() => ruleFor("plaintiff")}
                      className="courtroom-verdict rounded-lg px-4 py-3 text-sm font-bold"
                    >
                      Rule for {courtCase.plaintiff.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => ruleFor("defendant")}
                      className="courtroom-verdict courtroom-verdict--secondary rounded-lg px-4 py-3 text-sm font-bold"
                    >
                      Rule for {courtCase.defendant.name}
                    </button>
                  </div>
                </>
              ) : (
                <div aria-live="polite">
                  <p className="courtroom-kicker text-[11px] font-bold uppercase">
                    Case decided
                  </p>
                  <h2 className="courtroom-heading mt-1 text-xl font-bold">
                    {accuracy ? "Sound judgment" : "A difficult call"}
                  </h2>
                  <p className="courtroom-score mt-3 text-3xl font-bold">
                    {session.score}/100
                  </p>
                  <p className="courtroom-copy mt-3 text-sm leading-6">
                    You ruled for the {session.verdict}. The record supports the{" "}
                    {courtCase.correctVerdict}.
                  </p>
                  <p className="courtroom-ruling mt-3 rounded-lg p-3 text-sm leading-6">
                    {courtCase.ruling}
                  </p>
                  <button
                    type="button"
                    onClick={startNextCase}
                    className="courtroom-verdict mt-4 w-full rounded-lg px-4 py-3 text-sm font-bold"
                  >
                    Call the next case
                  </button>
                </div>
              )}
            </section>
          </aside>
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </main>
    </GameAppShell>
  );
}
