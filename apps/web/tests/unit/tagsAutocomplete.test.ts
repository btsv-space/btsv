import { describe, it, expect } from "vitest";
import {
  getActiveSegment,
  replaceSegment,
  filterTags,
} from "$lib/tagsAutocomplete";

describe("getActiveSegment", () => {
  it("returns the whole value when there is no comma", () => {
    expect(getActiveSegment("abc", 3)).toBe("abc");
  });

  it("returns the trimmed last segment when caret is at the end", () => {
    expect(getActiveSegment("foo, ba", 7)).toBe("ba");
  });

  it("returns the middle segment when the caret is inside it", () => {
    //           0123456789
    const v = "aa, bb, cc";
    expect(getActiveSegment(v, 5)).toBe("bb");
  });

  it("returns an empty segment right after a comma+space", () => {
    expect(getActiveSegment("foo, ", 5)).toBe("");
  });

  it("returns the first segment when the caret is at position 0", () => {
    expect(getActiveSegment("foo, bar", 0)).toBe("foo");
  });
});

describe("replaceSegment", () => {
  it("inserts into an empty value with a trailing separator", () => {
    expect(replaceSegment("", 0, "js")).toEqual({
      value: "js, ",
      caret: 4,
    });
  });

  it("replaces the last segment, preserving the ', ' prefix", () => {
    //           0123456
    const v = "foo, ja";
    expect(replaceSegment(v, 7, "javascript")).toEqual({
      value: "foo, javascript, ",
      caret: 17,
    });
  });

  it("replaces a middle segment without doubling the separator", () => {
    //           0123456789
    const v = "ja, b, c";
    expect(replaceSegment(v, 2, "javascript")).toEqual({
      value: "javascript, b, c",
      caret: 10,
    });
  });

  it("replaces the first segment when followed by a comma", () => {
    const v = "x, rest";
    expect(replaceSegment(v, 1, "tag")).toEqual({
      value: "tag, rest",
      caret: 3,
    });
  });
});

describe("filterTags", () => {
  const all = ["JavaScript", "java", "script", "js", "typescript", "node"];

  it("returns nothing for an empty segment (minimum one character)", () => {
    expect(filterTags(all, "", "")).toEqual([]);
    expect(filterTags(all, "", "java, ")).toEqual([]);
  });

  it("matches case-insensitively, prefix before substring", () => {
    expect(filterTags(all, "ja", "")).toEqual(["java", "JavaScript"]);
  });

  it("ranks prefix matches before substring matches", () => {
    expect(filterTags(all, "script", "")).toEqual([
      "script",
      "JavaScript",
      "typescript",
    ]);
  });

  it("excludes tags already present in other segments", () => {
    // "s" matches JavaScript, script, js, typescript — but "js" is used
    expect(filterTags(all, "s", "js, ")).toEqual([
      "script",
      "JavaScript",
      "typescript",
    ]);
  });

  it("does not exclude the tag matching the segment being edited", () => {
    expect(filterTags(all, "java", "java")).toEqual(["java", "JavaScript"]);
  });

  it("excludes used tags case-insensitively", () => {
    expect(filterTags(all, "s", "JS, ")).not.toContain("js");
  });

  it("respects the limit", () => {
    expect(filterTags(all, "s", "", 2)).toEqual(["script", "JavaScript"]);
  });
});
