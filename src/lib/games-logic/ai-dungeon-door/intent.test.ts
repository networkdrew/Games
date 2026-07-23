import { describe, expect, it } from "vitest";
import { parseAction } from "./intent";

const INVENTORY = ["rusty key", "dry bread"];

describe("parseAction", () => {
  it("matches listen phrasing", () => {
    expect(parseAction("listen at the door", INVENTORY).intent).toBe("listen");
    expect(parseAction("I put my ear to the wood", INVENTORY).intent).toBe(
      "listen",
    );
  });

  it("matches knock phrasing", () => {
    expect(parseAction("knock three times", INVENTORY).intent).toBe("knock");
  });

  it("matches look-under phrasing", () => {
    expect(parseAction("look underneath it", INVENTORY).intent).toBe(
      "look-under",
    );
  });

  it("matches force/kick phrasing", () => {
    expect(parseAction("kick the door", INVENTORY).intent).toBe("force");
    expect(parseAction("bash it down", INVENTORY).intent).toBe("force");
  });

  it("matches ask phrasing", () => {
    expect(parseAction("ask who is inside", INVENTORY).intent).toBe("ask");
    expect(parseAction("who's there?", INVENTORY).intent).toBe("ask");
  });

  it("matches search-wall phrasing", () => {
    expect(parseAction("search the surrounding wall", INVENTORY).intent).toBe(
      "search-wall",
    );
  });

  it("matches use-item when an inventory item is named", () => {
    const result = parseAction("use the rusty key", INVENTORY);
    expect(result.item).toBe("rusty key");
  });

  it("matches offer when giving an inventory item", () => {
    const result = parseAction(
      "offer the dry bread to the creature",
      INVENTORY,
    );
    expect(result.intent).toBe("offer");
    expect(result.item).toBe("dry bread");
  });

  it("falls back to use-key when 'key' is said without the full item name", () => {
    expect(parseAction("use my key on the lock", INVENTORY).intent).toBe(
      "use-key",
    );
  });

  it("matches wait phrasing", () => {
    expect(parseAction("wait quietly", INVENTORY).intent).toBe("wait");
  });

  it("matches inventory phrasing", () => {
    expect(parseAction("check my inventory", INVENTORY).intent).toBe(
      "inventory",
    );
  });

  it("returns freeform for empty or unrecognized input", () => {
    expect(parseAction("", INVENTORY).intent).toBe("freeform");
    expect(parseAction("juggle three oranges", INVENTORY).intent).toBe(
      "freeform",
    );
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseAction("   KNOCK loudly   ", INVENTORY).intent).toBe("knock");
  });
});
