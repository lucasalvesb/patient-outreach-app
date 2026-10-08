import { describe, expect, it } from "vitest";
import { telHref } from "./phone";

describe("telHref", () => {
  it("keeps only the digits and a leading plus, so any written format dials", () => {
    expect(telHref("555-0101")).toBe("tel:5550101");
    expect(telHref("+1 (555) 010-0101")).toBe("tel:+15550100101");
    expect(telHref("555.010.0101")).toBe("tel:5550100101");
  });
});
