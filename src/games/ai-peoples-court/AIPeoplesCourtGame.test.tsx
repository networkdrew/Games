import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  CourtGameClient,
  CourtTurnRequest,
  CourtTurnResult,
} from "./CourtBridgeClient";
import AIPeoplesCourtGame from "./AIPeoplesCourtGame";

function makeClient(): CourtGameClient & {
  requests: CourtTurnRequest[];
} {
  const requests: CourtTurnRequest[] = [];
  return {
    requests,
    checkHealth: vi.fn(async () => ({
      reachable: true,
      installed: true,
      loaded: true,
      friendlyName: "Local test model",
    })),
    ensureModel: vi.fn(async () => ({ ok: true })),
    cancelPending: vi.fn(),
    takeTurn: vi.fn(
      async (body: CourtTurnRequest): Promise<CourtTurnResult> => {
        requests.push(body);
        if (body.phase === "opening") {
          return {
            messages: [
              {
                speaker: "bailiff",
                text: "All rise. Court is now in session.",
              },
              {
                speaker: "plaintiff",
                text: "I trusted Ellis with my orchid, Your Honor.",
              },
            ],
            memorySummary: "The case was called and Mara opened.",
            memoryFact: "Mara says she trusted Ellis with the orchid.",
            unavailable: false,
          };
        }
        return {
          messages: [
            {
              speaker: "defendant",
              text: "I opened the window, but only because the room smelled damp.",
            },
          ],
          memorySummary: "Ellis admitted opening the window.",
          memoryFact: "Ellis admitted opening the window.",
          unavailable: false,
        };
      },
    ),
  };
}

describe("AIPeoplesCourtGame", () => {
  it("opens as a local-model chat with individual courtroom speakers", async () => {
    const client = makeClient();
    render(<AIPeoplesCourtGame bridgeClient={client} initialCaseIndex={0} />);

    expect(screen.getByPlaceholderText(/Question anyone/)).toBeInTheDocument();
    expect(
      await screen.findByText("All rise. Court is now in session."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("I trusted Ellis with my orchid, Your Honor."),
    ).toBeInTheDocument();
    expect(client.requests[0]?.phase).toBe("opening");
  });

  it("sends free judge speech with memory and renders the response", async () => {
    const user = userEvent.setup();
    const client = makeClient();
    render(<AIPeoplesCourtGame bridgeClient={client} initialCaseIndex={0} />);
    await screen.findByText("All rise. Court is now in session.");

    const input = screen.getByPlaceholderText(/Question anyone/);
    await user.type(input, "Ellis, who opened the window?");
    await user.click(screen.getByRole("button", { name: "Speak" }));

    expect(
      await screen.findByText(
        "I opened the window, but only because the room smelled damp.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("You, Presiding Judge")).toBeInTheDocument();
    await waitFor(() => expect(client.requests).toHaveLength(2));
    expect(client.requests[1]?.memoryFacts).toContain(
      "Mara says she trusted Ellis with the orchid.",
    );
  });

  it("keeps the verdict under player control", async () => {
    const user = userEvent.setup();
    render(
      <AIPeoplesCourtGame bridgeClient={makeClient()} initialCaseIndex={0} />,
    );
    await screen.findByText("All rise. Court is now in session.");

    await user.click(screen.getByRole("button", { name: "Deliver verdict" }));
    await user.click(screen.getByRole("button", { name: "Mara Venn" }));

    expect(
      screen.getByText("Judgment entered for the plaintiff."),
    ).toBeInTheDocument();
  });
});
