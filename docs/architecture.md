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

Each game is served at its own **top-level route** (`/ai-dungeon-door/`, not
`/games/ai-dungeon-door/`) via `GameLayout.astro`.

## AI Dungeon Door: a hybrid, LLM-driven architecture

This is a genuinely model-driven game, not a deterministic game with
cosmetic AI narration bolted on — but the model still cannot corrupt
authoritative state. The split:

**Code owns hard state and decides what's legally possible:**

- `intent.ts` — lightweight keyword/intent matching, used only by the
  **deterministic chooser** (offline play, or the model's own safe
  fallback) — never sent to the model as "the interpretation."
- `scenarios.ts` — 8 scenarios, each defining a `secretTruth` (hidden
  context for the model), a `doorPersonality` (character prompt), and a
  `getLegalOutcomes(state)` function returning the full, bounded set of
  `LegalOutcome`s that make sense _right now_ — each with a fixed `id` from
  a closed vocabulary (`NO_EFFECT`, `REVEAL_SOUND_CLUE`,
  `ENTITY_TRUST_INCREASES`, `OPEN_DOOR`, ... see `types.ts`), a
  plain-language `description` for the model, an engine-decided
  `StateChangeSpec` (exact damage/tension/trust/clue/item effect — never
  chosen or sized by the model), and a prewritten `fallbackNarration`.
- `engine.ts` — `applyLegalOutcome()` is the **only** place health, tension,
  trust, stage, inventory, clues, and win/loss are ever mutated. It takes an
  already-chosen `LegalOutcome` — never player text, never raw model
  output — and applies its fixed `StateChangeSpec`. Called identically
  whether the outcome was chosen by a model, the deterministic chooser, or
  the safe post-correction fallback.

**The model interprets the player and narrates:**

For a connected turn, the browser (`AIDungeonDoorGame.tsx`) builds a
`TurnContext` (`engine.ts`'s `buildTurnContext`) — the character prompt,
secret truth, a compact state summary, the current legal outcomes list, a
bounded rolling memory, and the last few exchanges — and streams it to the
local bridge's `POST /api/dungeon/turn`. The model's only job is to pick
**one** outcome `id` from the supplied list and narrate it. It cannot invent
a new id, and even if it tries, the bridge validates the id against the
caller's own legal list before any narration is forwarded to the browser
(see `bridge.md`). Only after the bridge confirms a valid choice does the
browser call `applyLegalOutcome` with that outcome — the model never touches
`GameState` directly, at any point.

If the model's first attempt is invalid, the bridge retries once with a
compact correction prompt; if that also fails (or no model is available at
all), it signals `fallback: true` and the browser falls back to the exact
same deterministic chooser used for fully offline play
(`applyDeterministicAction`) — so "AI failed" and "no AI available" both
degrade to the identical, always-reliable code path.

### Streaming protocol

`bridge/server.mjs`'s `/api/dungeon/turn` returns a newline-delimited JSON
event stream (`start` → `model` → `delta`* → `outcome` → `done`, or an early
`outcome{fallback:true}` + `done` with no deltas). The bridge buffers only
the short `OUTCOME:`/`MEMORY:` header lines internally — as soon as it sees
a valid outcome id and the `NARRATION:` marker, every subsequent chunk from
LM Studio's own SSE stream is forwarded to the browser as a `delta` event in
real time. This is real token/chunk streaming, not a full response revealed
gradually — see `bridge.md`.

The browser (`src/lib/bridge/client.ts`'s `streamTurn`) reads the response
body as a `ReadableStream`, parses each NDJSON line as it arrives, and
renders `delta` text live in `EventLog.tsx` before the turn finishes. Only
after a `done` event (meaning a valid, complete response) does the browser
commit the turn: apply the validated outcome, sanitize and store the
narration, and update the rolling memory. A cancelled/aborted turn (new
action submitted, run reset, or the component unmounting) never reaches that
commit step — see `client.ts`'s `cancelPending()` and `AIDungeonDoorGame.tsx`.

### Validation and sanitization

`narration.ts` (browser) and `bridge/protocol.mjs` (bridge, duplicated on
purpose — the bridge is a separate, dependency-free Node runtime with no
shared build step) both:

- Strip HTML, code fences, role prefixes, `<think>` blocks, and reject
  output containing meta-commentary ("as an AI...", "legal outcomes...").
- Truncate at a hard word cap, and at the first sign of a stray repeated
  protocol line (`OUTCOME:`/`MEMORY:` leaking after real narration — a real
  behavior seen live against `ornith-1.0-9b`, see `model-selection.md`).
- Cap and sanitize the `MEMORY:` continuity fact separately, rejecting
  anything that reads like an instruction rather than a short fact (a
  minimal defense against a memory field being used for prompt injection).

The browser additionally re-validates the outcome id the bridge reports
against its own legal-outcomes list before ever calling `applyLegalOutcome`
— defense in depth; the network layer is never trusted alone.

## Shared UI

`BaseLayout.astro` has two modes, same as OpenApps: normal chrome (`Header`/
`Footer`) for the portal, and a chromeless `shell` mode for the game's own
viewport-filling application shell. Design tokens (`src/styles/global.css`)
reuse the exact same variable names as Tools/Apps with different values — a
cooler violet family — plus a `.dungeon-door`-scoped set of extra tokens
(torch/rune/fog colors) for the door scene.
