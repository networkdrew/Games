# Model selection

## Result

**Primary (default) model: `ornith-1.0-9b`** — the exact identifier LM Studio
reports via `GET /v1/models` (queried live, never assumed). Confirmed on this
machine alongside the 35B variant (`deepreinforce-ai_ornith-1.0-35b@...`,
not used) and `qwen/qwen3.5-9b` (configured as the next fallback).

**Priority order** (`bridge/config.mjs`'s `PRIMARY_MODEL_PRIORITY`), first
one LM Studio actually reports wins:

1. `ornith-1.0-9b`
2. `qwen/qwen3.5-9b`
3. `granite-4.1-8b`, `google/gemma-4-e4b` — untested placeholders for
   "another capable installed 7B-10B instruct model"; reorder or replace
   once you've verified one works well here, and update this document with
   real evidence when you do.
4. Deterministic engine (no model) — the final, always-available fallback.

**Tiny/low-power tier** (`TINY_MODEL_PRIORITY`): `qwen2.5-0.5b-instruct`,
then `smollm2-360m-instruct`. Never selected automatically for normal play —
only reachable via the explicit "Tiny Model (experimental)" checkbox in the
game UI, which is unchecked by default.

## Why ornith-1.0-9b

This is now a genuinely LLM-driven game: the model interprets free-text
actions, roleplays a character, and picks from a set of legally-possible
outcomes, then narrates the result. That requires real instruction-following
and creative writing ability a 0.5B model does not have (see "the original
0.5B-only version" below) — a capable ~9B model, already installed and
previously benchmarked by the project owner at 80+ tokens/sec on an RTX
3080, is the smallest model on this machine that was actually confirmed to
do this well.

## A critical finding: reasoning mode must be explicitly disabled

`ornith-1.0-9b` is a **reasoning model** — by default it emits a hidden
chain-of-thought via a separate `reasoning_content` field before (or
instead of) real `content`. Discovered live: a simple "say hello" prompt
returned `content: ""` with 282 of 293 completion tokens spent on invisible
reasoning. Left unfixed, this would silently exhaust `MAX_TOKENS` on
reasoning and never produce narration.

**Fix** (`bridge/config.mjs`'s `REASONING_DISABLE_PARAMS`, sent on every
request): both of these are required together — dropping either one and
reasoning came back in live testing:

```js
{
  chat_template_kwargs: { enable_thinking: false },
  reasoning_effort: "none",
}
```

With both set, `reasoning_tokens` dropped to 0 and normal `content`
streamed immediately. If you point the bridge at a different model, retest
this — some models don't need it (harmless extra params), some need a
different mechanism entirely.

## What was actually tested live (not mocked)

Every claim below came from real requests through `bridge/server.mjs` to a
running LM Studio instance serving `ornith-1.0-9b` — see
`scripts/verify-live-model.mjs` and the completion report for full
transcripts. Highlights:

- **Creative, unscripted actions**: complimenting a mimic door, asking a
  guard "who's hurt in there" — correctly interpreted and mapped to a
  sensible legal outcome every time, with vivid, in-character prose (e.g. a
  mimic's dialogue actually _sounding_ like a mimic, "you have an eye for
  craftsmanship... let me show you how I was made").
- **Genuine continuity across turns**: told a guard "I'm the royal
  locksmith," then next turn said "actually I'm a merchant" — the model
  caught its own earlier claim and had the guard call out the contradiction
  ("You claimed to be royal business earlier. Now you're lost?"), choosing
  `ENTITY_ANGER_INCREASES` appropriately. This is real use of the
  `memoryFacts`/`recentExchanges` context, not keyword matching.
- **Impossible actions handled gracefully**: "I sprout wings and fly over
  the door" correctly resolved to `NO_EFFECT` with dismissive, in-character
  narration, rather than the model inventing a new outcome.
- **A full multi-turn win**: the Password Guard scenario was won only after
  7 turns of real negotiation — the model refused the correct password twice
  when the player was cocky/demanding, and only granted `OPEN_DOOR` once the
  player calmly explained _how_ they legitimately learned it. This is more
  interesting (and harder) than the deterministic engine's minimum 2-action
  solution, which is exactly the point.
- **Real streaming**: 55-160 distinct delta chunks per turn observed, first
  token in 170-930ms, total turn latency 900ms-2.7s.

## Two real bugs this live testing caught (not found by mocked tests)

1. **`MAX_EXCHANGE_FIELD_LENGTH` too small** (400 chars): a normal ~100-word
   Ornith response (600+ chars) sent back as `recentExchanges` context on
   the next turn was silently rejected by request validation, causing an
   unnecessary deterministic-fallback turn with no visible error. Fixed by
   raising the cap to 900 (headroom above narration's own ~700-char
   sanitizer cap) — see `bridge/config.mjs`.
2. **A scenario's outcome description was 221 characters** against a
   220-character cap — one over, same silent-rejection symptom. Fixed by
   raising `MAX_OUTCOME_DESCRIPTION_LENGTH` to 320 with real headroom, and
   added `scenarios.test.ts`'s "keeps every legal outcome description within
   the bridge's request-validation cap" test so this class of bug can't
   silently reappear.

Both are exactly the kind of thing mocked bridge tests cannot catch — they
only surfaced by actually running real player actions through the real
model and reading the resulting (initially wrong) behavior.

## The original 0.5B-only version (kept as evidence, not the current design)

Earlier in this project, `qwen2.5-0.5b-instruct` was the only model tested,
used purely to cosmetically rewrite a fully deterministic outcome. That
version worked (fast, well-formatted) but the model made zero meaningful
decisions — it echoed a few-shot example almost verbatim regardless of the
actual outcome, and never interpreted the player's action. That is no
longer how this game works; it's preserved here only as the reason a 0.5B
model is unsuitable as the _default_, and remains available as the opt-in,
clearly-labeled "Tiny Model (experimental)" tier for anyone who wants to see
the difference or run with near-zero resource usage.

## Changing the model safely

1. Confirm LM Studio actually reports the model: `lms ls` or
   `GET http://127.0.0.1:1234/v1/models`.
2. Set `BRIDGE_MODEL=<exact id>` (primary tier) or `BRIDGE_TINY_MODEL=<exact id>`
   before starting the bridge, or edit the priority arrays in
   `bridge/config.mjs` for a permanent change — never a guessed identifier.
3. Retest reasoning-mode behavior (see above) — a different model may need
   different (or no) disable parameters.
4. Play a handful of real turns across a few scenarios and update this
   document with what you actually observed, the same way this document
   was written.
