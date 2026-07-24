import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCourtSystemPrompt,
  parseCourtResponse,
} from "./court-protocol.mjs";

test("court prompt reserves the judge and verdict for the human", () => {
  const prompt = buildCourtSystemPrompt();
  assert.match(prompt, /Never speak as the judge/);
  assert.match(prompt, /decide the verdict/);
});

test("court response parses distinct speakers and bounded memory", () => {
  const parsed = parseCourtResponse(
    [
      "MEMORY: Mara answered; Ellis interrupted to dispute her account.",
      "FACT: Ellis says the window was already open.",
      "MESSAGES:",
      "[plaintiff] I left clear instructions beside the orchid.",
      "[defendant] That is not true—the card never mentioned a window.",
    ].join("\n"),
  );
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.messages[0].speaker, "plaintiff");
  assert.equal(parsed.messages[1].speaker, "defendant");
  assert.match(parsed.memoryFact, /window was already open/);
});

test("court response rejects a judge impersonation", () => {
  const parsed = parseCourtResponse(
    [
      "MEMORY: The judge ruled.",
      "FACT: NONE",
      "MESSAGES:",
      "[judge] I find for the plaintiff.",
    ].join("\n"),
  );
  assert.equal(parsed, null);
});
