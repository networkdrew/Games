import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attributeCourtMemory,
  buildCourtSpeakerSystemPrompt,
  hasCourtResponseMarker,
  parseCourtControl,
  sanitizeCourtDialogue,
  textAfterCourtResponseMarker,
} from "./court-protocol.mjs";

const ELLIS = {
  id: "defendant",
  name: "Ellis Rowe",
  role: "defendant",
  voice: "friendly but defensive",
  privateKnowledge: "Ellis opened the window and forgot it.",
};

test("court prompt confines generation to one code-selected role", () => {
  const prompt = buildCourtSpeakerSystemPrompt(ELLIS);
  assert.match(prompt, /You are Ellis Rowe/);
  assert.match(prompt, /Perform only this one person/);
  assert.match(prompt, /Never write dialogue.*judge.*another participant/);
});

test("court protocol keeps memory hidden before RESPONSE", () => {
  const raw = [
    "MEMORY: Ellis admitted opening the window.",
    "FACT: Ellis opened the window.",
    "RESPONSE:",
    "I opened it because the room smelled damp.",
  ].join("\n");
  assert.equal(hasCourtResponseMarker(raw), true);
  assert.deepEqual(parseCourtControl(raw), {
    memorySummary: "Ellis admitted opening the window.",
    memoryFact: "Ellis opened the window.",
  });
  assert.equal(
    textAfterCourtResponseMarker(raw),
    "I opened it because the room smelled damp.",
  );
});

test("court dialogue rejects attempts to switch speaker labels", () => {
  assert.equal(
    sanitizeCourtDialogue("[witness] I opened the window myself."),
    null,
  );
  assert.equal(sanitizeCourtDialogue("Defendant: I opened the window."), null);
});

test("court protocol accepts RESPONSE dialogue on the marker line", () => {
  const raw =
    "MEMORY: Ellis answered.\nFACT: NONE\nRESPONSE: I opened the window.";
  assert.equal(hasCourtResponseMarker(raw), true);
  assert.equal(textAfterCourtResponseMarker(raw), "I opened the window.");
  assert.equal(
    sanitizeCourtDialogue(textAfterCourtResponseMarker(raw)),
    "I opened the window.",
  );
});

test("court memory is attributed and kept inside the next-turn cap", () => {
  const attributed = attributeCourtMemory(
    `I remember ${"a".repeat(200)}`,
    "Ellis Rowe",
    160,
  );
  assert.match(attributed, /^Ellis Rowe: I remember/);
  assert.ok(attributed.length <= 160);
});
