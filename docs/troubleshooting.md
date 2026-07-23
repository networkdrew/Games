# Troubleshooting

## "Local AI unavailable" even though LM Studio is running

- Confirm LM Studio's server is actually started (not just the app open):
  `curl http://127.0.0.1:1234/v1/models` should return JSON, not connection
  refused. In LM Studio's UI this is the "Local Server" tab; via CLI,
  `lms server start`.
- Confirm the bridge is running: `curl http://127.0.0.1:8934/health`. If
  connection refused, start it with `npm run bridge` or the `.bat` launcher.
- Click the reconnect icon next to the status text — the game only checks
  once on load, never polls, so a model loaded after the page opened won't
  be noticed until you ask it to check again.

## The bridge won't start / port already in use

Another process is already listening on 8934 (maybe an earlier bridge you
forgot was running). Find and stop it, or set `BRIDGE_PORT` to a different
port (and update `DEFAULT_BRIDGE_URL` in `src/lib/bridge/client.ts` or pass a
different URL when constructing `BridgeClient` if you do this permanently).

## A turn shows the "fallback" badge even though Ornith is connected

This means either no model was loaded for the requested tier, or the
model's chosen outcome failed validation twice in a row (see
`docs/bridge.md`'s "how a turn is validated"). Expand the collapsed
"Diagnostics" panel: if "Last request id" is blank, the request never
reached the model at all (check the bridge's own console log for a
validation/rate-limit rejection); if a request id is present with
`corrected: yes` immediately followed by fallback, the model genuinely
failed twice — check the bridge log for the exact outcome id it returned.
The game state itself (health, tension, trust, turns, inventory, win/loss)
is never affected either way — only which narration/interpretation path
was used for that one turn.

## The "Tiny Model (experimental)" checkbox mostly shows "fallback"

Expected — `qwen2.5-0.5b-instruct` was found unable to reliably follow the
`OUTCOME:`/`MEMORY:`/`NARRATION:` protocol during testing (see
`model-selection.md`'s "the original 0.5B-only version"). It's kept as an
explicitly-labeled, opt-in comparison, not a normal way to play.

## CORS error in the browser console calling the bridge

The page's origin isn't in `bridge/config.mjs`'s `ALLOWED_ORIGINS`. This is
intentional for any origin other than `https://games.drewcassidy.dev` and the
local dev ports already listed — add your own dev origin there if you're
serving the site from somewhere else during development. Never widen this to
`*`.

## Known browser limitations

- Loopback HTTP calls from an HTTPS page rely on browsers treating
  `127.0.0.1` as a "potentially trustworthy origin" (a real, standardized
  exception to mixed-content blocking, not a hack) — see `bridge.md` for
  what was actually verified vs. still needs a live-deployment check.
- Corporate/managed Chrome installs occasionally lock down local network
  access entirely via policy (`InsecurePrivateNetworkRequestsAllowed`, Private
  Network Access rules); if the bridge is unreachable only on a managed
  machine, this is why. The game still works — it just uses fallback
  narration.

## Existing Tools/Apps sites broke after working on this repo

They shouldn't — this repo is entirely separate (own directory, own
`package.json`, own Cloudflare project). If something in `../Tools` or
`../Apps` looks different, it wasn't touched by anything in this project;
check `git status` in that repo directly.
