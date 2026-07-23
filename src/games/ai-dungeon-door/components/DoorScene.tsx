import { useEffect, useState } from "react";
import type { GameStatus } from "../logic/types";

interface DoorSceneProps {
  tension: number;
  status: GameStatus;
}

/** Pauses CSS animations while the tab is hidden — no GPU/CPU work happens off-screen. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    function onChange() {
      setVisible(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export default function DoorScene({ tension, status }: DoorSceneProps) {
  const visible = usePageVisible();
  const moodClass =
    status !== "playing"
      ? status === "won"
        ? "door-scene--won"
        : "door-scene--lost"
      : tension >= 70
        ? "door-scene--danger"
        : tension >= 35
          ? "door-scene--tense"
          : "door-scene--calm";

  return (
    <div
      className={`door-scene ${moodClass} ${visible ? "" : "door-scene--paused"}`}
      aria-hidden="true"
    >
      <div className="door-scene__fog" />
      <svg
        viewBox="0 0 200 260"
        className="door-scene__door"
        role="presentation"
      >
        <rect
          x="10"
          y="10"
          width="180"
          height="240"
          rx="6"
          className="door-scene__frame"
        />
        <rect
          x="24"
          y="24"
          width="152"
          height="212"
          rx="4"
          className="door-scene__wood"
        />
        <rect
          x="38"
          y="38"
          width="54"
          height="86"
          rx="3"
          className="door-scene__panel"
        />
        <rect
          x="108"
          y="38"
          width="54"
          height="86"
          rx="3"
          className="door-scene__panel"
        />
        <rect
          x="38"
          y="134"
          width="54"
          height="86"
          rx="3"
          className="door-scene__panel"
        />
        <rect
          x="108"
          y="134"
          width="54"
          height="86"
          rx="3"
          className="door-scene__panel"
        />
        <circle cx="150" cy="132" r="5" className="door-scene__handle" />
        <circle cx="100" cy="20" r="7" className="door-scene__rune" />
      </svg>
      <div className="door-scene__torch door-scene__torch--left" />
      <div className="door-scene__torch door-scene__torch--right" />
    </div>
  );
}
