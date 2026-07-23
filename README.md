# OpenGames

`games.drewcassidy.dev` — a small, atmospheric games portal and the games-focused
sibling of [OpenToolbox](https://tools.drewcassidy.dev) (`tools.drewcassidy.dev`)
and [OpenApps](https://apps.drewcassidy.dev) (`apps.drewcassidy.dev`). Same stack,
same Cloudflare deployment pattern, same design-token shape — a different,
slightly more playful and atmospheric identity, and a games registry instead of
a tools/apps registry.

The first game is **AI Dungeon Door**: a genuinely LLM-driven text adventure
about a mysterious dungeon door, played out live with a capable language model
running entirely on your own PC through [LM Studio](https://lmstudio.ai) — never
the cloud. The model interprets your free-text actions, roleplays the entity
behind the door, and streams its narration token-by-token — but it can only
ever choose from a bounded list of outcomes the deterministic engine decides
are currently legal; it never invents state, health changes, or exits. See
[docs/architecture.md](docs/architecture.md) for the full hybrid design, and
[docs/model-selection.md](docs/model-selection.md) for which model and why.
The game is fully playable with polished prewritten narration even without
LM Studio running, and clearly says so in the UI.

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
  lib/games-logic/ai-dungeon-door/   deterministic engine, scenarios (legal outcomes + character prompts), intent parsing, narration sanitizers
  lib/bridge/client.ts   browser-side client for the local bridge (health check, streaming turn requests, one in-flight at a time)
  islands/ai-dungeon-door/           the game's React UI (door scene, status bar, streaming event log, diagnostics panel)
  pages/index.astro      the portal homepage (hero, featured game, searchable grid)
  pages/ai-dungeon-door/ the game's own route
bridge/                  the local Node bridge to LM Studio (NOT part of the deployed site) — see docs/bridge.md
scripts/verify-live-model.mjs   live (non-mocked) check against a real running bridge + LM Studio
Start-AIDungeonDoor.ps1  Windows launcher: checks LM Studio, starts the bridge, opens the game
```

## Running locally

```
npm install
npm run dev        # http://localhost:4321
```

## Playing with local AI

1. Install/open [LM Studio](https://lmstudio.ai) and have a capable instruct
   model loaded (see [docs/model-selection.md](docs/model-selection.md) —
   `ornith-1.0-9b` is the default; `qwen/qwen3.5-9b` is the fallback).
2. Start the bridge: `npm run bridge` (or just double-click
   `Start AI Dungeon Door.bat`, which checks everything and starts it for you).
3. Open the game. The header shows "Local AI: Ornith 9B connected" once the
   bridge and a model are both reachable. An optional "Tiny Model
   (experimental)" checkbox lets you try `qwen2.5-0.5b-instruct` instead — it
   is never selected automatically. A collapsed "Diagnostics" panel proves
   the model is actually being used (exact model id, streaming timing, token
   counts, whether a turn required a fallback).

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
