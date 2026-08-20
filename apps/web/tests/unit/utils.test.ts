import { describe, it, expect } from "vitest";
import {
  now,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  formatPostDate,
} from "$lib/shared/utils";

describe("now", () => {
  it("returns second-precision ISO UTC", () => {
    const val = now();
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // parses back to exactly the instant it denotes
    expect(new Date(val).toISOString()).toBe(val.replace("Z", ".000Z"));
  });
});

describe("toDatetimeLocalValue", () => {
  it("maps empty/undefined to empty string", () => {
    expect(toDatetimeLocalValue(undefined)).toBe("");
    expect(toDatetimeLocalValue("")).toBe("");
  });

  it("maps legacy day-precision to local midnight (no UTC day-shift)", () => {
    expect(toDatetimeLocalValue("2025-01-10")).toBe("2025-01-10T00:00");
  });

  it("returns empty string for unparseable input", () => {
    expect(toDatetimeLocalValue("not-a-date")).toBe("");
  });

  it("converts full ISO to a local datetime-local value (minute precision)", () => {
    // whole-minute instant: the input's minute precision round-trips exactly
    const val = toDatetimeLocalValue("2026-08-19T14:30:00Z");
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDatetimeLocalValue(val)).toBe("2026-08-19T14:30:00Z");
  });
});

describe("formatPostDate", () => {
  it("passes legacy day-precision through unchanged (no fake 00:00)", () => {
    expect(formatPostDate("2025-01-10")).toBe("2025-01-10");
  });

  it("formats full precision as local YYYY-MM-DD, HH:mm", () => {
    const val = formatPostDate("2026-08-19T14:30:22Z");
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}, \d{2}:\d{2}$/);
    // same local wall-clock parts as the input conversion (TZ-independent)
    expect(val).toBe(
      toDatetimeLocalValue("2026-08-19T14:30:22Z").replace("T", ", "),
    );
  });

  it("passes unparseable input through unchanged", () => {
    expect(formatPostDate("garbage")).toBe("garbage");
  });
});

describe("fromDatetimeLocalValue", () => {
  it("maps empty to undefined (clearing the field)", () => {
    expect(fromDatetimeLocalValue("")).toBeUndefined();
  });

  it("returns undefined for unparseable input", () => {
    expect(fromDatetimeLocalValue("garbage")).toBeUndefined();
  });

  it("converts a local input value to second-precision ISO UTC", () => {
    const val = fromDatetimeLocalValue("2026-08-19T14:30");
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    // round-trips back to the same local wall-clock time
    expect(toDatetimeLocalValue(val)).toBe("2026-08-19T14:30");
  });
});
