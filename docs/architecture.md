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

## AI Dungeon Door: a free-form, model-as-game-master architecture

This is a genuinely model-driven, free-form chat adventure — the model
interprets whatever the player types, in natural language, with no keyword
matching and no closed set of pre-written outcomes to pick from. It still
cannot corrupt authoritative state: the engine independently clamps and
validates every proposed change before it ever touches `GameState`. Two
parallel paths (see `types.ts`'s module docstring for the authoritative
version of this split):

**The free-form AI path** (normal play, model connected) — the model is the
game master:

- `scenarios.ts` — 8 scenarios, each defining a `secretTruth` and
  `doorPersonality` (character prompt) as before, plus a richer free-form
  profile: `entity` (identity/personality/goals/fear/desire/relationship/
  voice), `environment`, `objects`, `factsKnown`/`factsRevealable`/
  `factsHidden`, `memoryPriorities`, `bounds` (per-turn magnitude caps on
  health/tension/trust deltas), `clueAllowlist`/`itemAllowlist` (the only
  clue/item ids the model may ever award), `endings`, and `checkEnding(state,
kind)` — the engine's own authority on whether a WIN/LOSS is _currently_
  reachable, independent of whatever the model requests.
- `engine.ts` — `buildAiTurnContext(state)` assembles the bounded payload
  sent to the bridge each turn. `applyControlProposal(state, scenario,
proposal, narration)` is the **only** place health, tension, trust, stage,
  inventory, clues, and win/loss are ever mutated for an AI turn: every
  numeric field is clamped to `scenario.bounds`, every clue/item id is
  checked against the scenario's own allowlist, and an ending is only ever
  granted if `scenario.checkEnding` independently agrees. Invalid individual
  fields are dropped (reported in `corrections`, never shown to the player)
  rather than discarding an otherwise-good narrated turn.

**The deterministic path** (offline play, and the final safe fallback after
a malformed AI response can't be corrected) — unchanged from the original
design, and still fully independent of the model:

- `intent.ts` — lightweight keyword/intent matching, used only here, never
  sent to the model as "the interpretation."
- `scenarios.ts`'s `getLegalOutcomes(state)`/`chooseDeterministicOutcome` —
  the original closed-vocabulary `LegalOutcome` system, preserved exactly as
  it was, so the game is always fully playable with zero AI.
- `engine.ts`'s `applyLegalOutcome()`/`applyDeterministicAction()` — mutates
  state from an already-chosen `LegalOutcome`, identically whether picked by
  the deterministic chooser or reached as a fallback.

For a connected turn, the browser (`AIDungeonDoorGame.tsx`) builds the turn
context and streams it to the local bridge's `POST /api/dungeon/turn` with
`mode: "turn"`. The model's response is a small hidden `CONTROL:` block
(never shown to the player) followed by the actual `RESPONSE:` narration —
see `bridge.md` for the exact protocol. A new game's opening scene is
itself model-generated: the same endpoint with `mode: "opening"` asks the
model to establish atmosphere with no `CONTROL` block required, since
there's no player action to interpret yet (see `useBridgeConnection.ts` and
`AIDungeonDoorGame.tsx`'s `runOpening`).

If the model's first attempt has no parseable `RESPONSE:` marker at all, the
bridge retries once with a compact correction prompt; if that also fails (or
no model is available at all), it signals `fallback: true` and the browser
falls back to the exact same deterministic engine used for fully offline
play — so "AI failed" and "no AI available" both degrade to the identical,
always-reliable code path. A malformed _individual_ `CONTROL` field (an
invalid clue id, an out-of-range delta) does **not** trigger a retry or
discard the narration — it's clamped/dropped in place, since the whole point
is to never throw away a good conversational response over one bad optional
field.

### Streaming protocol

`bridge/server.mjs`'s `/api/dungeon/turn` returns a newline-delimited JSON
event stream (`start` → `model` → optional `loading` → `delta`* →
`control`/`opening` → `done`, or an early `control{fallback:true}` + `done`
with no deltas). The bridge buffers only the `CONTROL:` block internally —
as soon as it sees the `RESPONSE:` marker, every subsequent chunk from LM
Studio's own SSE stream is forwarded to the browser as a `delta` event in
real time. This is real token/chunk streaming, not a full response revealed
gradually — see `bridge.md`.

The browser (`src/lib/bridge/client.ts`'s `streamTurn`) reads the response
body as a `ReadableStream`, parses each NDJSON line as it arrives, and
renders `delta` text live in `EventLog.tsx` before the turn finishes. Only
after a `done` event (meaning a complete response) does the browser commit
the turn: validate and apply the proposal via `applyControlProposal`,
sanitize and store the narration, and update the rolling memory. A
cancelled/aborted turn (new action submitted, new game started, or the
component unmounting) never reaches that commit step — see `client.ts`'s
`cancelPending()` and `AIDungeonDoorGame.tsx`.

### Validation and sanitization

`narration.ts` (browser) and `bridge/protocol.mjs` (bridge, duplicated on
purpose — the bridge is a separate, dependency-free Node runtime with no
shared build step) both:

- Strip HTML, code fences, role prefixes, `<think>` blocks, and reject
  output containing meta-commentary ("as an AI...", "system prompt...").
- Truncate at a hard word cap, and at the first sign of a stray repeated
  protocol line (`CONTROL:`/`RESPONSE:` leaking after real narration).
- Cap and sanitize the `memory` continuity fact separately, rejecting
  anything that reads like an instruction rather than a short fact (a
  minimal defense against a memory field being used for prompt injection).

`bridge/protocol.mjs`'s `buildProposal` additionally clamps every numeric
`CONTROL` field to the caller-supplied bounds and checks clue/item ids
against the caller-supplied allowlists — the bridge's own layer of
validation. The browser then independently re-validates via
`applyControlProposal` before ever mutating `GameState` — defense in depth;
the network layer is never trusted alone.

### Connection lifecycle

The browser never requires a manual "Reconnect" click. `useBridgeConnection`
(a small state machine — `connecting → loading-model → warming → ready`,
with `reconnecting`/`offline`/`failed` as the recovery/degraded states)
connects on mount, triggers an explicit model load via `POST
/api/dungeon/ensure` when needed (bridge-side single-flighted, so multiple
tabs never race to load the same model), and only exposes a manual Retry
button once retries are exhausted. See `bridge.md`'s model-lifecycle
section for the load/unload/TTL mechanics themselves.

## Shared UI

`BaseLayout.astro` has two modes, same as OpenApps: normal chrome (`Header`/
`Footer`) for the portal, and a chromeless `shell` mode for the game's own
viewport-filling application shell. Design tokens (`src/styles/global.css`)
reuse the exact same variable names as Tools/Apps with different values — a
cooler violet family — plus a `.dungeon-door`-scoped set of extra tokens
(torch/rune/fog colors) for the door scene.
