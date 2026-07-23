# Model selection

## Result: `qwen2.5-0.5b-instruct`

Detected by querying LM Studio's own `GET /v1/models` at
`http://127.0.0.1:1234/v1/models` — never assumed. On this machine it
returned (among others) `qwen2.5-0.5b-instruct` and `smollm2-360m-instruct`
as the two smallest installed instruct models; `bridge/config.mjs`'s
`PREFERRED_MODEL_IDS` tries them in that order and uses whichever LM Studio
actually reports, falling back to the first available model if neither is
present.

## Why 0.5B and not something bigger

The task instructions are explicit: prefer the smallest model that's good
enough, and don't reach for a 7-9B model just because its prose is nicer —
resource impact matters more than writing quality here, and the model's job
is narrow (rewrite an already-decided outcome into one sentence), not
open-ended writing.

## What was actually tested

Six representative outcomes (one per scenario family: a quiet clue, a
punished mistake, a win via password, a paid-and-betrayed trade, a
time-pressure win, a mimic's warning sign) were sent through the real bridge
to `qwen2.5-0.5b-instruct`, twice — once with a naive few-shot prompt, once
with the current prompt (`buildSystemPrompt()` in `narration.ts`).

**First attempt (with a worked example in the system prompt):** the model
would frequently echo the example's content almost verbatim regardless of
the real outcome — e.g. asked to narrate a guard accepting a password, it
still produced breathing/sleeping imagery lifted straight from the example.
Length and formatting were fine; content fidelity was not.

**After removing the example** (current prompt: `OUTCOME:` /
`DOOR PERSONALITY:` / `TENSION:` labels, no worked example) drift measurably
decreased but did not disappear — the model sometimes still substitutes
generic dungeon imagery instead of the specific outcome given. One concrete
example captured during a real playthrough (see the completion report for
the full transcript): asked to narrate "the player unlocks the door with the
key, having deduced it was never locked, and wins," it responded "You press
your ear to the cold wood. Slow, heavy breaths answer..." — atmospheric,
correctly short, but unrelated to the actual event.

**Latency**: ~150-300ms per call once the model is warm; ~2.7s on the very
first call after the bridge starts (model load/warmup inside LM Studio).
Well within the "one inference request per action" budget.

**Format compliance**: consistently short (1-2 sentences), no markdown, no
`<think>` blocks, no refusals, no broken-character "as an AI" responses in
any of the ~10 test calls made.

**`smollm2-360m-instruct`** (smaller still) was also spot-checked and was
worse on every axis that matters here: it broke character ("I'm glad you
made it through that tricky part!"), ran well past the sentence limit on one
response, and drifted further from the given outcome than the 0.5B model.
It was not considered further.

## Why 0.5B ships as the default despite the drift

This game's architecture is specifically designed so that per-turn flavor
text quality is cosmetic, not load-bearing:

- All state that actually matters — health, tension, turns, inventory,
  clues, win/loss — is decided by `engine.ts`/`scenarios.ts` before the
  model is ever called, and is always displayed accurately in the status
  bar regardless of what the model says.
- Every outcome carries a prewritten `fallbackNarration`; `sanitizeNarration`
  rejects malformed/refusal/reasoning-leak output, but does **not** and
  cannot verify factual fidelity to the outcome (that would require a much
  larger judge model, defeating the point). Occasional content drift from
  qwen2.5-0.5b-instruct is a known, accepted cosmetic limitation, not a
  gameplay bug — confirmed directly in this session: a real playthrough won
  correctly with a completely deterministic ending banner even when that
  turn's AI narration was off-topic (see the completion report).
- The deterministic ending text (win/loss banner) is never sent through the
  model at all — it's always the authored, accurate text.

If richer, more topical narration matters more to you than minimal resource
usage, `BRIDGE_MODEL=<id>` (or editing `PREFERRED_MODEL_IDS` in
`bridge/config.mjs`) lets you point the bridge at a larger already-installed
model (e.g. `gemma-4-e4b` or `qwen/qwen3.5-9b` were seen in this machine's
model list) — but that trade-off should be a deliberate choice, not the
default, per the project's stated priorities. This document should be
updated with fresh test evidence if the default is ever changed.

## Changing the model safely

1. Confirm LM Studio actually reports the model: `lms ls` or
   `GET http://127.0.0.1:1234/v1/models`.
2. Set `BRIDGE_MODEL=<exact id from that list>` before starting the bridge
   (or edit `PREFERRED_MODEL_IDS` in `bridge/config.mjs` for a permanent
   change), never a guessed identifier.
3. Re-run the same kind of spot-check as above (a handful of real outcomes
   through `/narrate`) before trusting it — length, character, and
   topicality can all vary a lot between models.
