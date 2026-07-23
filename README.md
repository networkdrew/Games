# OpenGames

`games.drewcassidy.dev` — a small, atmospheric games portal and the games-focused
sibling of [OpenToolbox](https://tools.drewcassidy.dev) (`tools.drewcassidy.dev`)
and [OpenApps](https://apps.drewcassidy.dev) (`apps.drewcassidy.dev`). Same stack,
same Cloudflare deployment pattern, same design-token shape — a different,
slightly more playful and atmospheric identity, and a games registry instead of
a tools/apps registry.

The first game is **AI Dungeon Door**: a free-form, AI-narrated chat
adventure about whatever waits behind a dungeon door, played out live with a
capable language model running entirely on your own PC through
[LM Studio](https://lmstudio.ai) — never the cloud. Say or do anything in
plain language; the model is the game master — it interprets your action,
narrates the entity's response, and streams it token-by-token — while a
small, bounded state proposal alongside that narration is independently
clamped and validated by the deterministic engine, so the model can never
invent state, health changes, or exits outside scenario-defined bounds. It
opens standalone, full-screen, like its own app — not another page in the
portal. See [docs/architecture.md](docs/architecture.md) for the full
design, and
[docs/dungeon-chat-model-selection.md](docs/dungeon-chat-model-selection.md)
for which model and why. The game is fully playable with polished
prewritten narration even without LM Studio running, and clearly says so in
the UI.

## Relationship to Tools and Apps

|          | Tools                                | Apps                                             | **Games**                               |
| -------- | ------------------------------------ | ------------------------------------------------ | --------------------------------------- |
| Domain   | tools.drewcassidy.dev                | apps.drewcassidy.dev                             | games.drewcassidy.dev                   |
| Stack    | Astro + React islands + Tailwind v4  | same                                             | same                                    |
| Registry | `src/lib/tools/`                     | `src/lib/apps/`                                  | `src/lib/games/`                        |
| Deploy   | Cloudflare Workers, `wrangler.jsonc` | same                                             | same                                    |
| Extra    | —                                    | richer SEO-oriented metadata, local-storage apps | local-AI games via a local bridge (new) |

This repo is separate from Tools and Apps — a different GitHub project and a
different Cloudflare deployment. Nothing here modifies either of those.

## Structure

```
src/
  games/
    ai-dungeon-door/       complete game feature: React entry, UI components, connection lifecycle, deterministic logic, and colocated tests
    ai-peoples-court/      complete courtroom game, case records, rules, and tests
  lib/games/            registry.ts (all games), schema.ts, categories.ts
  lib/bridge/client.ts   browser-side client for the local bridge (health/ensure/release, streaming turn+opening requests, one in-flight at a time)
  islands/GameGrid.tsx   portal-only searchable/filterable game grid
  components/react/GameAppShell.tsx  reusable standalone-app title bar + loading-screen shell for any local-AI game
  pages/index.astro      the portal homepage (hero, featured game, searchable grid)
  pages/ai-dungeon-door/ thin route adapter (chromeless, full-viewport — never the portal chrome)
  pages/ai-peoples-court/ thin route adapter for the second game
bridge/                  the local Node bridge to LM Studio (NOT part of the deployed site) — see docs/bridge.md
scripts/verify-live-model.mjs        live (non-mocked) check against a real running bridge + LM Studio
scripts/evaluate-dungeon-models.mjs  reusable model-evaluation harness — see docs/dungeon-chat-model-selection.md
Start-AIDungeonDoor.ps1  Windows launcher: checks LM Studio, starts the bridge, opens the game (the bridge itself loads the model on first connect)
```

Every game owns one folder under `src/games/<game-id>/`. Astro route adapters
must remain under `src/pages/` because Astro uses that directory to generate
URLs. Portal infrastructure, the validated registry, shared game shell, and
the single local bridge stay outside individual game folders intentionally.

## Running locally

```
npm install
npm run dev        # http://localhost:4321
```

## Playing with local AI

```
npm run play        # or double-click "Start AI Dungeon Door.bat"
```

That's it — no manual model loading step. The launcher starts LM Studio's
server and the bridge if they aren't already running, then opens the game.
The game itself connects to the bridge, loads its configured model
(`allenai_sera-8b`, alias `dungeon-chat` — see
[docs/dungeon-chat-model-selection.md](docs/dungeon-chat-model-selection.md))
automatically, and streams its opening scene once ready — no Refresh click
ever required. A subtle indicator in the title bar shows "Local storyteller
ready" (or "Offline story mode" if no local model is available); a
collapsed "Diagnostics" panel proves the model is actually being used
(exact model id, streaming timing, whether a turn required a correction or
fallback).

The game is always playable without any of this — it falls back to polished
prewritten narration and says so in the UI.

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the registry, engine, and bridge fit together
- [docs/bridge.md](docs/bridge.md) — the local bridge's contract, security boundaries, model lifecycle, and how to run it
- [docs/dungeon-chat-model-selection.md](docs/dungeon-chat-model-selection.md) — which model was chosen, why, and the full live evaluation
- [docs/adding-a-game.md](docs/adding-a-game.md) — how to add the next game
- [docs/deployment.md](docs/deployment.md) — Cloudflare Workers deployment and custom domain setup

## Verification

```
npm run verify      # format:check, lint, check, test, build
node --test bridge/*.test.mjs
```
