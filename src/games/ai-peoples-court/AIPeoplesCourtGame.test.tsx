import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AIPeoplesCourtGame from "./AIPeoplesCourtGame";

describe("AIPeoplesCourtGame Phase 1 scaffold", () => {
  it("truthfully identifies the unfinished phase and links back to Games", () => {
    render(<AIPeoplesCourtGame />);

    expect(
      screen.getByRole("heading", {
        name: "The courtroom is not in session yet",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/No cases are available/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to all games" }),
    ).toHaveAttribute("href", "/");
  });
});
