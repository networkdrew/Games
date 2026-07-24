import { describe, expect, it } from "vitest";
import { generateCourtCase } from "./generator";

describe("procedural court generator", () => {
  it("reproduces the same complete case from a seed", () => {
    const first = generateCourtCase(481516, 4);
    const second = generateCourtCase(481516, 4);
    expect(second).toEqual(first);
    expect(first.difficulty).toBe(4);
    expect(first.evidence).toHaveLength(3);
    expect(first.plaintiff.name).not.toBe(first.defendant.name);
    expect(first.generation.seed).toBe(481516);
  });

  it("varies names, disputes, truth, and complexity across seeds", () => {
    const generated = [101, 202, 303, 404, 505].map((seed, index) =>
      generateCourtCase(seed, index + 1),
    );
    expect(new Set(generated.map((courtCase) => courtCase.id)).size).toBe(5);
    expect(
      new Set(generated.map((courtCase) => courtCase.plaintiff.name)).size,
    ).toBeGreaterThan(2);
    expect(generated.map((courtCase) => courtCase.difficulty)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (const courtCase of generated) {
      expect(["plaintiff", "defendant"]).toContain(courtCase.correctVerdict);
      expect(courtCase.privateTruth.length).toBeGreaterThan(40);
      expect(courtCase.complexity.length).toBeGreaterThanOrEqual(3);
    }
  });
});
