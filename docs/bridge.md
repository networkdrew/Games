# The local bridge

`bridge/` is a tiny, dependency-free Node process that runs only on your PC.
It is the _only_ thing allowed to talk to LM Studio, and it is never
deployed to Cloudflare — the production build (`npm run build` /
`wrangler deploy`) contains only the static site in `dist/client`.

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

## Endpoints

- `GET /health` → `{ ok: boolean, primaryModelId?: string, tinyModelId?: string }`.
  The **only** thing polled on demand — once on page load, and once when
  the player clicks "Reconnect." Never polled on an interval. Reports both
  model tiers so the UI can show "Local AI: Ornith 9B connected" and still
  offer the experimental Tiny Model checkbox.
- `POST /api/dungeon/turn` — the real, LLM-driven turn endpoint. Request
  body: `{ modelTier: "primary"|"tiny", characterPrompt, secretTruth,
stateSummary, legalOutcomes: [{id, description}], memoryFacts: string[],
recentExchanges: [{action, narration}], playerAction }`, every field
  size-capped (`bridge/config.mjs`). Response is a newline-delimited JSON
  event stream:

  ```
  {"type":"start","requestId":"..."}
  {"type":"model","modelId":"ornith-1.0-9b","tier":"primary"}
  {"type":"delta","text":"You press "}
  {"type":"delta","text":"your ear to the door..."}
  {"type":"outcome","id":"REVEAL_SOUND_CLUE","memoryFact":"...","fallback":false,"corrected":false}
  {"type":"done","stats":{"firstTokenMs":502,"totalMs":1313,"chunks":73,"fallback":false,"corrected":false}}
  ```

  `fallback: true` (with no `delta` events at all) means "no valid AI
  response was produced — the client should use its own deterministic
  engine for this turn," and happens whenever no model is loaded for the
  requested tier, or the model's chosen outcome fails validation twice in a
  row (see below). This is not an HTTP error; the response is still `200`.

Nothing else. No general LM Studio proxy, no model-management endpoint, no
way for the page to submit a custom system prompt — the client can only
fill in the bounded content fields above; the bridge's own system prompt
(`bridge/protocol.mjs`) is fixed and never client-supplied.

## How a turn is validated (see `bridge/server.mjs`)

1. The model streams `OUTCOME: <id>` / `MEMORY: <fact>` / `NARRATION:` /
   `<text>`, in that fixed order.
2. The bridge buffers only the header (`OUTCOME:`/`MEMORY:`) internally —
   nothing is forwarded to the browser yet.
3. As soon as a complete `OUTCOME: <id>` line appears, the bridge checks
   `<id>` against the `legalOutcomes` list the client sent for _this_ turn.
   - **Valid**: once the `NARRATION:` marker is also seen, every further
     chunk streams straight to the browser as a `delta` event, in real
     time, exactly as LM Studio emits it.
   - **Invalid**: the upstream LM Studio request is aborted immediately
     (nothing has streamed to the browser yet), and the bridge retries
     **once** with a compact correction prompt (non-streamed, since it's a
     recovery path, not the primary experience). If that succeeds, its
     narration streams as a single `delta` and the outcome is marked
     `corrected: true`. If it fails again, the bridge sends
     `outcome{fallback:true}` and the client falls back to its own
     deterministic engine — a turn is never left in a broken state.

## Security boundaries (see `bridge/server.mjs`, `bridge/config.mjs`)

- **Binds to `127.0.0.1` by default** — unreachable from other devices on
  the network unless explicitly reconfigured.
- **Origin allowlist**: only `https://games.drewcassidy.dev` and local dev
  origins are accepted; every other `Origin` header gets a 403.
- **Fixed prompt template, bounded fields**: `characterPrompt`,
  `secretTruth`, `stateSummary`, each `legalOutcomes[].description`,
  `memoryFacts[]`, `recentExchanges[]`, and `playerAction` are all
  length-capped; the outcome `id`s themselves must be from a hardcoded
  known vocabulary (`KNOWN_OUTCOME_IDS`) before the bridge will even
  attempt a turn. Never a client-supplied system prompt or model id
  (`modelTier` selects between two hardcoded, LM-Studio-resolved ids —
  it's not a free-text model name).
- **Body size cap** (`MAX_BODY_BYTES`): oversized requests get a 413.
- **Rate limiting + single-flight**: one `busy` flag rejects a second
  `/api/dungeon/turn` call while one is in flight (429); a minimum
  interval rejects requests that come in too fast — this also enforces
  "exactly one active generation at a time."
- **Reasoning disabled explicitly**: `ornith-1.0-9b` (and possibly other
  installed models) emit a hidden chain-of-thought unless told not to —
  `REASONING_DISABLE_PARAMS` in every request; see `model-selection.md`
  for why this was necessary and how it was discovered.
- **No player-text logging by default**: the bridge logs a request id,
  model id, prompt size, timing, and outcome — never the player's actual
  text. Example log lines:
  ```
  [dungeon:452bfbbf] model=ornith-1.0-9b stream=true prompt_chars≈3945
  [dungeon:452bfbbf] first_token=510ms total=1702ms chunks=107 outcome=ENTITY_TRUST_INCREASES fallback=false
  ```
- **No file-system, shell, or browser access is ever given to the
  model** — it's a chat-completion call with a fixed prompt shape; it
  cannot call tools, run code, or take any action beyond returning text.

## Running it

```
npm run bridge            # node bridge/server.mjs
npm run bridge:test        # node --test bridge/*.test.mjs
node scripts/verify-live-model.mjs   # live check against a real running bridge + LM Studio
```

Or let `Start-AIDungeonDoor.ps1` / `Start AI Dungeon Door.bat` do it for you
(see the root README).

Configuration is via environment variables (all optional, see
`bridge/config.mjs`): `BRIDGE_HOST`, `BRIDGE_PORT`, `LM_STUDIO_URL`,
`BRIDGE_MODEL` (primary tier override), `BRIDGE_TINY_MODEL` (tiny tier
override).

## Browser behavior: what was actually verified vs. what's expected

What was tested directly in this repo, in a real browser, against a real
running `ornith-1.0-9b`: the built site served over plain HTTP (`npm run
dev`) calling the loopback bridge over HTTP — health check, multi-turn
streaming conversations (with real memory/continuity), origin rejection,
rate limiting, the Tiny Model fallback path, and the fully-offline
deterministic path all confirmed working. See the completion report for
transcripts.

What's expected but **not yet tested against a live deployment** (the site
hasn't been deployed to Cloudflare in this session): once
`https://games.drewcassidy.dev` is live, calling `http://127.0.0.1:8934` from
that HTTPS page should still work, because loopback addresses are treated as
a "potentially trustworthy origin" by Chromium and Firefox, exempted from
the mixed-content block that would otherwise apply to `https://` → plain
`http://` requests. This is documented browser behavior, not a guess, but it
should be re-confirmed once the real deployment exists — open the deployed
site with the bridge running locally and check the connection status badge
and browser console before relying on it.

If it were ever blocked, the fallback is already built in:
`Start-AIDungeonDoor.ps1 -Dev` serves the identical static build from
`localhost` instead. And even with the bridge fully unreachable for any
reason, the game itself never breaks — it always falls back to deterministic
narration, clearly labeled as such.
