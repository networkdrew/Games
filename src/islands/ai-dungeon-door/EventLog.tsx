import { useEffect, useRef } from "react";
import type { EventEntry } from "@/lib/games-logic/ai-dungeon-door/types";

interface EventLogProps {
  intro: string;
  history: EventEntry[];
  pendingAction: string | null;
  ending?: string;
}

export default function EventLog({
  intro,
  history,
  pendingAction,
  ending,
}: EventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history.length, pendingAction, ending]);

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
            <p className="text-text-muted text-xs font-medium tracking-wide uppercase">
              Turn {entry.turn} — you{" "}
              {entry.action ? `try to: “${entry.action}”` : "act"}
            </p>
            <p className="text-text mt-1">{entry.narration}</p>
          </li>
        ))}
      </ol>
      {pendingAction && (
        <p
          className="text-text-muted border-border/60 mt-3 border-t pt-3 italic"
          role="status"
          aria-live="polite"
        >
          The door considers what happens next…
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
