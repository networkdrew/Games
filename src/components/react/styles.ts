/** Shared Tailwind class strings so every game/UI surface looks consistent. */

export const buttonPrimary =
  "inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export const buttonSecondary =
  "inline-flex items-center gap-2 rounded-md border border-border-strong bg-bg-elevated px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-bg-sunken disabled:cursor-not-allowed disabled:opacity-50";

export const buttonGhost =
  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg-sunken hover:text-text disabled:cursor-not-allowed disabled:opacity-50";

export const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-sunken hover:text-text disabled:cursor-not-allowed disabled:opacity-50";

export const textField =
  "w-full rounded-md border border-border-strong bg-bg-elevated px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent";

export const badge =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase";
