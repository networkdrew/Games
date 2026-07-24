import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import GameAppShell from "@/components/react/GameAppShell";
import Icon from "@/components/react/Icon";
import { useBridgeConnection } from "@/games/ai-dungeon-door/components/useBridgeConnection";
import {
  CourtBridgeClient,
  type CourtEvent,
  type CourtGameClient,
  type CourtTurnRequest,
} from "./CourtBridgeClient";
import {
  archiveGeneratedCase,
  archiveVerdict,
  loadCaseArchive,
} from "./logic/archive";
import { authoredCourtCases } from "./logic/cases";
import { createCourtSeed, generateCourtCase } from "./logic/generator";
import {
  addJudgeMessage,
  applySimulatedTurn,
  createCourtSession,
  deliverVerdict,
} from "./logic/engine";
import type {
  CourtCase,
  CourtSession,
  CourtSpeaker,
  PartySide,
} from "./logic/types";

interface AIPeoplesCourtGameProps {
  initialCaseIndex?: number;
  bridgeClient?: CourtGameClient;
}

const SPEAKER_COLORS: Record<CourtSpeaker, string> = {
  judge: "court-chat--judge",
  bailiff: "court-chat--official",
  clerk: "court-chat--official",
  plaintiff: "court-chat--plaintiff",
  defendant: "court-chat--defendant",
  witness: "court-chat--witness",
};

function connectionLabel(state: string) {
  if (state === "ready") return "Local courtroom live";
  if (state === "loading-model") return "Loading local cast…";
  if (state === "warming") return "Calling court to order…";
  if (state === "reconnecting") return "Reconnecting…";
  if (state === "offline" || state === "failed")
    return "Local courtroom unavailable";
  return "Connecting to local courtroom…";
}

export default function AIPeoplesCourtGame({
  initialCaseIndex,
  bridgeClient,
}: AIPeoplesCourtGameProps) {
  const initialCaseRef = useRef<CourtCase | null>(null);
  if (!initialCaseRef.current) {
    const authored =
      initialCaseIndex === undefined
        ? undefined
        : authoredCourtCases[initialCaseIndex];
    initialCaseRef.current = authored ?? generateCourtCase(createCourtSeed());
  }
  const [courtCase, setCourtCase] = useState(initialCaseRef.current);
  const [session, setSession] = useState(() =>
    createCourtSession(initialCaseRef.current!.id),
  );
  const [archive, setArchive] = useState(() => loadCaseArchive());
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [liveMessage, setLiveMessage] = useState<{
    speaker: Exclude<CourtSpeaker, "judge">;
    name: string;
    text: string;
    interrupted: boolean;
  } | null>(null);
  const [showVerdict, setShowVerdict] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const openingRequestedRef = useRef(false);
  const clientRef = useRef<CourtGameClient | null>(null);
  if (!clientRef.current)
    clientRef.current = bridgeClient ?? new CourtBridgeClient();
  const connection = useBridgeConnection(clientRef.current);

  const people = {
    bailiff: { name: "Bailiff Arden", role: "Bailiff" },
    clerk: { name: "Clerk Sol", role: "Court clerk" },
    plaintiff: courtCase.plaintiff,
    defendant: courtCase.defendant,
    witness: courtCase.witness,
  } as const;

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [session.transcript.length, pending]);

  useEffect(() => () => clientRef.current?.cancelPending(), []);

  useEffect(() => {
    if (initialCaseIndex !== undefined) return;
    setArchive(archiveGeneratedCase(courtCase));
  }, [courtCase, initialCaseIndex]);

  useEffect(() => {
    if (openingRequestedRef.current || session.transcript.length > 0 || pending)
      return;
    if (!connection.readyToWarm && connection.state !== "ready") return;
    openingRequestedRef.current = true;
    void requestSimulation(
      session,
      "Bailiff, call the case and identify the parties. Then let each party make a brief opening statement.",
      "opening",
    );
  }, [
    connection.readyToWarm,
    connection.state,
    pending,
    session.caseId,
    session.transcript.length,
  ]);

  function buildRequest(
    current: CourtSession,
    playerMessage: string,
    phase: CourtTurnRequest["phase"],
  ): CourtTurnRequest {
    const speakerSequence = chooseSpeakers(current, playerMessage, phase);
    return {
      caseId: courtCase.id,
      caseTitle: courtCase.title,
      publicBrief: `${courtCase.claim} Claimed stakes: ${courtCase.stakes}. Exhibits in the record: ${courtCase.evidence.map((item) => `${item.title}: ${item.detail}`).join(" | ")}`,
      privateTruth: courtCase.privateTruth,
      participants: [
        {
          id: "bailiff",
          name: people.bailiff.name,
          role: people.bailiff.role,
          voice: "formal, concise, attentive to courtroom order",
          privateKnowledge: "No private case knowledge.",
        },
        {
          id: "clerk",
          name: people.clerk.name,
          role: people.clerk.role,
          voice: "neutral, procedural, reads the record exactly",
          privateKnowledge: "Knows the public case brief and exhibit list.",
        },
        {
          id: "plaintiff",
          name: courtCase.plaintiff.name,
          role: courtCase.plaintiff.role,
          voice: courtCase.plaintiff.voice,
          privateKnowledge: courtCase.plaintiff.privateKnowledge,
        },
        {
          id: "defendant",
          name: courtCase.defendant.name,
          role: courtCase.defendant.role,
          voice: courtCase.defendant.voice,
          privateKnowledge: courtCase.defendant.privateKnowledge,
        },
        {
          id: "witness",
          name: courtCase.witness.name,
          role: courtCase.witness.role,
          voice: courtCase.witness.voice,
          privateKnowledge: courtCase.witness.privateKnowledge,
        },
      ],
      phase,
      turnNumber: current.turnNumber,
      speakerSequence,
      playerMessage,
      memorySummary: current.memorySummary,
      memoryFacts: [...current.memoryFacts],
      recentMessages: current.transcript.slice(-10).map((message) => ({
        name: message.name,
        text: message.text,
      })),
    };
  }

  function chooseSpeakers(
    current: CourtSession,
    playerMessage: string,
    phase: CourtTurnRequest["phase"],
  ): CourtTurnRequest["speakerSequence"] {
    if (phase === "opening") return ["bailiff", "plaintiff", "defendant"];
    if (phase === "deliberation") {
      return [
        "clerk",
        current.verdict === "plaintiff" ? "defendant" : "plaintiff",
      ];
    }

    const normalized = playerMessage.toLowerCase();
    const mentions = (
      id: "plaintiff" | "defendant" | "witness",
      name: string,
    ) => {
      const parts = name.toLowerCase().split(/\s+/);
      return (
        normalized.includes(id) ||
        parts.some((part) => part.length > 2 && normalized.includes(part))
      );
    };
    let primary: CourtTurnRequest["speakerSequence"][number];
    if (normalized.includes("bailiff")) primary = "bailiff";
    else if (normalized.includes("clerk")) primary = "clerk";
    else if (mentions("witness", courtCase.witness.name)) primary = "witness";
    else if (mentions("plaintiff", courtCase.plaintiff.name))
      primary = "plaintiff";
    else if (mentions("defendant", courtCase.defendant.name))
      primary = "defendant";
    else primary = current.turnNumber % 2 === 0 ? "plaintiff" : "defendant";

    const sequence: CourtTurnRequest["speakerSequence"] = [primary];
    const interruptionTurn =
      current.turnNumber > 0 && current.turnNumber % 3 === 0;
    if (interruptionTurn) {
      if (primary === "plaintiff") sequence.push("defendant");
      else if (primary === "defendant") sequence.push("plaintiff");
      else if (primary === "witness") sequence.push("defendant");
    }
    return sequence;
  }

  async function requestSimulation(
    current: CourtSession,
    playerMessage: string,
    phase: CourtTurnRequest["phase"],
  ) {
    setPending(true);
    setFailure("");
    setLiveMessage(null);
    const result = await clientRef.current!.takeTurn(
      buildRequest(current, playerMessage, phase),
      (event: CourtEvent) => {
        if (event.type === "speaker") {
          setLiveMessage({
            speaker: event.speaker,
            name: event.name,
            text: "",
            interrupted: event.interrupted,
          });
        } else if (event.type === "delta") {
          setLiveMessage((message) =>
            message ? { ...message, text: message.text + event.text } : null,
          );
        }
      },
    );
    setPending(false);
    setLiveMessage(null);
    if (result.aborted) return;
    if (!result.memorySummary || result.messages.length === 0) {
      if (phase === "opening") {
        openingRequestedRef.current = false;
      }
      setFailure(
        "The local cast could not produce a valid courtroom turn. Retry the connection or ask again.",
      );
      connection.reportDisconnect();
      return;
    }
    const generated = result.messages.map((message) => ({
      ...message,
      name: people[message.speaker].name,
    }));
    setSession((latest) =>
      applySimulatedTurn(
        latest,
        generated,
        result.memorySummary!,
        result.memoryFacts,
      ),
    );
    connection.markReady();
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || pending || session.verdict) return;
    const next = addJudgeMessage(session, message);
    setSession(next);
    setInput("");
    void requestSimulation(next, message, "hearing");
  }

  function startNextCase() {
    const seed = createCourtSeed();
    const difficulty = 1 + ((archive.length + (seed % 5)) % 5);
    const nextCase = generateCourtCase(seed, difficulty);
    clientRef.current?.cancelPending();
    setCourtCase(nextCase);
    setSession(createCourtSession(nextCase.id));
    setInput("");
    setFailure("");
    setShowVerdict(false);
    setPending(false);
    openingRequestedRef.current = false;
  }

  function reopenArchivedCase(archivedCase: CourtCase) {
    clientRef.current?.cancelPending();
    setCourtCase(archivedCase);
    setSession(createCourtSession(archivedCase.id));
    setInput("");
    setFailure("");
    setShowVerdict(false);
    setPending(false);
    openingRequestedRef.current = false;
  }

  function enterVerdict(side: PartySide) {
    if (pending || session.verdict) return;
    const partyName =
      side === "plaintiff"
        ? courtCase.plaintiff.name
        : courtCase.defendant.name;
    const words = `Judgment is entered for the ${side}, ${partyName}. This hearing is concluded.`;
    const next = deliverVerdict(addJudgeMessage(session, words), side);
    setSession(next);
    if (initialCaseIndex === undefined) {
      setArchive(archiveVerdict(courtCase, side));
    }
    setShowVerdict(false);
    void requestSimulation(next, words, "deliberation");
  }

  const offline =
    connection.state === "offline" || connection.state === "failed";

  return (
    <GameAppShell
      gameTitle="AI People's Court"
      className="peoples-court"
      backLabel="All games"
      onNewGame={startNextCase}
      newGameLabel="Next case"
      connectionSlot={
        <div className="court-connection flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              connection.state === "ready"
                ? "bg-success"
                : offline
                  ? "bg-text-muted"
                  : "bg-accent animate-pulse"
            }`}
          />
          <span className="hidden sm:inline">
            {connectionLabel(connection.state)}
          </span>
          {offline && (
            <button
              type="button"
              onClick={connection.retry}
              className="underline underline-offset-2"
            >
              Retry
            </button>
          )}
        </div>
      }
    >
      <main className="courtroom-backdrop h-full min-h-0 p-2 sm:p-4">
        <div className="mx-auto grid h-full min-h-0 w-full max-w-7xl gap-3 lg:grid-cols-[17rem_minmax(0,1fr)_18rem]">
          <aside className="courtroom-panel hidden min-h-0 overflow-y-auto rounded-xl border lg:block">
            <div className="courtroom-rail h-1.5" />
            <div className="p-4">
              <p className="courtroom-kicker text-[10px] font-bold tracking-[0.18em] uppercase">
                Case {courtCase.docket}
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
              <div className="courtroom-progress mt-3 rounded-lg p-3 text-xs">
                Difficulty {courtCase.difficulty}/5
                <span className="mt-1 block opacity-75">
                  {courtCase.complexity.join(" · ")}
                </span>
              </div>
            </div>
            <div className="courtroom-divider border-t p-4">
              <h2 className="courtroom-heading text-sm font-bold">
                People in the room
              </h2>
              <div className="mt-3 space-y-3">
                {(["plaintiff", "defendant", "witness"] as const).map((id) => (
                  <div key={id}>
                    <p className="text-sm font-semibold">{people[id].name}</p>
                    <p className="courtroom-note text-xs">{people[id].role}</p>
                  </div>
                ))}
              </div>
            </div>
            <details className="courtroom-divider border-t p-4">
              <summary className="courtroom-heading cursor-pointer text-sm font-bold">
                Exhibits in the record
              </summary>
              <div className="mt-3 space-y-3">
                {courtCase.evidence.map((item) => (
                  <div key={item.id}>
                    <p className="text-xs font-bold">{item.title}</p>
                    <p className="courtroom-copy mt-1 text-xs leading-5">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </aside>

          <section className="courtroom-panel flex min-h-0 flex-col overflow-hidden rounded-xl border">
            <header className="courtroom-bench flex items-center gap-3 px-4 py-3">
              <div className="courtroom-seal flex h-10 w-10 shrink-0 items-center justify-center rounded-full border">
                <Icon name="hammer" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{courtCase.title}</p>
                <p className="text-[11px] opacity-75">
                  {courtCase.docket} · You are presiding
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowVerdict((shown) => !shown)}
                disabled={pending || session.transcript.length === 0}
                className="courtroom-rule ml-auto rounded-md px-3 py-2 text-xs font-bold disabled:opacity-40"
              >
                Deliver verdict
              </button>
            </header>

            {showVerdict && !session.verdict && (
              <div className="courtroom-verdict-bar border-b p-3">
                <p className="mb-2 text-center text-xs font-semibold">
                  The verdict is yours alone. Which side prevails?
                </p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => enterVerdict("plaintiff")}
                    className="courtroom-verdict rounded-lg px-4 py-2 text-xs font-bold"
                  >
                    {courtCase.plaintiff.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => enterVerdict("defendant")}
                    className="courtroom-verdict courtroom-verdict--secondary rounded-lg px-4 py-2 text-xs font-bold"
                  >
                    {courtCase.defendant.name}
                  </button>
                </div>
              </div>
            )}

            <div
              ref={transcriptRef}
              className="court-transcript min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"
              aria-live="polite"
            >
              {session.transcript.length === 0 && !offline && (
                <div className="courtroom-copy flex h-full items-center justify-center text-center text-sm">
                  <p>Connecting the local cast and preparing the hearing…</p>
                </div>
              )}
              {offline && session.transcript.length === 0 && (
                <div className="court-offline m-auto max-w-md rounded-xl border p-5 text-center">
                  <Icon name="wifi-off" className="mx-auto h-7 w-7" />
                  <h2 className="courtroom-heading mt-3 font-bold">
                    The local cast is not connected
                  </h2>
                  <p className="courtroom-copy mt-2 text-sm leading-6">
                    Start LM Studio and the OpenGames bridge, then retry. This
                    courtroom uses your local model—no cloud AI and no scripted
                    stand-ins.
                  </p>
                  <button
                    type="button"
                    onClick={connection.retry}
                    className="courtroom-verdict mt-4 rounded-lg px-4 py-2 text-sm font-bold"
                  >
                    Retry connection
                  </button>
                </div>
              )}
              <div className="space-y-3">
                {session.transcript.map((message) => (
                  <article
                    key={message.id}
                    className={`court-chat ${SPEAKER_COLORS[message.speaker]} rounded-xl border p-3 sm:p-4`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold">{message.name}</p>
                      {message.interrupted && (
                        <span className="court-interrupt rounded-full px-2 py-0.5 text-[9px] font-bold uppercase">
                          interrupts
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-6">{message.text}</p>
                  </article>
                ))}
                {pending && (
                  <>
                    {liveMessage?.text ? (
                      <article
                        className={`court-chat ${SPEAKER_COLORS[liveMessage.speaker]} rounded-xl border p-3 sm:p-4`}
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold">
                            {liveMessage.name}
                          </p>
                          {liveMessage.interrupted && (
                            <span className="court-interrupt rounded-full px-2 py-0.5 text-[9px] font-bold uppercase">
                              interrupts
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-6">
                          {liveMessage.text}
                        </p>
                      </article>
                    ) : (
                      <div className="court-typing inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-xs">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full" />
                        The courtroom is responding…
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <footer className="courtroom-composer border-t p-3">
              {failure && (
                <p role="alert" className="mb-2 text-xs text-red-700">
                  {failure}
                </p>
              )}
              {session.verdict ? (
                <div className="text-center">
                  <p className="courtroom-heading text-sm font-bold">
                    Judgment entered for the {session.verdict}.
                  </p>
                  <p className="courtroom-copy mt-1 text-xs">
                    The evidence-supported ruling favored the{" "}
                    {courtCase.correctVerdict}. Call the next case when ready.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                    {[
                      `Plaintiff ${courtCase.plaintiff.name}, answer this: `,
                      `Defendant ${courtCase.defendant.name}, explain: `,
                      `Call ${courtCase.witness.name} to testify.`,
                      "Order. One person at a time.",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setInput(prompt)}
                        className="court-prompt shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold"
                      >
                        {prompt.replace(/: $/, "")}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={submit} className="flex gap-2">
                    <label htmlFor="court-command" className="sr-only">
                      Speak as the presiding judge
                    </label>
                    <input
                      id="court-command"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      maxLength={500}
                      disabled={pending || offline}
                      placeholder="Question anyone, call a witness, manage the hearing…"
                      className="court-input min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!input.trim() || pending || offline}
                      className="courtroom-verdict rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40"
                    >
                      Speak
                    </button>
                  </form>
                </>
              )}
            </footer>
          </section>

          <aside className="courtroom-panel hidden min-h-0 overflow-y-auto rounded-xl border p-4 lg:block">
            <h2 className="courtroom-heading flex items-center gap-2 text-sm font-bold">
              <Icon name="scroll-text" className="h-4 w-4" />
              Court memory
            </h2>
            <p className="courtroom-copy mt-2 text-xs leading-5">
              The local model receives this rolling ledger each turn so names,
              testimony, disputes, and emotional shifts remain coherent.
            </p>
            <div className="courtroom-progress mt-3 rounded-lg p-3 text-xs leading-5">
              {session.memorySummary || "No testimony recorded yet."}
            </div>
            <h3 className="courtroom-heading mt-5 text-xs font-bold uppercase">
              Durable testimony
            </h3>
            {session.memoryFacts.length ? (
              <ol className="courtroom-copy mt-2 list-decimal space-y-2 pl-4 text-xs leading-5">
                {session.memoryFacts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ol>
            ) : (
              <p className="courtroom-note mt-2 text-xs">
                Important admissions and contradictions will appear here.
              </p>
            )}
            <div className="courtroom-divider mt-5 border-t pt-4">
              <p className="courtroom-note text-[11px] leading-5">
                Each response is generated as one code-selected role.
                Interruptions are separate role turns, so participants cannot
                borrow another character's identity or private knowledge.
              </p>
            </div>
            <div className="courtroom-divider mt-5 border-t pt-4">
              <h3 className="courtroom-heading text-xs font-bold uppercase">
                Generated case archive
              </h3>
              <p className="courtroom-note mt-2 text-xs leading-5">
                {archive.length} reproducible case
                {archive.length === 1 ? "" : "s"} cached on this device.
              </p>
              <div className="mt-3 space-y-2">
                {archive.slice(0, 4).map((entry) => (
                  <button
                    type="button"
                    key={entry.courtCase.id}
                    onClick={() => reopenArchivedCase(entry.courtCase)}
                    className="courtroom-progress w-full rounded-md p-2 text-left text-[11px] transition-opacity hover:opacity-75"
                  >
                    <p className="font-semibold">{entry.courtCase.title}</p>
                    <p className="mt-0.5 opacity-70">
                      Seed {entry.courtCase.generation.seed} · Difficulty{" "}
                      {entry.courtCase.difficulty}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </GameAppShell>
  );
}
