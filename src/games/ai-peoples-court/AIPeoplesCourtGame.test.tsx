import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AIPeoplesCourtGame from "./AIPeoplesCourtGame";

describe("AIPeoplesCourtGame", () => {
  it("presents a playable case with evidence, questions, and verdicts", () => {
    render(<AIPeoplesCourtGame initialCaseIndex={0} />);

    expect(
      screen.getByRole("heading", {
        name: "The Orchid and the Open Window",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Court is in session" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Care instruction card/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Did you mention the window before leaving?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rule for Mara Venn" }),
    ).toBeInTheDocument();
  });

  it("records investigation and lets the player decide the case", async () => {
    const user = userEvent.setup();
    render(<AIPeoplesCourtGame initialCaseIndex={0} />);

    await user.click(
      screen.getByRole("button", { name: /Care instruction card/ }),
    );
    expect(
      screen.getByText(/It says nothing about the window/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1\/3 exhibits/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Did you mention the window before leaving?",
      }),
    );
    expect(
      screen.getByText(/Not aloud\. I thought the care card/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Rule for Mara Venn" }),
    );
    expect(
      screen.getByRole("heading", { name: "Sound judgment" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/You ruled for the plaintiff/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Call the next case" }),
    ).toBeInTheDocument();
  });

  it("moves to a different case when the next case is called", async () => {
    const user = userEvent.setup();
    render(<AIPeoplesCourtGame initialCaseIndex={0} />);

    await user.click(screen.getByRole("button", { name: "Next case" }));

    expect(
      screen.getByRole("heading", { name: "The Vanishing Parade Float" }),
    ).toBeInTheDocument();
  });
});
