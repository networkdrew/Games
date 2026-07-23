import { useEffect, useRef, useState } from "react";
import type { EventEntry } from "@/lib/games-logic/ai-dungeon-door/types";

interface EventLogProps {
  history: EventEntry[];
  /** The player's just-submitted action, shown immediately while its response streams in. Null when nothing is pending. */
  pendingAction: string | null;
  /** Live text accumulated from the model's streamed response so far, or null when nothing is streaming. */
  streamingText: string | null;
  /** True once a turn/opening has been submitted but no delta has arrived yet. */
  waitingForFirstToken: boolean;
  ending?: string;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** IF-style prompt line for a player's action — deliberately not a chat bubble. */
function PlayerPrompt({ action }: { action: string }) {
  return (
    <p className="text-accent/90 font-mono text-xs break-words sm:text-sm">
      <span aria-hidden="true">{"> "}</span>
      {action}
    </p>
  );
}

function NarrationBlock({ text, offline }: { text: string; offline: boolean }) {
  return (
    <p className="text-text mt-1.5 leading-relaxed break-words whitespace-pre-wrap">
      {text}
      {offline && (
        <span className="text-text-muted ml-2 align-middle text-[10px] font-medium tracking-wide uppercase">
          (offline)
        </span>
      )}
    </p>
  );
}

export default function EventLog({
  history,
  pendingAction,
  streamingText,
  waitingForFirstToken,
  ending,
}: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [
    history.length,
    pendingAction,
    streamingText,
    waitingForFirstToken,
    ending,
    reducedMotion,
  ]);

  return (
    <div
      ref={scrollRef}
      className="border-border bg-bg-elevated/60 min-h-0 flex-1 overflow-y-auto rounded-lg border p-4 text-sm"
      role="log"
      aria-label="Story so far"
    >
      <div className="flex flex-col gap-4">
        {history.map((entry, i) => (
          <div key={i}>
            {entry.action && <PlayerPrompt action={entry.action} />}
            <NarrationBlock
              text={entry.narration}
              offline={entry.requiredFallback}
            />
          </div>
        ))}

        {pendingAction !== null && <PlayerPrompt action={pendingAction} />}

        {waitingForFirstToken && (
          <p className="text-text-muted italic" role="status">
            <span className="animate-pulse" aria-hidden="true">
              …
            </span>{" "}
            the story continues
          </p>
        )}

        {streamingText !== null && streamingText.length > 0 && (
          <p className="text-text leading-relaxed break-words whitespace-pre-wrap">
            {streamingText}
            <span className="animate-pulse" aria-hidden="true">
              ▌
            </span>
          </p>
        )}

        {ending && (
          <p className="text-text border-border mt-2 border-t pt-4 font-semibold">
            {ending}
          </p>
        )}
      </div>
    </div>
  );
}
