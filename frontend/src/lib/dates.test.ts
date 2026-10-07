import { describe, expect, it } from "vitest";
import { ageOn, formatDate, timeSince, toISODate } from "./dates";

describe("ageOn", () => {
  it("counts a birthday only once it has happened this year", () => {
    expect(ageOn("1980-02-14", new Date(2026, 1, 13))).toBe(45);
    expect(ageOn("1980-02-14", new Date(2026, 1, 14))).toBe(46);
  });
});

describe("formatDate", () => {
  it("shows a calendar date exactly as stored, whatever the browser's time zone", () => {
    expect(formatDate("1980-02-14")).toBe("Feb 14, 1980");
    expect(formatDate("2024-01-01")).toBe("Jan 1, 2024");
  });
});

describe("timeSince", () => {
  const today = new Date(2026, 9, 7); // Oct 7, 2026 (local)

  it("counts whole months under two years", () => {
    expect(timeSince("2025-03-01", today)).toBe("19 months ago");
    expect(timeSince("2026-09-07", today)).toBe("1 month ago");
  });

  it("switches to years from two years on", () => {
    expect(timeSince("2024-09-10", today)).toBe("2 years ago");
    expect(timeSince("2015-07-07", today)).toBe("11 years ago");
  });

  it("uses days for recent dates", () => {
    expect(timeSince("2026-10-07", today)).toBe("today");
    expect(timeSince("2026-10-06", today)).toBe("1 day ago");
    expect(timeSince("2026-09-20", today)).toBe("17 days ago");
  });
});

describe("toISODate", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
