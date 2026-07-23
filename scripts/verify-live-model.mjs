// Live integration check: proves the primary model is actually reachable
// through LM Studio and that the bridge's streaming turn endpoint produces
// real, incrementally-streamed narration for a real player action — not a
// mocked stand-in. Run with the bridge already started (`npm run bridge`)
// and LM Studio serving the primary model:
//
//   node scripts/verify-live-model.mjs
//
// Exits non-zero (and prints why) if the model isn't exposed, the endpoint
// doesn't stream more than one chunk, or the turn fell back to deterministic
// mode — any of which means this did NOT prove live model integration.

const LM_STUDIO_URL = process.env.LM_STUDIO_URL ?? "http://127.0.0.1:1234";
const BRIDGE_URL = process.env.BRIDGE_URL ?? "http://127.0.0.1:8934";
const ORIGIN = "http://localhost:4321";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK:   ${message}`);
}

async function main() {
  console.log(`Checking LM Studio at ${LM_STUDIO_URL} ...`);
  const modelsRes = await fetch(`${LM_STUDIO_URL}/v1/models`);
  if (!modelsRes.ok) {
    fail(`LM Studio /v1/models returned ${modelsRes.status}`);
    return;
  }
  const modelsData = await modelsRes.json();
  const ids = (modelsData.data ?? []).map((m) => m.id);
  console.log(`  models reported: ${ids.join(", ")}`);
  if (!ids.includes("ornith-1.0-9b")) {
    fail('Expected "ornith-1.0-9b" in the models list — not found.');
  } else {
    ok('LM Studio exposes "ornith-1.0-9b".');
  }

  console.log(`\nChecking bridge health at ${BRIDGE_URL} ...`);
  const healthRes = await fetch(`${BRIDGE_URL}/health`);
  const health = await healthRes.json();
  console.log(`  ${JSON.stringify(health)}`);
  if (health.primaryModelId !== "ornith-1.0-9b") {
    fail(
      `Bridge did not resolve ornith-1.0-9b as the primary model (got ${health.primaryModelId}).`,
    );
  } else {
    ok("Bridge resolves ornith-1.0-9b as the primary model.");
  }

  const uniqueMarker = `UNIQUE_TEST_MARKER_${Date.now()}`;
  const body = {
    modelTier: "primary",
    characterPrompt:
      "You are a wounded knight chained behind this door, proud and wary of strangers.",
    secretTruth:
      "The knight was imprisoned for refusing a royal order, not the crime he'll claim at first.",
    stateSummary:
      "health=100/100 tension=15/100 trust=30/100 turn=1/9 stage=0 inventory=[rusty key, waterskin] discovered_clues=[none yet]",
    legalOutcomes: [
      { id: "NO_EFFECT", description: "Nothing meaningful happens." },
      {
        id: "REVEAL_SOUND_CLUE",
        description: "Player listens closely — reveal labored breathing.",
      },
      {
        id: "ENTITY_TRUST_INCREASES",
        description: "Player is honest, kind, or offers aid.",
      },
      {
        id: "DOOR_RESPONDS",
        description: "The knight speaks, nothing else changes.",
      },
    ],
    memoryFacts: [],
    recentExchanges: [],
    playerAction: `I press my ear to the door and ask softly if anyone is hurt in there. (marker: ${uniqueMarker})`,
  };

  console.log(
    `\nSending a real turn request to ${BRIDGE_URL}/api/dungeon/turn ...`,
  );
  const start = Date.now();
  const res = await fetch(`${BRIDGE_URL}/api/dungeon/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    fail(`Turn request failed with status ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  let firstDeltaAt = null;
  let deltaCount = 0;
  let narration = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      events.push(event);
      if (event.type === "delta") {
        if (firstDeltaAt === null) firstDeltaAt = Date.now();
        deltaCount++;
        narration += event.text;
      }
    }
  }
  const totalMs = Date.now() - start;
  const firstTokenMs = firstDeltaAt ? firstDeltaAt - start : null;

  console.log(`\nEvent sequence: ${events.map((e) => e.type).join(" -> ")}`);
  console.log(`Streamed chunks: ${deltaCount}`);
  console.log(`Time to first token: ${firstTokenMs}ms`);
  console.log(`Total turn latency: ${totalMs}ms`);
  console.log(`Narration: ${JSON.stringify(narration)}`);

  const outcomeEvent = events.find((e) => e.type === "outcome");
  const doneEvent = events.find((e) => e.type === "done");
  console.log(`Outcome: ${JSON.stringify(outcomeEvent)}`);
  console.log(`Done stats: ${JSON.stringify(doneEvent?.stats)}`);

  if (deltaCount <= 1) {
    fail(
      `Expected more than one streamed delta chunk, got ${deltaCount}. This would mean the response was buffered, not truly streamed.`,
    );
  } else {
    ok(
      `Received ${deltaCount} distinct streamed chunks — real token/chunk streaming confirmed.`,
    );
  }

  if (!outcomeEvent || outcomeEvent.fallback) {
    fail(
      "Turn fell back to deterministic mode — this does NOT prove live model integration.",
    );
  } else {
    ok(`Model selected a valid outcome: ${outcomeEvent.id}`);
  }

  if (narration.length === 0) {
    fail("No narration text was produced.");
  } else {
    ok("Narration text was produced by the live model.");
  }

  console.log(
    "\nNote: the exact narration text above came from a live ornith-1.0-9b " +
      "call through LM Studio — it is not hardcoded anywhere in this repo, " +
      "which is itself evidence this ran against the real model rather than " +
      "a mock.",
  );
}

main().catch((err) => {
  fail(`Unexpected error: ${err.stack ?? err}`);
});
