import { useEffect, useRef, useState } from "react";
import {
  appendExchange,
  applyControlProposal,
  applyDeterministicAction,
  buildAiTurnContext,
  createNewGame,
  isInventoryCheck,
  markOpeningDelivered,
  pushMemoryFact,
} from "@/lib/games-logic/ai-dungeon-door/engine";
import { getScenario } from "@/lib/games-logic/ai-dungeon-door/scenarios";
import {
  sanitizeMemoryFact,
  sanitizeNarrationText,
} from "@/lib/games-logic/ai-dungeon-door/narration";
import type { GameState } from "@/lib/games-logic/ai-dungeon-door/types";
import { BridgeClient, type TurnEvent } from "@/lib/bridge/client";
import { buttonSecondary } from "@/components/react/styles";
import Icon from "@/components/react/Icon";
import GameAppShell from "@/components/react/GameAppShell";
import DoorScene from "./DoorScene";
import StatusBar from "./StatusBar";
import EventLog from "./EventLog";
import ActionInput from "./ActionInput";
import ConnectionStatus from "./ConnectionStatus";
import DiagnosticsPanel, { type DiagnosticsData } from "./DiagnosticsPanel";
import { useBridgeConnection, type ConnectionState } from "./useBridgeConnection";

/** Rough chars-per-token heuristic for the diagnostics panel's "approx tokens" display — the bridge's streamed responses don't reliably report usage, so this is clearly labeled as approximate, never exact. */
function approxTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 4));
}

const LOADING_COPY: Partial<Record<ConnectionState, string>> = {
  connecting: "Waking the dungeon…",
  "loading-model": "Loading the local storyteller…",
  warming: "Opening the door…",
  failed: "The dungeon is quiet.",
};

function loadingHeadline(state: ConnectionState, friendlyName?: string): string {
  if (state === "loading-model" && friendlyName) return `Loading ${friendlyName}…`;
  return LOADING_COPY[state] ?? "Preparing the encounter…";
}

interface LoadingScreenProps {
  state: ConnectionState;
  friendlyName?: string;
  onRetry: () => void;
}

function LoadingScreen({ state, friendlyName, onRetry }: LoadingScreenProps) {
  const failed = state === "failed";
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="w-full max-w-xs">
        <DoorScene tension={10} status="playing" />
      </div>
      <p className="text-text text-base font-medium">
        {loadingHeadline(state, friendlyName)}
      </p>
      {failed ? (
        <>
          <p className="text-text-muted max-w-sm text-sm">
            The local storyteller couldn't be reached. You can keep waiting,
            retry, or just start — the door still narrates itself offline.
          </p>
          <button type="button" onClick={onRetry} className={buttonSecondary}>
            <Icon name="refresh-cw" className="h-4 w-4" />
            Retry
          </button>
        </>
      ) : (
        <p className="text-text-muted text-xs" aria-hidden="true">
          {"· ".repeat(3).trim()}
        </p>
      )}
      <details className="text-text-muted mt-2 text-xs">
        <summary className="cursor-pointer select-none">Diagnostics</summary>
        <p className="mt-1 font-mono">connection: {state}</p>
        {friendlyName && <p className="font-mono">model: {friendlyName}</p>}
      </details>
    </div>
  );
}

interface AIDungeonDoorGameProps {
  /** Only ever passed in tests, to make a run deterministic — production always omits it. */
  initialSeed?: number;
}

export default function AIDungeonDoorGame({
  initialSeed,
}: AIDungeonDoorGameProps = {}) {
  const [gameState, setGameState] = useState<GameState>(() =>
    createNewGame(initialSeed),
  );
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);
  const [lastDiagnostics, setLastDiagnostics] =
    useState<DiagnosticsData | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const bridgeRef = useRef<BridgeClient | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = new BridgeClient();
  }
  const openingRequestedRef = useRef(false);

  const connection = useBridgeConnection(bridgeRef.current);
  const scenario = getScenario(gameState.scenarioId);

  useEffect(() => {
    return () => {
      bridgeRef.current?.cancelPending();
    };
  }, []);

  // Startup / new-game sequence: once the bridge is warm (or already ready
  // right after a New Game), stream the model's own opening scene live into
  // the transcript. If the bridge never becomes reachable, a separate effect
  // below falls back to the scenario's deterministic intro line instead.
  useEffect(() => {
    if (gameState.openingDelivered) return;
    if (pending) return;
    if (openingRequestedRef.current) return;
    const canWarm = connection.readyToWarm || connection.state === "ready";
    if (!canWarm) return;
    openingRequestedRef.current = true;
    void runOpening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.readyToWarm, connection.state, gameState.openingDelivered, pending]);

  // Offline/failed at startup: don't leave the player staring at a loading
  // screen forever — fall back to the scenario's own deterministic intro.
  useEffect(() => {
    if (gameState.openingDelivered) return;
    if (pending) return;
    if (connection.state !== "offline" && connection.state !== "failed") return;
    openingRequestedRef.current = true;
    setGameState((prev) =>
      markOpeningDelivered(
        appendExchange(prev, "", scenario.intro, false, true),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.state, gameState.openingDelivered, pending, scenario.intro]);

  async function runOpening() {
    setPending(true);
    setPendingAction(null);
    setWaitingForFirstToken(true);
    setStreamingText("");

    const diag: DiagnosticsData = {};
    let liveText = "";
    let sawFirstDelta = false;
    let sawAnyEvent = false;

    const onEvent = (event: TurnEvent) => {
      sawAnyEvent = true;
      if (event.type === "model") {
        diag.modelId = event.modelId;
        diag.alias = event.alias;
        diag.friendlyName = event.friendlyName;
      } else if (event.type === "delta") {
        if (!sawFirstDelta) {
          sawFirstDelta = true;
          setWaitingForFirstToken(false);
        }
        liveText += event.text;
        setStreamingText(liveText);
      } else if (event.type === "done") {
        const stats = event.stats;
        diag.firstTokenMs = (stats.firstTokenMs as number | null) ?? null;
        diag.totalMs = (stats.totalMs as number | null) ?? null;
        diag.chunks = stats.chunks as number | undefined;
      }
    };

    const result = await bridgeRef.current!.streamTurn(
      {
        mode: "opening",
        characterPrompt: scenario.doorPersonality,
        secretTruth: scenario.secretTruth,
        environment: scenario.environment,
      },
      { onEvent },
    );

    setWaitingForFirstToken(false);
    setStreamingText(null);

    if (result.aborted) return;

    // A stream that never delivered a single event almost certainly means
    // the bridge itself was unreachable (network/connection failure), as
    // opposed to a reachable bridge that just couldn't produce a valid
    // response — only the former should flip the connection state.
    if (result.fallback && !sawAnyEvent) {
      connection.reportDisconnect();
    } else {
      connection.markReady();
    }

    const sanitized = sanitizeNarrationText(result.narration);
    const openingText = sanitized ?? scenario.intro;
    const aiNarrated = sanitized !== null && !result.fallback;

    setGameState((prev) =>
      markOpeningDelivered(
        appendExchange(prev, "", openingText, aiNarrated, !aiNarrated),
      ),
    );
    setLastDiagnostics(diag);
    setPending(false);
    setAnnouncement("The door opens. A new message arrived.");
  }

  async function handleAction(rawInput: string) {
    if (pending || gameState.status !== "playing" || !gameState.openingDelivered)
      return;

    if (isInventoryCheck(rawInput, gameState.inventory)) {
      const { state: nextState, narration } = applyDeterministicAction(
        gameState,
        rawInput,
      );
      setGameState(appendExchange(nextState, rawInput, narration, false, false));
      return;
    }

    setPending(true);
    setPendingAction(rawInput);
    setStreamingText(null);
    setWaitingForFirstToken(false);

    const useAi = connection.state === "ready";

    if (!useAi) {
      const wasOffline = connection.state === "offline" || connection.state === "failed";
      const { state: nextState } = applyDeterministicAction(
        gameState,
        rawInput,
        !wasOffline,
      );
      setGameState(nextState);
      setLastDiagnostics({ fallback: true });
      setPending(false);
      setPendingAction(null);
      return;
    }

    const ctx = buildAiTurnContext(gameState);
    const diag: DiagnosticsData = {};
    let liveText = "";
    let sawFirstDelta = false;
    let sawAnyEvent = false;

    setWaitingForFirstToken(true);
    const result = await bridgeRef.current!.streamTurn(
      {
        mode: "turn",
        characterPrompt: ctx.characterPrompt,
        secretTruth: ctx.secretTruth,
        environment: ctx.environment,
        stateSummary: ctx.stateSummary,
        bounds: {
          healthMagnitude: ctx.bounds.maxHealthDelta,
          tensionMagnitude: ctx.bounds.maxTensionDelta,
          trustMagnitude: ctx.bounds.maxTrustDelta,
        },
        clueAllowlist: ctx.clueAllowlist,
        itemAllowlist: ctx.itemAllowlist,
        endings: ctx.endings,
        memoryFacts: ctx.memoryFacts,
        recentExchanges: ctx.recentExchanges,
        playerAction: rawInput,
      },
      {
        onEvent: (event) => {
          sawAnyEvent = true;
          if (event.type === "model") {
            diag.modelId = event.modelId;
            diag.alias = event.alias;
            diag.friendlyName = event.friendlyName;
          } else if (event.type === "delta") {
            if (!sawFirstDelta) {
              sawFirstDelta = true;
              setWaitingForFirstToken(false);
            }
            liveText += event.text;
            setStreamingText(liveText);
          } else if (event.type === "control") {
            diag.corrected = event.corrected;
            diag.fallback = event.fallback;
            diag.corrections = event.corrections;
          } else if (event.type === "done") {
            const stats = event.stats;
            diag.firstTokenMs = (stats.firstTokenMs as number | null) ?? null;
            diag.totalMs = (stats.totalMs as number | null) ?? null;
            diag.chunks = stats.chunks as number | undefined;
          }
        },
      },
    );

    setWaitingForFirstToken(false);
    setStreamingText(null);
    setPendingAction(null);

    if (result.aborted) return;

    if (result.fallback && !sawAnyEvent) {
      connection.reportDisconnect();
    } else {
      connection.markReady();
    }

    if (result.fallback || !result.proposal) {
      const { state: nextState } = applyDeterministicAction(
        gameState,
        rawInput,
        true,
      );
      setGameState(nextState);
      setLastDiagnostics({ ...diag, fallback: true });
      setPending(false);
      return;
    }

    const sanitized = sanitizeNarrationText(result.narration);
    const finalNarration =
      sanitized ?? "The door responds, though the words are hard to make out.";
    const aiNarrated = sanitized !== null;
    const memoryFact = sanitizeMemoryFact(result.proposal.memory);

    const { state: appliedState, corrections } = applyControlProposal(
      gameState,
      scenario,
      result.proposal,
      finalNarration,
    );
    const withMemory = pushMemoryFact(appliedState, memoryFact);
    const finalState = appendExchange(
      withMemory,
      rawInput,
      finalNarration,
      aiNarrated,
      !aiNarrated,
    );

    setGameState(finalState);
    setLastDiagnostics({
      ...diag,
      approxPromptTokens: approxTokens(
        ctx.characterPrompt + ctx.secretTruth + ctx.stateSummary,
      ),
      approxCompletionTokens: approxTokens(finalNarration),
      corrections: corrections.length > 0 ? corrections : diag.corrections,
    });
    setPending(false);
    setAnnouncement("A new message arrived.");
  }

  function handleCancel() {
    bridgeRef.current?.cancelPending();
    setPending(false);
    setPendingAction(null);
    setStreamingText(null);
    setWaitingForFirstToken(false);
  }

  function handleNewGame() {
    bridgeRef.current?.cancelPending();
    openingRequestedRef.current = false;
    setGameState(createNewGame());
    setPending(false);
    setPendingAction(null);
    setStreamingText(null);
    setWaitingForFirstToken(false);
    setLastDiagnostics(null);
    setAnnouncement("A new game has begun.");
  }

  const gameEnded = gameState.status !== "playing";
  const showLoadingScreen =
    connection.state === "connecting" ||
    connection.state === "loading-model" ||
    connection.state === "failed" ||
    (connection.state === "warming" && waitingForFirstToken && !gameState.openingDelivered);

  return (
    <GameAppShell
      gameTitle={scenario.name}
      className="dungeon-door"
      onNewGame={handleNewGame}
      newGameLabel="New game"
      connectionSlot={
        <ConnectionStatus
          state={connection.state}
          health={connection.health}
          onRetry={connection.retry}
        />
      }
      loading={
        showLoadingScreen ? (
          <div className="dungeon-door bg-bg text-text h-full">
            <LoadingScreen
              state={connection.state}
              friendlyName={connection.health?.friendlyName}
              onRetry={connection.retry}
            />
          </div>
        ) : undefined
      }
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col gap-3 overflow-y-auto p-3 sm:gap-4 sm:p-6">
        <DoorScene tension={gameState.tension} status={gameState.status} />
        <StatusBar state={gameState} />
        <EventLog
          history={gameState.history}
          pendingAction={pendingAction}
          streamingText={streamingText}
          waitingForFirstToken={waitingForFirstToken}
          ending={gameState.ending}
        />

        {gameEnded ? (
          <button
            type="button"
            onClick={handleNewGame}
            className={buttonSecondary}
          >
            <Icon name="refresh-cw" className="h-4 w-4" />
            Start a new game
          </button>
        ) : (
          <ActionInput
            disabled={pending || !gameState.openingDelivered}
            pending={pending}
            onSubmit={handleAction}
            onCancel={handleCancel}
          />
        )}

        <DiagnosticsPanel
          connectionState={connection.state}
          health={connection.health}
          lastTurn={lastDiagnostics}
        />
      </div>
    </GameAppShell>
  );
}
