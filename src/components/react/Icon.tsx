/**
 * React equivalent of src/components/astro/Icon.astro, for use inside
 * client islands (the game shell, status bar, etc.) — same inlined-SVG
 * approach, just wired through Vite's raw-import glob instead of Astro's.
 */
const icons = import.meta.glob<string>("/src/icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

export type IconName =
  | "chevron-down"
  | "circle-x"
  | "door-open"
  | "drama"
  | "ear"
  | "footprints"
  | "gauge"
  | "hammer"
  | "hand"
  | "heart"
  | "home"
  | "info"
  | "key"
  | "maximize"
  | "menu"
  | "message-circle"
  | "minimize"
  | "moon"
  | "package"
  | "refresh-cw"
  | "scroll-text"
  | "search"
  | "shield-check"
  | "skull"
  | "sun"
  | "sword"
  | "volume-2"
  | "wifi"
  | "wifi-off"
  | "x"
  | "zap";

interface IconProps {
  name: IconName;
  className?: string;
}

export default function Icon({ name, className }: IconProps) {
  const raw = icons[`/src/icons/${name}.svg`];
  if (!raw) {
    throw new Error(`Unknown icon "${name}" — add src/icons/${name}.svg first`);
  }
  const svg = raw
    .replace("<svg", `<svg class="${className ?? ""}" aria-hidden="true"`)
    .replace(' width="24"', "")
    .replace(' height="24"', "");
  return (
    <span className="contents" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
