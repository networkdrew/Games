import { useEffect, useRef } from "react";
import type { EventEntry } from "@/lib/games-logic/ai-dungeon-door/types";

interface EventLogProps {
  intro: string;
  history: EventEntry[];
  /** Live text accumulated from the model's streamed response so far this turn, or null when nothing is streaming. */
  streamingText: string | null;
  /** True once a turn has been submitted but no delta has arrived yet. */
  waitingForFirstToken: boolean;
  ending?: string;
}

function EntryBadge({
  aiNarrated,
  requiredFallback,
}: {
  aiNarrated: boolean;
  requiredFallback: boolean;
}) {
  if (requiredFallback) {
    return (
      <span className="text-text-muted bg-bg-sunken ml-2 rounded-full px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
        fallback
      </span>
    );
  }
  if (aiNarrated) {
    return (
      <span className="text-accent bg-accent/10 ml-2 rounded-full px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
        AI
      </span>
    );
  }
  return null;
}

export default function EventLog({
  intro,
  history,
  streamingText,
  waitingForFirstToken,
  ending,
}: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, streamingText, waitingForFirstToken, ending]);

  return (
    <div
      ref={scrollRef}
      className="border-border bg-bg-elevated/60 flex-1 overflow-y-auto rounded-lg border p-4 text-sm leading-relaxed"
      aria-label="Event log"
    >
      <p className="text-text-muted mb-3 italic">{intro}</p>
      <ol className="flex flex-col gap-3">
        {history.map((entry, i) => (
          <li
            key={i}
            className="border-border/60 border-t pt-3 first:border-t-0 first:pt-0"
          >
            <p className="text-text-muted flex items-center text-xs font-medium tracking-wide uppercase">
              Turn {entry.turn} — you{" "}
              {entry.action ? `try to: "${entry.action}"` : "act"}
              <EntryBadge
                aiNarrated={entry.aiNarrated}
                requiredFallback={entry.requiredFallback}
              />
            </p>
            <p className="text-text mt-1">{entry.narration}</p>
          </li>
        ))}
      </ol>

      {waitingForFirstToken && (
        <p
          className="text-text-muted border-border/60 mt-3 border-t pt-3 italic"
          role="status"
          aria-live="polite"
        >
          The door considers what happens next…
        </p>
      )}

      {streamingText !== null && streamingText.length > 0 && (
        <p
          className="text-text border-border/60 mt-3 border-t pt-3"
          role="status"
          aria-live="polite"
        >
          {streamingText}
          <span className="animate-pulse" aria-hidden="true">
            ▌
          </span>
        </p>
      )}

      {ending && (
        <p
          className="text-text border-border mt-4 border-t pt-4 font-semibold"
          role="status"
          aria-live="assertive"
        >
          {ending}
        </p>
      )}
    </div>
  );
}
