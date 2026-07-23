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

export default function StatusBar({ state }: StatusBarProps) {
  const tensionColor =
    state.tension >= 70
      ? "bg-danger"
      : state.tension >= 35
        ? "bg-[var(--door-torch)]"
        : "bg-success";

  return (
    <div className="border-border bg-bg-elevated/80 grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border p-3 text-sm sm:grid-cols-4">
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
        <span className="text-text-muted mt-1 block text-xs">
          {state.health} / {state.maxHealth}
        </span>
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
        <span className="text-text-muted mt-1 block text-xs">
          {state.tension} / 100
        </span>
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

      <div className="col-span-2 sm:col-span-1">
        <div className="text-text-muted mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <Icon name="package" className="h-3.5 w-3.5" />
          Inventory
        </div>
        <span
          className="text-text block truncate text-sm"
          title={state.inventory.join(", ")}
        >
          {state.inventory.length > 0 ? state.inventory.join(", ") : "empty"}
        </span>
      </div>
    </div>
  );
}
