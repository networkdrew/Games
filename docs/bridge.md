# The local bridge

`bridge/` is a tiny, dependency-free Node process that runs only on your PC.
It is the _only_ thing allowed to talk to LM Studio (including shelling out
to the `lms` CLI for model load/unload), and it is never deployed to
Cloudflare — the production build (`npm run build` / `wrangler deploy`)
contains only the static site in `dist/client`.

```
                 loopback only
 games.drewcassidy.dev  ────────►  bridge (127.0.0.1:8934)  ────►  LM Studio (127.0.0.1:1234)
   (public, HTTPS)                  (local, plain HTTP)              (local, plain HTTP)
```

## Why a bridge instead of the browser talking to LM Studio directly

LM Studio's local server has no origin allowlist, no rate limiting, no
request validation, and exposes model-management endpoints — it is meant to
be used by trusted local tools, not called directly from a public web page.
The bridge sits in front of it so the public site can reach a local model
without any of that being exposed, and without ever exposing LM Studio to
the public internet.

## The model: one stable alias, never a client-supplied id

The game only ever asks for `"dungeon-chat"` — the stable alias defined in
`bridge/models.mjs`, which maps it to a real LM Studio identifier and a set
of tuned inference settings (temperature, max tokens, context length, GPU
offload, TTL, reasoning-disable params). See
`docs/dungeon-chat-model-selection.md` for how that mapping was chosen.
Nothing else in the codebase hardcodes a model id — a `dungeon-chat-reference`
alias (Ornith, the model that originally proved this architecture) and a
`dungeon-chat-tiny` alias also exist in that same file for comparison/
experimentation, but the client never chooses between them; the bridge
always serves `dungeon-chat`.

## Endpoints

- `GET /health` → `{ ok, installed, loaded, alias?, modelId?, friendlyName? }`.
  A cheap, read-only check — `installed` means LM Studio reports the
  configured model on disk at all; `loaded` means it's currently resident in
  memory. Called by the browser's connection state machine on mount and on
  retry, never polled on an interval while healthy.
- `POST /api/dungeon/ensure` → triggers (and single-flights) an explicit
  model load with this game's tuned settings if it isn't loaded yet.
  Resolves once loaded or failed: `{ ok, alreadyLoaded?, modelId?, tookMs? }`.
  A second request while a load is already in progress gets `429`, so
  multiple browser tabs never race to load the same model twice.
- `POST /api/dungeon/release` → unloads the model this bridge loaded (only
  that one — never a different, manually-loaded model). Used by the
  "Release local model" advanced-settings action; never called
  automatically.
- `POST /api/dungeon/turn` — the real, free-form, LLM-driven pipeline.
  Request body's `mode` field selects between two shapes:

  - `mode: "opening"` — `{ mode, characterPrompt, secretTruth, environment }`.
    Generates the run's opening scene; no `CONTROL` block, since there's no
    player action yet.
  - `mode: "turn"` — `{ mode, characterPrompt, secretTruth, environment,
stateSummary, bounds: {healthMagnitude, tensionMagnitude, trustMagnitude},
clueAllowlist: [{id, hint}], itemAllowlist: [{id, hint}], endings:
[{id, kind, hint}], memoryFacts, recentExchanges, playerAction }`, every
    field size-capped (`bridge/config.mjs`).

  Response is a newline-delimited JSON event stream:

  ```
  {"type":"start","requestId":"..."}
  {"type":"model","modelId":"qwen/qwen3.5-9b","alias":"dungeon-chat","friendlyName":"Qwen3.5 9B"}
  {"type":"loading"}                          // only if the model wasn't already loaded
  {"type":"delta","text":"You press "}
  {"type":"delta","text":"your ear to the door..."}
  {"type":"control","proposal":{"intent":"...", "healthDelta":0, "tensionDelta":-2, ...},"fallback":false,"corrected":false,"corrections":[]}
  {"type":"done","stats":{"firstTokenMs":250,"totalMs":1300,"chunks":42,"fallback":false,"corrected":false}}
  ```

  (`mode: "opening"` responses use `{"type":"opening","ok":true,"fallback":false}`
  instead of a `control` event.)

  `fallback: true` (with no `delta` events at all) means "no valid AI
  response was produced — the client should use its own deterministic
  engine for this turn," and happens whenever the configured model isn't
  installed, or the model's response has no parseable `CONTROL`/`RESPONSE`
  structure even after one correction retry. This is not an HTTP error; the
  response is still `200`.

Nothing else. No general LM Studio proxy, no way for the page to submit a
custom system prompt or an arbitrary model id — the client can only fill in
the bounded content fields above; the bridge's own system prompt
(`bridge/protocol.mjs`) is fixed and never client-supplied.

## How a turn is validated (see `bridge/server.mjs`, `bridge/protocol.mjs`)

1. The model streams a `CONTROL:` block (`intent=`, `health_delta=`,
   `tension_delta=`, `trust_delta=`, `discover_clue=`, `gain_item=`,
   `consume_item=`, `advance_stage=`, `ending=`, `memory=`, one `key=value`
   per line) followed by a `RESPONSE:` marker and the actual narration.
2. The bridge buffers only the pre-`RESPONSE:` text internally — nothing is
   forwarded to the browser yet.
3. As soon as the `RESPONSE:` marker appears, every further chunk streams
   straight to the browser as a `delta` event, in real time, exactly as LM
   Studio emits it — the CONTROL block is parsed from the already-buffered
   text after generation completes, it never blocks narration from
   streaming.
4. Once streaming ends, `buildProposal` (`bridge/protocol.mjs`) converts the
   raw `CONTROL` fields into a typed proposal: every numeric delta is
   clamped to the caller-supplied `bounds`, every `discover_clue`/`gain_item`
   id is checked against the caller-supplied allowlist, `ending` is checked
   against the caller-supplied `endings` list. Invalid fields are dropped
   individually (recorded in `corrections`) — the narration still streams
   to the player either way.
5. If the model's response never contained a `RESPONSE:` marker at all (a
   genuinely malformed reply, not just one bad field), the bridge retries
   **once** with a compact correction prompt (non-streamed, since it's a
   recovery path, not the primary experience). If that succeeds, its
   narration streams as a single `delta` and the control event is marked
   `corrected: true`. If it fails again, the bridge sends
   `control{fallback:true}` and the client falls back to its own
   deterministic engine.

The client (`AIDungeonDoorGame.tsx`) then independently re-validates and
applies the proposal via `applyControlProposal` (`engine.ts`) — including
the final authority on whether a requested ending is actually reachable
(`scenario.checkEnding`) — before anything touches `GameState`.

## Model lifecycle: load, TTL, and unload

- **Loading**: `bridge/lmstudio.mjs`'s `ensureModelLoaded(config)` shells out
  to `lms load <id> -y --context-length <n> --gpu <offload> --ttl <seconds>`,
  giving this game's own tuned settings (see `models.mjs`) rather than
  relying on LM Studio's default just-in-time settings. Single-flighted
  in-process (a `Map` of in-flight load promises keyed by model id) so
  concurrent requests — including from multiple browser tabs sharing one
  bridge — never trigger two simultaneous loads of the same model.
- **Readiness check**: `getModelState(id)` reads LM Studio's native
  `GET /api/v0/models` (distinct from the OpenAI-compatible `/v1/models`,
  which lists every model on disk regardless of load state) to see the live
  `"loaded"`/`"not-loaded"` state without shelling out.
- **TTL/idle unload**: enforced natively by LM Studio via the `--ttl` flag
  passed at load time (confirmed live via `lms ps`, which reports a live
  countdown next to the loaded model) — currently 900 seconds (15 minutes)
  for the default `dungeon-chat` alias, in `models.mjs`. The bridge itself
  does not run a separate idle timer; it trusts LM Studio's own mechanism,
  which was directly observed to work on this installed version.
- **Manual release**: `POST /api/dungeon/release` calls `lms unload <id>`
  for exactly the model this bridge is configured to use — never a
  different, separately/manually loaded model.
- **Reload after unload**: transparent to the player — the next turn's
  `getModelState` check reports `"not-loaded"`, the bridge calls
  `ensureModelLoaded` again before generating, and the browser shows the
  same "Waking the dungeon" transition it shows on first connect.

## Security boundaries (see `bridge/server.mjs`, `bridge/config.mjs`)

- **Binds to `127.0.0.1` by default** — unreachable from other devices on
  the network unless explicitly reconfigured.
- **Origin allowlist**: only `https://games.drewcassidy.dev` and local dev
  origins are accepted; every other `Origin` header gets a 403.
- **Fixed prompt template, bounded fields**: `characterPrompt`,
  `secretTruth`, `environment`, `stateSummary`, each allowlist entry's
  `hint`, `memoryFacts[]`, `recentExchanges[]`, and `playerAction` are all
  length-capped (`bridge/config.mjs`). Never a client-supplied system prompt
  or model id — the client can only select `mode: "turn"|"opening"`, never
  a free-text model name.
- **Body size cap** (`MAX_BODY_BYTES`): oversized requests get a 413.
- **Rate limiting + single-flight**: one `busy` flag rejects a second
  `/api/dungeon/turn` call while one is in flight (429); a minimum interval
  rejects requests that come in too fast — this also enforces "exactly one
  active generation at a time."
- **Reasoning disabled explicitly** for models known to need it (see
  `models.mjs`'s `reasoningDisableParams` per model, and
  `docs/dungeon-chat-model-selection.md` for why this was necessary and how
  it was discovered).
- **No player-text logging by default**: the bridge logs a request id,
  model id, mode, prompt size, timing, and correction count — never the
  player's actual text.
- **No file-system, shell, or browser access is ever given to the
  model** — it's a chat-completion call with a fixed prompt shape; it
  cannot call tools, run code, or take any action beyond returning text. The
  bridge itself is the only thing that ever shells out (to `lms`), and only
  for load/unload — never with model-supplied input.

## Running it

```
npm run bridge              # node bridge/server.mjs
npm run bridge:test          # node --test bridge/*.test.mjs
node scripts/verify-live-model.mjs        # live check against a real running bridge + LM Studio
node scripts/evaluate-dungeon-models.mjs  # the full model-evaluation harness (see the model-selection doc)
```

Or let `Start-AIDungeonDoor.ps1` / `Start AI Dungeon Door.bat` / `npm run
play` do it for you — it starts LM Studio's server and the bridge, then
opens the game; the bridge itself loads the model on first connect, so no
separate "load a model" step is needed.

Configuration is via environment variables (all optional, see
`bridge/config.mjs`/`bridge/models.mjs`): `BRIDGE_HOST`, `BRIDGE_PORT`,
`LM_STUDIO_URL`, `BRIDGE_MODEL` (overrides the `dungeon-chat` alias's target
id), `BRIDGE_REFERENCE_MODEL`, `BRIDGE_TINY_MODEL`.

## Browser behavior: what was actually verified vs. what's expected

What was tested directly in this repo, in a real browser, against real
locally-installed models: health/ensure/release endpoints, multi-turn
streaming conversations with real continuity, the CONTROL/RESPONSE parser
against several different real models (see the model-selection doc for the
full live evaluation), origin rejection, rate limiting, and the fully
offline deterministic path.

What's expected but **not yet tested against a live deployment** (the site
hasn't been deployed to Cloudflare in this session): once
`https://games.drewcassidy.dev` is live, calling `http://127.0.0.1:8934` from
that HTTPS page should still work, because loopback addresses are treated as
a "potentially trustworthy origin" by Chromium and Firefox, exempted from
the mixed-content block that would otherwise apply to `https://` → plain
`http://` requests. This is documented browser behavior, not a guess, but it
should be re-confirmed once the real deployment exists.

If it were ever blocked, the fallback is already built in:
`Start-AIDungeonDoor.ps1 -Dev` serves the identical static build from
`localhost` instead. And even with the bridge fully unreachable for any
reason, the game itself never breaks — it always falls back to deterministic
narration, clearly labeled as such.
