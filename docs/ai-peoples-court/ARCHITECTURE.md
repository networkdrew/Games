# AI People's Court architecture

```text
seed + difficulty
  -> reusable dispute archetype/content pools
    -> immutable generated case truth, evidence, cast, and complications
      -> human judge's free-text turn
        -> code-selected speaker sequence
          -> one role-confined local-model generation per speaker
            -> hidden rolling memory + streamed visible dialogue
```

## Procedural case engine

`logic/generator.ts` is deterministic for a given seed, generator version, and
difficulty. It combines:

- dispute archetypes with their own coherent truth rules;
- names, roles, objects/services, stakes, and voice pools;
- winning-side variants;
- difficulty-driven conflicting evidence and witness uncertainty;
- exhibits, private knowledge, complexity labels, and an explanatory ruling.

The content-pack boundary is the `Archetype` interface. New dispute families
can be added without changing the court UI, bridge, transcript, memory, or
verdict engine. Seeds make generated cases reproducible for debugging, replay,
sharing, and future remix systems.

`logic/archive.ts` stores up to 30 versioned generated cases and outcomes in
local storage. The cache fails open: blocked or full storage never prevents a
hearing. Stored generation metadata leaves room for future systems to reuse a
case, archetype, cast member, evidence pattern, or difficulty profile.

## Role-safe model generation

The browser selects a bounded sequence of speaker ids from the judge's words
and procedural state. Named/role-addressed questions go to that person.
Unaddressed questions alternate between the parties. Selected turns add a
separate opposing-party interruption.

The bridge performs one generation per speaker. Its system prompt includes
only that active participant's identity, voice, motives, and private
knowledge, and forbids writing another role. This prevents an ensemble model
response from labeling a defendant's experience as witness testimony.

Each generation uses the Dungeon Door pattern:

```text
MEMORY: hidden rolling-summary proposal
FACT: hidden durable fact proposal
RESPONSE: visible role-confined dialogue
```

The bridge buffers `MEMORY` and `FACT`, tolerantly locates `RESPONSE:` on its
own line or inline, and streams only dialogue deltas. A malformed response
gets one compact correction retry. Speaker identity comes from code, never
from model output.

## Continuity layers

Every generation receives:

1. immutable case truth;
2. active character private knowledge and motives;
3. code-authored exhibits;
4. an attributed rolling summary;
5. up to eight attributed durable facts;
6. the latest twelve transcript messages, including earlier speakers in the
   same multi-speaker turn.

All fields have hard size caps. Memory entries are attributed to the active
speaker before returning to the browser, so first-person model summaries
cannot become ambiguous when the next role reads them.

## Authority and security

Code owns case truth, valid roles, speaker selection, interruption timing,
difficulty, evidence, procedure, and verdict. The local model owns only one
active character's dialogue and bounded memory proposals.

The court reuses the loopback-only OpenGames bridge, origin allowlist, exact
model resolution, explicit LM Studio load, cancellation, rate limiting, and
one-generation-at-a-time rule. It never accepts an arbitrary prompt, model id,
upstream URL, or public completion request.
