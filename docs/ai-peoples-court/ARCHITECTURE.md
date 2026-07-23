# AI People’s Court architecture

## Scope

This document records the repository architecture inspected during Phase 1
and the integration boundary for AI People’s Court. Phase 1 contains only a
registry entry, a direct route, and an honest under-construction React screen.
It does not contain a court case schema, generation pipeline, prompts,
courtroom engine, LM Studio integration, or gameplay.

## Existing portal architecture

The site is one Astro application, not a collection of separately deployed
apps:

- `astro.config.mjs` configures static Astro output, the React integration,
  sitemap generation, the Cloudflare adapter, the Tailwind v4 Vite plugin, and
  the `@` alias for `src/`.
- `src/styles/global.css` loads Tailwind v4 with `@import "tailwindcss"`,
  exposes the portal color tokens through `@theme inline`, and contains
  game-specific styles under explicit scopes.
- `src/layouts/BaseLayout.astro` owns metadata, theme initialization, shared
  CSS, the normal site header/footer, and the optional viewport-filling
  `shell` mode.
- `src/layouts/GameLayout.astro` receives a validated `GameMeta`, derives the
  canonical top-level route, and enables `BaseLayout`'s chromeless `shell`
  mode.
- `src/components/react/GameAppShell.tsx` supplies shared in-game chrome: the
  homepage link, title, optional action and connection slots, optional
  new-game action, loading replacement, safe-area padding, and a
  viewport-owned content area. A game's colors and visual identity are passed
  through `className` and its children.
- `src/pages/index.astro` renders the Games homepage from registry data. It
  passes card data to the `src/islands/GameGrid.tsx` React island, which
  searches and filters it. `src/components/react/GameCard.tsx` renders each
  card. No game card should be hand-added to the homepage.
- `src/lib/games/schema.ts` uses Zod to define and runtime-validate game and
  category metadata. `src/lib/games/categories.ts` validates the category
  list. `src/lib/games/registry.ts` maps every raw entry through
  `gameMetaSchema.parse`.
- Vitest uses jsdom through `vitest.config.ts` and `tests/setup.ts`. ESLint,
  Prettier, Astro Check, and the Astro/Cloudflare production build are package
  scripts in `package.json`.
- `wrangler.jsonc` points Cloudflare Workers Static Assets at
  `./dist/client`; `astro.config.mjs` keeps output static while the Cloudflare
  adapter emits the thin deployment entry. The local bridge is not bundled
  or deployed.

## Established method for adding a game

1. Add or reuse a broad category in `src/lib/games/categories.ts`.
2. Add validated discovery metadata to the authoritative registry at
   `src/lib/games/registry.ts`.
3. Add a React island under `src/islands/<game-id>/`.
4. Add `src/pages/<slug>/index.astro`, look up the registry entry, wrap the
   island in `GameLayout`, and mount it with `client:only="react"`.
5. Keep pure game rules under `src/lib/games-logic/<game-id>/` when gameplay
   is implemented.
6. Extend the existing local bridge only when a bounded, game-specific
   contract is required. Do not start another bridge or expose a generic
   completion endpoint.
7. Add registry, logic, component, bridge-contract, and route verification in
   proportion to the new behavior.

The canonical internal guide is `docs/adding-a-game.md`.

## AI Dungeon Door reference implementation

### Route, shell, and React entry

- Direct route: `/ai-dungeon-door/`
- Astro page: `src/pages/ai-dungeon-door/index.astro`
- React entry component:
  `src/islands/ai-dungeon-door/AIDungeonDoorGame.tsx`
- Chromeless Astro shell: `src/layouts/GameLayout.astro` ->
  `src/layouts/BaseLayout.astro` with `shell`
- Shared React game shell: `src/components/react/GameAppShell.tsx`

The page retrieves `ai-dungeon-door` from the registry, emits `Game`
structured data, and mounts `AIDungeonDoorGame` with `client:only="react"`.

### State architecture and offline behavior

`AIDungeonDoorGame.tsx` owns the run in React state. Pure, framework-free
rules live in:

- `src/lib/games-logic/ai-dungeon-door/types.ts`
- `src/lib/games-logic/ai-dungeon-door/scenarios.ts`
- `src/lib/games-logic/ai-dungeon-door/intent.ts`
- `src/lib/games-logic/ai-dungeon-door/engine.ts`
- `src/lib/games-logic/ai-dungeon-door/narration.ts`

The deterministic engine owns scenario truth, state transitions, bounds,
inventory, clues, endings, and final acceptance of model proposals. The model
can propose a bounded control block and narration; the browser engine remains
authoritative.

Connection lifecycle state is isolated in
`src/islands/ai-dungeon-door/useBridgeConnection.ts`: `connecting`,
`loading-model`, `warming`, `ready`, `reconnecting`, `offline`, and `failed`.
It uses bounded exponential retries and a manual retry path. If the bridge or
configured model is unavailable, the game supplies deterministic narration
and remains playable.

There is currently no AI Dungeon Door gameplay save-state implementation.
The run lives in React memory and resets on reload; the repository's only
`localStorage` use is the portal theme preference. Phase 2 must make an
explicit, versioned persistence decision for court cases instead of assuming
an existing game-save abstraction exists.

## Existing local LM Studio infrastructure

### Entry points and shared modules

- Bridge process entry point: `bridge/server.mjs`
- Browser client: `src/lib/bridge/client.ts`
- Browser connection state hook:
  `src/islands/ai-dungeon-door/useBridgeConnection.ts`
- Fixed bridge protocol and validation: `bridge/protocol.mjs`
- Local transport and LM Studio model lifecycle: `bridge/lmstudio.mjs`
- Model aliases and tuned per-model settings: `bridge/models.mjs`
- Loopback, origin, limits, and timeout configuration: `bridge/config.mjs`

The bridge currently exposes only `GET /health`,
`POST /api/dungeon/ensure`, `POST /api/dungeon/release`, and
`POST /api/dungeon/turn`. They are AI Dungeon Door-specific contracts. AI
People’s Court must eventually extend this same process with a similarly
bounded court contract; Phase 1 adds no bridge endpoint.

### Model identifier discovery and lifecycle

`bridge/lmstudio.mjs` queries LM Studio's local
`GET http://127.0.0.1:1234/v1/models` endpoint in `listModelIds()`.
`resolveAlias()` compares the configured exact identifier from
`bridge/models.mjs` against those reported identifiers and returns `null`
rather than guessing a substitute. Loaded state comes from
`GET /api/v0/models`. The bridge uses the `lms` CLI for explicit,
single-flighted loading with tuned context/GPU/TTL settings and for unloading.
`BRIDGE_MODEL` can override the primary exact identifier.

### Real streaming

`bridge/lmstudio.mjs` requests LM Studio's OpenAI-compatible
`/v1/chat/completions` endpoint with `stream: true`, incrementally parses its
SSE `data:` messages from `Response.body`, and invokes `onDelta` for each real
content chunk. `bridge/server.mjs` validates the model's control header before
forwarding narration as newline-delimited JSON `delta` events.

`BridgeClient.streamTurn()` in `src/lib/bridge/client.ts` reads that NDJSON
from the browser fetch `ReadableStream`, handles partial lines, and calls the
React island's `onEvent` callback immediately for each event. It does not
buffer a completed response and simulate typing.

### Cancellation

The browser client permits one active opening/turn request. A new request,
new game, explicit cancel, or component unmount calls
`BridgeClient.cancelPending()`, which aborts its `AbortController`. A
30-second client timer also aborts stalled generation.

`bridge/server.mjs` attaches an `AbortController` to the incoming request's
`close` event and forwards the signal into `streamChatCompletion()`.
`bridge/lmstudio.mjs` combines that external cancellation with its own local
timeout, aborting the LM Studio fetch.

### Connection and security boundary

The hosted static page calls `http://127.0.0.1:8934`; the bridge calls
`http://127.0.0.1:1234`. The intended path is:

`hosted static route -> loopback bridge -> loopback LM Studio`

Security properties in the current implementation:

- The bridge binds to `127.0.0.1` by default.
- Browser origins are allowlisted in `bridge/config.mjs`; unapproved origins
  are rejected and CORS is never `*`.
- Request bodies and individual fields are capped.
- Routes are fixed and game-specific. There is no arbitrary prompt,
  arbitrary model, arbitrary upstream URL, or general completion proxy.
- Model identifiers and inference settings are server-owned configuration,
  not accepted from browser requests.
- The bridge and launcher are local files and are never part of the
  Cloudflare static deployment.

The hosted HTTPS-to-loopback-HTTP path depends on browser loopback trust,
Private Network Access behavior, and local/corporate policy. The repository
documentation says it was tested in local development, but a production-host
browser matrix remains a deployment risk. The offline path must therefore
remain truthful and usable; connected status can be shown only after a real
successful local request.

## Running, building, deploying, and launching

- Install: `npm install`
- Astro development server: `npm run dev`
- Cloudflare-like local preview: `npm run preview`
- Unit/component tests: `npm test`
- Bridge tests: `npm run bridge:test`
- Type/Astro checks: `npm run check` or `npm run typecheck`
- Lint: `npm run lint`
- Formatting check: `npm run format:check`
- Production static/Cloudflare build: `npm run build`
- Full configured verification: `npm run verify`
- Deploy: `npm run deploy`
- Local bridge: `npm run bridge`
- Optional real local-model integration check:
  `node scripts/verify-live-model.mjs`
- Windows npm launcher: `npm run play`
- Windows files: `Start AI Dungeon Door.bat` and
  `Start-AIDungeonDoor.ps1`

The PowerShell launcher checks/starts the LM Studio server when possible,
starts `bridge/server.mjs`, optionally starts Astro with `-Dev`, reads model
identity from bridge health, and opens `/ai-dungeon-door/`. It does not
hardcode or load a model itself. There is no AI People’s Court launcher in
Phase 1.

## AI People’s Court Phase 1 files

Added:

- `src/pages/ai-peoples-court/index.astro`
- `src/islands/ai-peoples-court/AIPeoplesCourtGame.tsx`
- `src/islands/ai-peoples-court/AIPeoplesCourtGame.test.tsx`
- `docs/ai-peoples-court/ARCHITECTURE.md`
- `docs/ai-peoples-court/STATUS.md`

Updated:

- `src/lib/games/registry.ts`
- `src/lib/games/categories.ts`
- `src/lib/games/registry.test.ts`
- `src/pages/index.astro`
- `src/styles/global.css`

The route is `/ai-peoples-court/`. It uses `GameLayout` and `GameAppShell`,
has mobile-safe overflow and safe-area behavior, links back to `/`, and says
plainly that gameplay is not implemented.

## Reuse boundaries

Reuse:

- Astro, React islands, Tailwind v4, Zod, Vitest, and Cloudflare static output
- `GameLayout`, `BaseLayout` shell mode, and `GameAppShell`
- The validated game registry and registry-driven homepage
- `src/lib/bridge/client.ts` concepts that can be safely generalized
- The one local `bridge/server.mjs` process, LM Studio adapter, exact model
  discovery, streaming parser, cancellation chain, origin allowlist,
  loopback binding, request limits, and model lifecycle

Do not change casually:

- AI Dungeon Door's scenario/engine semantics, prompts, protocol, response
  parsing, connection UI, offline fallback, or launcher
- `wrangler.jsonc`'s `dist/client` assets directory
- `BaseLayout` shell sizing and safe-area behavior
- Registry/Zod validation or homepage derivation
- The bridge into a general-purpose prompt/model proxy

## Permanent project invariants

- Preserve Astro, React islands, Tailwind v4, Zod, Vitest, and static
  Cloudflare deployment.
- Preserve the registry-driven Games homepage.
- Preserve the full-screen game-shell behavior.
- Do not break AI Dungeon Door.
- Reuse and generalize its LM Studio infrastructure where appropriate.
- Do not create a competing local bridge.
- Never expose LM Studio directly to the public internet.
- Never create a general-purpose public LLM proxy.
- All court cases, people, and businesses must be fictional.
- The human player will always control the verdict.
- Code—not the model—will own case truth, evidence state, procedure, verdict,
  and scoring.
- No cloud AI.
- No paid APIs.
- No Docker requirement.
- No fake streaming.
- No fake connected status.
- No television courtroom branding.
- No legal-advice claims.

## Risks discovered

1. The inspected worktree already contains a large, uncommitted AI Dungeon
   Door/bridge refactor. Phase 1 must not normalize or overwrite it.
2. Browser client tests and some scenario/component tests are stale relative
   to the current client/control-proposal implementation in the recorded
   baseline. Those unrelated test/support files changed elsewhere in the
   worktree before final verification and then passed; Phase 1 did not edit
   them.
3. ESLint references `react-hooks/exhaustive-deps` without registering the
   React Hooks plugin.
4. Existing docs describe an older outcome-only protocol/model selection in
   places, while current code uses a bounded `CONTROL` proposal and
   `qwen/qwen3.5-9b` default alias. Code and this inspection record take
   precedence until those unrelated docs are reconciled.
5. AI Dungeon Door has no persistent gameplay saves to reuse.
6. The hosted HTTPS-to-loopback bridge path still needs real production
   browser and Private Network Access verification.
7. A shared browser client currently hardcodes Dungeon endpoint paths and
   wire types. Phase 2 should extract transport/lifecycle primitives without
   destabilizing Dungeon behavior.
8. Court gameplay has materially stricter truth, evidence, procedure, and
   content-safety requirements than narration flavor. Those must be
   code-owned and tested before model integration.
