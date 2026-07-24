# AI People's Court architecture

```text
human judge
  -> React chat island
    -> fixed POST /api/court/turn contract
      -> loopback OpenGames bridge
        -> local LM Studio model as bounded ensemble cast
```

## Authority boundaries

Code owns:

- fictional case truth, exhibits, cast, and private knowledge;
- valid speaker identities and phases;
- transcript and memory limits;
- interruption scheduling;
- the human judge's words and verdict.

The local model owns:

- in-character dialogue;
- which permitted character responds;
- natural reactions, objections, and allowed interruptions;
- a proposed rolling summary and durable continuity fact.

The bridge never accepts an arbitrary system prompt, model id, upstream URL,
or speaker identity. It validates a bounded court request, builds the prompts
server-side, parses a fixed response protocol, and emits NDJSON events. Model
memory metadata is sent as a hidden `memory` event; player-facing lines are
separate `message` events.

## Browser state

`CourtSession` stores the current case id, visible transcript, rolling summary,
durable facts, turn number, and final verdict. A new case creates a fresh
session. Recent transcript is deliberately clipped before each request; the
rolling summary preserves older continuity without unbounded context growth.

## Bridge integration

The court reuses the existing health check, exact model resolution, explicit
LM Studio load, origin allowlist, loopback binding, rate limit, cancellation,
and one-generation-at-a-time rule. Court routes are:

- `POST /api/court/ensure`
- `POST /api/court/turn`

Dungeon endpoints and behavior remain intact.
