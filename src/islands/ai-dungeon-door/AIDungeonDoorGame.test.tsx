import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIDungeonDoorGame from "./AIDungeonDoorGame";
import { getScenario } from "@/lib/games-logic/ai-dungeon-door/scenarios";

function stubUnavailableBridge() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("connection refused")),
  );
}

describe("AIDungeonDoorGame", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the scenario intro and initial status for a given seed", async () => {
    stubUnavailableBridge();
    render(<AIDungeonDoorGame initialSeed={0} />);
    const scenario = getScenario("sleeping-creature");
    expect(screen.getByText(scenario.intro)).toBeInTheDocument();
    expect(screen.getByText("0 / 9")).toBeInTheDocument(); // turn counter
    await waitFor(() =>
      expect(screen.getByText(/deterministic story mode/i)).toBeInTheDocument(),
    );
  });

  it("shows suggested actions the player can click", () => {
    stubUnavailableBridge();
    render(<AIDungeonDoorGame initialSeed={0} />);
    const scenario = getScenario("sleeping-creature");
    for (const action of scenario.startingSuggestions) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    }
  });

  it("advances the turn counter and shows narration after submitting an action", async () => {
    stubUnavailableBridge();
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);

    await user.click(
      screen.getByRole("button", { name: "Listen at the door" }),
    );

    await waitFor(() => expect(screen.getByText("1 / 9")).toBeInTheDocument());
    expect(screen.getByText(/press your ear to the wood/i)).toBeInTheDocument();
  });

  it("does not cost a turn for an inventory check", async () => {
    stubUnavailableBridge();
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
    stubUnavailableBridge();
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);

    const button = screen.getByRole("button", { name: "Listen at the door" });
    await user.click(button);
    // The submit button and suggestion chips should be disabled immediately
    // after clicking, preventing a duplicate submission before state settles.
    expect(screen.getByRole("button", { name: "Act" })).toBeDisabled();
  });

  it("offers a restart control that starts a fresh run", async () => {
    stubUnavailableBridge();
    const user = userEvent.setup();
    render(<AIDungeonDoorGame initialSeed={0} />);

    await user.click(
      screen.getByRole("button", { name: /restart with a new door/i }),
    );
    await waitFor(() => expect(screen.getByText("0 / 9")).toBeInTheDocument());
  });

  it("reaches a losing ending after repeated forceful actions and offers a new run", async () => {
    stubUnavailableBridge();
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
