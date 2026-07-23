# OpenGames

`games.drewcassidy.dev` — a small, atmospheric games portal and the games-focused
sibling of [OpenToolbox](https://tools.drewcassidy.dev) (`tools.drewcassidy.dev`)
and [OpenApps](https://apps.drewcassidy.dev) (`apps.drewcassidy.dev`). Same stack,
same Cloudflare deployment pattern, same design-token shape — a different,
slightly more playful and atmospheric identity, and a games registry instead of
a tools/apps registry.

The first game is **AI Dungeon Door**: a compact text adventure about a
mysterious dungeon door, narrated one line at a time by a small language model
running entirely on your own PC through [LM Studio](https://lmstudio.ai) — never
the cloud. All game logic (health, inventory, win/loss, what your action
actually does) is decided by a deterministic engine; the model only rewrites an
already-decided outcome into one atmospheric sentence, and the game is fully
playable with polished prewritten narration even without LM Studio running.

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
  lib/games/            registry.ts (all games), schema.ts, categories.ts
  lib/games-logic/ai-dungeon-door/   deterministic engine, scenarios, intent parsing, narration prompt/sanitizer
  lib/bridge/client.ts   browser-side client for the local bridge (health check, one-request-at-a-time narration)
  islands/ai-dungeon-door/           the game's React UI (door scene, status bar, event log, action input)
  pages/index.astro      the portal homepage (hero, featured game, searchable grid)
  pages/ai-dungeon-door/ the game's own route
bridge/                  the local Node bridge to LM Studio (NOT part of the deployed site)
Start-AIDungeonDoor.ps1  Windows launcher: checks LM Studio, starts the bridge, opens the game
```

## Running locally

```
npm install
npm run dev        # http://localhost:4321
```

## Playing with local AI

1. Install/open [LM Studio](https://lmstudio.ai) and have a small instruct
   model available (see [docs/model-selection.md](docs/model-selection.md) —
   `qwen2.5-0.5b-instruct` is the default).
2. Start the bridge: `npm run bridge` (or just double-click
   `Start AI Dungeon Door.bat`, which checks everything and starts it for you).
3. Open the game. The header shows "Local AI connected" once the bridge and a
   model are both reachable.

The game is always playable without any of this — it falls back to polished
prewritten narration and says so in the UI.

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the registry, engine, and bridge fit together
- [docs/bridge.md](docs/bridge.md) — the local bridge's contract, security boundaries, and how to run it
- [docs/model-selection.md](docs/model-selection.md) — which model was chosen, why, and test evidence
- [docs/adding-a-game.md](docs/adding-a-game.md) — how to add the next game
- [docs/deployment.md](docs/deployment.md) — Cloudflare Workers deployment and custom domain setup

## Verification

```
npm run verify      # format:check, lint, check, test, build
node --test bridge/*.test.mjs
```
