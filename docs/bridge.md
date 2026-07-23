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

- `GET /health` → `{ ok: boolean, modelId?: string }`. The **only** thing
  polled on demand — once on page load, and once when the player clicks
  "Reconnect". Never polled on an interval.
- `POST /narrate` → `{ doorPersonality, tension, outcomeSummary }` →
  `{ ok: boolean, text: string | null }`. `text: null` is not an error — it
  means "use deterministic fallback narration," and happens whenever no
  model is available or the model's output fails sanitization.

Nothing else. No general LM Studio proxy, no model-selection endpoint, no
way for the page to submit a custom system prompt.

## Security boundaries (see `bridge/server.mjs`, `bridge/config.mjs`)

- **Binds to `127.0.0.1` by default** (`bridge/config.mjs` → `HOST`) —
  unreachable from other devices on the network unless explicitly reconfigured.
- **Origin allowlist**: only `https://games.drewcassidy.dev` and a couple of
  local dev origins (`http://localhost:4321`, etc.) are accepted; every other
  `Origin` header gets a 403, and the CORS response headers are only ever
  sent back to an allowed origin.
- **Fixed prompt template**: the page can only supply `doorPersonality`,
  `tension`, and `outcomeSummary` — all size-capped (`MAX_FIELD_LENGTH`) —
  never a system prompt, never the model id.
- **Body size cap** (`MAX_BODY_BYTES`): oversized requests get a 413 before
  being parsed.
- **Rate limiting + single-flight**: a `busy` flag rejects a second `/narrate`
  call while one is in flight (429), and a minimum interval
  (`MIN_REQUEST_INTERVAL_MS`) rejects requests that come in too fast — this
  is also what enforces "exactly one active generation at a time."
- **Token/prompt limits**: requests LM Studio for at most `MAX_TOKENS` (60)
  tokens; the response is also truncated to `HARD_MAX_TOKENS` (70) after the
  fact, whichever the model actually returned.
- **No player-text logging by default**: the bridge never logs request
  bodies, only that a request happened.
- **No file-system, shell, or browser access is ever given to the model** —
  it's a single chat-completion call with a fixed prompt shape.

## Running it

```
npm run bridge            # node bridge/server.mjs
npm run bridge:test        # node --test bridge/*.test.mjs
```

Or let `Start-AIDungeonDoor.ps1` / `Start AI Dungeon Door.bat` do it for you
(see the root README).

Configuration is via environment variables (all optional, see
`bridge/config.mjs`): `BRIDGE_HOST`, `BRIDGE_PORT`, `LM_STUDIO_URL`,
`BRIDGE_MODEL`.

## Browser behavior: what was actually verified vs. what's expected

What was tested directly in this repo, in a real browser: the built site
served over plain HTTP (`npm run dev` / `astro preview`) calling the loopback
bridge over HTTP — health check, narration requests, origin rejection, and
the offline fallback path all confirmed working (see the completion report).

What's expected but **not yet tested against a live deployment** (the site
hasn't been deployed to Cloudflare in this session): once
`https://games.drewcassidy.dev` is live, calling `http://127.0.0.1:8934` from
that HTTPS page should still work, because loopback addresses are treated as
a "potentially trustworthy origin" by Chromium and Firefox and are exempted
from the mixed-content block that would otherwise apply to `https://` → plain
`http://` requests. This is documented browser behavior, not a guess, but it
should be re-confirmed once the real deployment exists — open the deployed
site with the bridge running locally and check the connection status badge
and the browser console for a blocked mixed-content request before relying on
it.

If it ever were blocked (a future stricter browser policy, an unusual
enterprise Chrome policy, etc.), the fallback is already built in: the exact
same static build works when served from `localhost` via `npm run dev` —
`Start-AIDungeonDoor.ps1 -Dev` opens that instead of the hosted URL. No
separate codepath, no separate build. And even with the bridge fully
unreachable for any reason, the game itself never breaks — it always falls
back to deterministic narration.
