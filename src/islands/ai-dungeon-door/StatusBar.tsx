import Icon from "@/components/react/Icon";
import type { GameState } from "@/lib/games-logic/ai-dungeon-door/types";

interface StatusBarProps {
  state: GameState;
}

function Meter({
  value,
  max,
  colorClass,
  label,
}: {
  value: number;
  max: number;
  colorClass: string;
  label: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div
      className="bg-bg-sunken h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${colorClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Compact, always-visible health/tension/trust/turn strip, with inventory/clues tucked into a subtle collapsible panel so it never competes with the transcript for attention. */
export default function StatusBar({ state }: StatusBarProps) {
  const tensionColor =
    state.tension >= 70
      ? "bg-danger"
      : state.tension >= 35
        ? "bg-[var(--door-torch)]"
        : "bg-success";

  const itemCount = state.inventory.length + state.clues.length;

  return (
    <div className="border-border bg-bg-elevated/80 flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <div>
          <div className="text-text-muted mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Icon name="heart" className="h-3.5 w-3.5" />
            Health
          </div>
          <Meter
            value={state.health}
            max={state.maxHealth}
            colorClass="bg-danger"
            label={`Health: ${state.health} of ${state.maxHealth}`}
          />
        </div>

        <div>
          <div className="text-text-muted mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Icon name="gauge" className="h-3.5 w-3.5" />
            Tension
          </div>
          <Meter
            value={state.tension}
            max={100}
            colorClass={tensionColor}
            label={`Tension: ${state.tension} of 100`}
          />
        </div>

        <div>
          <div className="text-text-muted mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Icon name="drama" className="h-3.5 w-3.5" />
            Trust
          </div>
          <Meter
            value={state.trust}
            max={100}
            colorClass="bg-accent"
            label={`Trust: ${state.trust} of 100`}
          />
        </div>

        <div>
          <div className="text-text-muted mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Icon name="footprints" className="h-3.5 w-3.5" />
            Turn
          </div>
          <span className="text-text text-sm font-medium">
            {state.turn} / {state.maxTurns}
          </span>
        </div>
      </div>

      <details className="group">
        <summary className="text-text-muted hover:text-text flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium select-none">
          <Icon
            name="chevron-down"
            className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
          />
          <Icon name="package" className="h-3.5 w-3.5" />
          Inventory &amp; clues
          {itemCount > 0 && (
            <span className="text-text-muted">({itemCount})</span>
          )}
        </summary>
        <div className="mt-2 flex flex-col gap-1.5 pl-5 text-sm">
          <p className="text-text">
            <span className="text-text-muted">Carrying: </span>
            {state.inventory.length > 0
              ? state.inventory.join(", ")
              : "nothing but your own two hands"}
          </p>
          {state.clues.length > 0 && (
            <p className="text-text">
              <span className="text-text-muted">Known: </span>
              {state.clues.length} clue{state.clues.length === 1 ? "" : "s"}{" "}
              discovered
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
