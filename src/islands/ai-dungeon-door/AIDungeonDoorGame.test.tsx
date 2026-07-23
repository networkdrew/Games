import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIDungeonDoorGame from "./AIDungeonDoorGame";
import { getScenario } from "@/lib/games-logic/ai-dungeon-door/scenarios";
import type { TurnEvent } from "@/lib/bridge/client";

function ndjsonBody(events: TurnEvent[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const e of events)
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      controller.close();
    },
  });
}

function stubOfflineBridge() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("connection refused")),
  );
}

function stubConnectedBridge(
  turnEvents: TurnEvent[],
  primaryModelId = "ornith-1.0-9b",
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      const href = typeof url === "string" ? url : String(url);
      if (href.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, primaryModelId }),
        } as Response);
      }
      if (href.includes("/api/dungeon/turn")) {
        return Promise.resolve({
          ok: true,
          body: ndjsonBody(turnEvents),
        } as unknown as Response);
      }
      return Promise.reject(new Error(`unexpected fetch to ${href}`));
    }),
  );
}

describe("AIDungeonDoorGame — offline/deterministic mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the scenario intro and initial status for a given seed", async () => {
    stubOfflineBridge();
    render(<AIDungeonDoorGame initialSeed={0} />);
    const scenario = getScenario("sleeping-creature");
    expect(screen.getByText(scenario.intro)).toBeInTheDocument();
    expect(screen.getByText("0 / 9")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/offline fallback mode/i)).toBeInTheDocument(),
    );
  });

  it("shows suggested actions the player can click", () => {
    stubOfflineBridge();
    render(<AIDungeonDoorGame initialSeed={0} />);
    const scenario = getScenario("sleeping-creature");
    for (const action of scenario.startingSuggestions) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    }
  });

  it("advances the turn counter and shows deterministic narration, marked as not-AI", async () => {
    stubOfflineBridge();
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);

    await user.click(
      screen.getByRole("button", { name: "Listen at the door" }),
    );

    await waitFor(() => expect(screen.getByText("1 / 9")).toBeInTheDocument());
    expect(screen.getByText(/press your ear to the wood/i)).toBeInTheDocument();
    expect(screen.queryByText("AI")).not.toBeInTheDocument();
  });

  it("does not cost a turn for an inventory check", async () => {
    stubOfflineBridge();
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);

    const input = screen.getByLabelText(/what do you do/i);
    await user.type(input, "check my inventory");
    await user.click(screen.getByRole("button", { name: "Act" }));

    await waitFor(() =>
      expect(
        screen.getByText(/you check what you're carrying/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("0 / 9")).toBeInTheDocument();
  });

  it("disables the action input while a submission is pending", async () => {
    stubOfflineBridge();
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);

    await user.click(
      screen.getByRole("button", { name: "Listen at the door" }),
    );
    expect(screen.getByRole("button", { name: "Act" })).toBeDisabled();
  });

  it("offers a restart control that starts a fresh run", async () => {
    stubOfflineBridge();
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);

    await user.click(
      screen.getByRole("button", { name: /restart with a new door/i }),
    );
    // A restart picks a new random scenario, whose maxTurns may differ —
    // just confirm the turn counter reset to 0 of *something*.
    await waitFor(() =>
      expect(screen.getByText(/^0 \/ \d+$/)).toBeInTheDocument(),
    );
  });

  it("reaches a losing ending after repeated forceful actions and offers a new run", async () => {
    stubOfflineBridge();
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);

    for (let i = 0; i < 6; i++) {
      if (screen.queryByRole("button", { name: /start a new run/i })) break;
      const input = screen.getByLabelText(/what do you do/i);
      await user.clear(input);
      await user.type(input, "kick the door");
      await user.click(screen.getByRole("button", { name: "Act" }));
      await waitFor(() => {
        const newRun = screen.queryByRole("button", {
          name: /start a new run/i,
        });
        const actButton = screen.queryByRole("button", { name: "Act" });
        expect(Boolean(newRun) || Boolean(actButton)).toBe(true);
      });
    }

    expect(
      screen.getByRole("button", { name: /start a new run/i }),
    ).toBeInTheDocument();
  });
});

describe("AIDungeonDoorGame — AI-connected streaming mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the connected model name once health check succeeds", async () => {
    stubConnectedBridge([]);
    render(<AIDungeonDoorGame initialSeed={0} />);
    await waitFor(() =>
      expect(
        screen.getByText(/local ai: ornith 9b connected/i),
      ).toBeInTheDocument(),
    );
  });

  it("streams narration live and marks the resulting history entry as AI-narrated", async () => {
    stubConnectedBridge([
      { type: "start", requestId: "abc" },
      { type: "model", modelId: "ornith-1.0-9b", tier: "primary" },
      { type: "delta", text: "You press " },
      { type: "delta", text: "your ear to the door and hear slow breathing." },
      {
        type: "outcome",
        id: "REVEAL_SOUND_CLUE",
        memoryFact: "The player listened carefully.",
        fallback: false,
        corrected: false,
      },
      { type: "done", stats: { firstTokenMs: 50, totalMs: 200, chunks: 2 } },
    ]);
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);
    await waitFor(() =>
      expect(
        screen.getByText(/local ai: ornith 9b connected/i),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Listen at the door" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          /You press your ear to the door and hear slow breathing\./,
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("AI")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1 / 9")).toBeInTheDocument());
  });

  it("falls back to deterministic narration when the AI returns an outcome not in the legal list", async () => {
    stubConnectedBridge([
      { type: "start", requestId: "abc" },
      { type: "model", modelId: "ornith-1.0-9b", tier: "primary" },
      { type: "delta", text: "Something happens." },
      {
        type: "outcome",
        id: "TOTALLY_MADE_UP",
        fallback: false,
        corrected: false,
      },
      { type: "done", stats: {} },
    ]);
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);
    await waitFor(() =>
      expect(
        screen.getByText(/local ai: ornith 9b connected/i),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Listen at the door" }),
    );

    // Client-side defense-in-depth rejects an outcome id the bridge claims
    // is valid but isn't in this turn's own legal list, and falls back to
    // the deterministic engine's prewritten narration instead.
    await waitFor(() =>
      expect(
        screen.getByText(/press your ear to the wood/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("fallback")).toBeInTheDocument();
  });

  it("falls back to deterministic mode when the bridge reports fallback:true", async () => {
    stubConnectedBridge([
      { type: "start", requestId: "abc" },
      { type: "model", modelId: null, tier: "primary" },
      { type: "outcome", id: null, fallback: true, corrected: false },
      { type: "done", stats: { fallback: true } },
    ]);
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);
    await waitFor(() =>
      expect(
        screen.getByText(/local ai: ornith 9b connected/i),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Listen at the door" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/press your ear to the wood/i),
      ).toBeInTheDocument(),
    );
  });

  it("does not crash and starts a clean new run when reset happens mid-stream", async () => {
    let resolveFetch: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const href = String(url);
        if (href.includes("/health")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ok: true, primaryModelId: "ornith-1.0-9b" }),
          } as Response);
        }
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }),
    );
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);
    await waitFor(() =>
      expect(
        screen.getByText(/local ai: ornith 9b connected/i),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Listen at the door" }),
    );
    expect(screen.getByRole("button", { name: "Act" })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: /restart with a new door/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/^0 \/ \d+$/)).toBeInTheDocument(),
    );
    // The submit button is also disabled while the input is empty — type
    // something to confirm it's `pending`, not the empty-input case, that's clear.
    await user.type(screen.getByLabelText(/what do you do/i), "wait");
    expect(screen.getByRole("button", { name: "Act" })).not.toBeDisabled();

    // Resolve the abandoned first request late — must not resurrect stale state.
    resolveFetch?.({ ok: true, body: ndjsonBody([]) } as unknown as Response);
  });
});
