import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  HARD_MAX_NARRATION_TOKENS,
  resolveNarration,
  sanitizeNarration,
} from "./narration";
import type { Outcome } from "./types";

const OUTCOME: Outcome = {
  kind: "clue",
  summary: "The player listens and hears slow breathing.",
  fallbackNarration: "You listen. Slow breathing answers from the dark.",
};

describe("buildSystemPrompt / buildUserPrompt", () => {
  it("establishes the output contract: describe only the given outcome", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/OUTCOME/);
    expect(prompt).toMatch(/1-2/);
  });

  it("builds a compact user prompt from context, never the full transcript", () => {
    const prompt = buildUserPrompt({
      doorPersonality: "hushed and heavy",
      tension: 10,
      outcome: OUTCOME,
    });
    expect(prompt).toContain("hushed and heavy");
    expect(prompt).toContain(OUTCOME.summary);
    expect(prompt.length).toBeLessThan(400);
  });

  it("labels tension level in words at low/mid/high bands", () => {
    expect(
      buildUserPrompt({ doorPersonality: "x", tension: 5, outcome: OUTCOME }),
    ).toContain("calm");
    expect(
      buildUserPrompt({ doorPersonality: "x", tension: 50, outcome: OUTCOME }),
    ).toContain("tense");
    expect(
      buildUserPrompt({ doorPersonality: "x", tension: 90, outcome: OUTCOME }),
    ).toContain("very tense");
  });
});

describe("sanitizeNarration", () => {
  it("passes through a clean short response", () => {
    expect(sanitizeNarration("You hear slow breathing in the dark.")).toBe(
      "You hear slow breathing in the dark.",
    );
  });

  it("strips a <think> reasoning block", () => {
    const raw =
      "<think>the player listened, so I should say...</think>You hear breathing.";
    expect(sanitizeNarration(raw)).toBe("You hear breathing.");
  });

  it("strips a role prefix", () => {
    expect(sanitizeNarration("Narrator: You hear breathing.")).toBe(
      "You hear breathing.",
    );
  });

  it("strips code fences and backticks", () => {
    expect(sanitizeNarration("```\nYou hear breathing.\n```")).toBe(
      "You hear breathing.",
    );
  });

  it("strips wrapping quotes", () => {
    expect(sanitizeNarration('"You hear breathing."')).toBe(
      "You hear breathing.",
    );
  });

  it("rejects empty output", () => {
    expect(sanitizeNarration("   ")).toBeNull();
    expect(sanitizeNarration("")).toBeNull();
  });

  it("rejects output containing forbidden meta-commentary", () => {
    expect(
      sanitizeNarration("As an AI, I cannot narrate violence."),
    ).toBeNull();
    expect(sanitizeNarration("I cannot help with that request.")).toBeNull();
  });

  it("truncates output longer than the hard token cap", () => {
    const longText = Array(HARD_MAX_NARRATION_TOKENS + 20)
      .fill("word")
      .join(" ");
    const result = sanitizeNarration(longText);
    expect(result).not.toBeNull();
    expect(result!.split(/\s+/).length).toBeLessThanOrEqual(
      HARD_MAX_NARRATION_TOKENS + 1, // +1 allows for the trailing ellipsis token
    );
  });
});

describe("resolveNarration", () => {
  it("uses the sanitized model response when valid", () => {
    const result = resolveNarration(OUTCOME, "You hear slow breathing.");
    expect(result.aiNarrated).toBe(true);
    expect(result.text).toBe("You hear slow breathing.");
  });

  it("falls back to deterministic narration when the model response is null", () => {
    const result = resolveNarration(OUTCOME, null);
    expect(result.aiNarrated).toBe(false);
    expect(result.text).toBe(OUTCOME.fallbackNarration);
  });

  it("falls back to deterministic narration when sanitization rejects the response", () => {
    const result = resolveNarration(OUTCOME, "As an AI language model, I...");
    expect(result.aiNarrated).toBe(false);
    expect(result.text).toBe(OUTCOME.fallbackNarration);
  });
});
