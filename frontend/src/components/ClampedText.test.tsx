import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClampedText } from "./ClampedText";

const LONG_NAME = "Maria Fernanda Albuquerque de Souza Vasconcelos Montenegro Carvalho Pereira";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClampedText", () => {
  it("shows a value that fits as plain text, with no tooltip or hint", () => {
    render(<ClampedText>Jane Testperson</ClampedText>);

    const value = screen.getByText("Jane Testperson");
    expect(value).not.toHaveAttribute("title");
    expect(value).not.toHaveClass("cell-text--cut");
  });

  it("gives a cut-off value a tooltip with the full text, hinted by a dotted underline", () => {
    // jsdom has no layout, so pretend the text is taller than its two visible lines.
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(120);
    vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(48);

    render(<ClampedText className="patient-name">{LONG_NAME}</ClampedText>);

    const value = screen.getByText(LONG_NAME);
    expect(value).toHaveAttribute("title", LONG_NAME);
    expect(value).toHaveClass("cell-text", "cell-text--cut", "patient-name");
  });
});
