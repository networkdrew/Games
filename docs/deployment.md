# Deployment (Cloudflare Workers)

Same pattern as OpenToolbox and OpenApps: Cloudflare's Git-connected
**Workers** integration (the modern unified successor to classic Cloudflare
Pages), driven entirely by `wrangler.jsonc` in the repo root — no separate
dashboard build configuration to keep in sync.

The site is fully static (`output: "static"` in `astro.config.mjs`, every
page prerendered, no SSR). The `@astrojs/cloudflare` adapter and
`wrangler.jsonc` exist only so Cloudflare's Workers platform knows how to
serve that static output. **The local bridge (`bridge/`) is never part of
this build or deployment** — it's a separate Node process that only ever
runs on a player's own PC.

## Production target

- Production URL: **https://games.drewcassidy.dev**
- A separate Cloudflare project from `tools.drewcassidy.dev`,
  `apps.drewcassidy.dev`, and the root `drewcassidy.dev` site. It must stay
  its own project, attached only to the `games` subdomain — it does not
  touch the root domain's DNS record, project, or deployment, nor Tools' or
  Apps' projects.

## How the build maps to `wrangler.jsonc`

`npm run build` (`astro build`) produces:

- `dist/client/` — every static asset: HTML, CSS, JS, `robots.txt`, the
  sitemap, favicon. **This is what actually gets served.**
- `dist/server/` — a thin Cloudflare Worker entry Astro generates for the
  adapter's plumbing (routing/headers), not application logic.

`wrangler.jsonc` points Cloudflare at that split:

```jsonc
"assets": {
  "directory": "./dist/client", // must be dist/client, not dist
  "binding": "ASSETS",
},
```

**If this ever points at plain `./dist` instead of `./dist/client`, the
deploy will build "successfully" but serve nothing usable** — this bit
OpenToolbox for real once (Cloudflare's own auto-generated config PR guessed
`./dist`). If the site ever goes blank/404 after a config change, check this
value first.

Verified in this session with `npx astro build && npx wrangler deploy
--dry-run`, which confirmed `dist/client` is read correctly (30 files) and
the config resolves to the adapter-generated `dist/client/wrangler.json`.

## Connecting the project (first time)

1. Cloudflare dashboard -> Workers & Pages -> Create -> **Workers** ->
   connect this GitHub repository (not the classic "Pages" creation flow).
2. Cloudflare reads `wrangler.jsonc` automatically; no manual build
   command/output directory fields need to be set.
3. Set **Production branch** to this repository's default branch.
4. Deploy once to get a working `*.workers.dev` URL and confirm it actually
   serves the homepage (not just that the build step succeeded).
5. Add the custom domain: project -> **Domains & Routes** -> add
   `games.drewcassidy.dev`. If `drewcassidy.dev` is already on this
   Cloudflare account, Cloudflare can create the DNS record automatically (a
   record for the `games` subdomain only) — this does not modify the
   existing root domain, Tools, or Apps records/projects.
6. Wait for the domain to show "Active" before relying on it.

## Local development and previews

- `npm run dev` runs the plain Astro dev server.
- `npm run preview` builds and runs `wrangler dev` against the built
  output — closer to how the real Worker will behave.
- Preview deployments still declare canonical/Open Graph URLs pointing at
  `https://games.drewcassidy.dev` rather than the preview host — intentional,
  so a preview build is never indexed as a separate page.

## Verifying a live deploy

- The homepage loads (not blank, not a Cloudflare error page). If not,
  check `assets.directory` in `wrangler.jsonc` first.
- `/robots.txt` returns the expected content with the production
  `Sitemap:` URL.
- `/sitemap-index.xml` lists the production URLs.
- `/ai-dungeon-door/` loads directly (not just via client-side navigation
  from the homepage) — confirms the top-level route is actually prerendered,
  not just reachable through JS routing.
- With the local bridge running, the game's header shows "Local AI
  connected" — see `bridge.md` for what to check if it doesn't.

## What is NOT deployed

`bridge/` and `Start-AIDungeonDoor.ps1` never leave your machine — they are
not referenced by `astro.config.mjs`, not part of `dist/`, and contain no
secrets to leak in the first place (they only ever talk to `127.0.0.1`).
