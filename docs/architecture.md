# Architecture

## Stack

Astro (static output) + React islands for interactive game UIs + TypeScript
(strict) + Tailwind CSS v4 + Zod + Vitest + Testing Library. Same as
OpenToolbox and OpenApps. Deployed as a fully static site to Cloudflare
Workers — see `deployment.md`.

## Registry-driven games

`src/lib/games/registry.ts` is the single authoritative source of game
metadata (`GameMeta`, validated by `src/lib/games/schema.ts`). Nothing else —
pages, the homepage grid, the sitemap — hardcodes a game's name, description,
or route. `src/lib/games/categories.ts` holds the (currently short) list of
game categories. See `adding-a-game.md` for the checklist to add one.

The homepage (`src/pages/index.astro`) reads the registry, maps it to the
plain-object `GameCardData` shape, and hands it to the `GameGrid` React
island (`src/islands/GameGrid.tsx`) for client-side search/filter — no search
library, just a substring match over name/tagline/tags, which is instant at
this scale and needs no dependency.

Each game is served at its own **top-level route** (`/ai-dungeon-door/`, not
`/games/ai-dungeon-door/`) via `GameLayout.astro`, matching what the user
asked for and mirroring OpenApps' pattern for games/apps that deserve a
permanent top-level URL instead of the default nested one.

## AI Dungeon Door's critical architecture rule

**The language model never controls game state.** Everything that matters —
scenario, secret, valid solutions, inventory, health, damage, clues, turns,
tension, win/loss conditions, whether an action succeeds — is decided by
plain deterministic TypeScript in `src/lib/games-logic/ai-dungeon-door/`:

1. `intent.ts` — lightweight keyword/intent matching turns free text into one
   of a fixed set of `BaseIntent`s (`listen`, `knock`, `use-item`, `ask`, …).
   No LLM call, no fuzzy NLP — a plain regex table.
2. `scenarios.ts` — 8 scenario templates, each a pure `resolve(action, state)`
   function that decides the real `Outcome` (damage, clues, items, win/loss)
   for that action in that scenario.
3. `engine.ts` — `applyAction()` is the single place turn count, health,
   tension, inventory, and win/loss are ever mutated. It calls the scenario's
   `resolve()`, applies the result, and returns the new `GameState` plus the
   `Outcome` — before the model is ever involved.
4. `narration.ts` — only _after_ the outcome is fully decided, this builds a
   compact prompt (`doorPersonality`, a tension word, and `outcome.summary`)
   and asks the model to rewrite it as one atmospheric line.
   `sanitizeNarration()` strips formatting/reasoning/refusals and enforces a
   length cap; if the model is unavailable or its output fails validation,
   `resolveNarration()` falls back to `outcome.fallbackNarration` — prewritten
   text authored alongside every outcome, so the game is always fully
   playable without AI.

The React island (`src/islands/ai-dungeon-door/AIDungeonDoorGame.tsx`) just
wires these together: `applyAction` → (if connected) `BridgeClient.narrate()`
→ `resolveNarration` → append to history. It never sends the model anything
but that one compact outcome — not the transcript, not the game state, not a
system-prompt override.

See `bridge.md` for the local bridge this talks to, and `model-selection.md`
for why `qwen2.5-0.5b-instruct` was chosen and what its real limitations are.

## Shared UI

`BaseLayout.astro` has two modes, same as OpenApps: normal chrome (`Header`/
`Footer`) for the portal, and a chromeless `shell` mode for the game's own
viewport-filling application shell. Design tokens (`src/styles/global.css`)
reuse the exact same variable names as Tools/Apps (`--color-bg`,
`--color-accent`, etc.) with different values — a cooler violet family — plus
a `.dungeon-door`-scoped set of extra tokens (torch/rune/fog colors) for the
door scene, the same pattern OpenApps uses for OpenBudget's chart colors.
