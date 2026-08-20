import { describe, it, expect } from "vitest";
import { parseMdx, serializeMdx } from "$lib/parser";
import type { IPostRecord } from "$lib/shared/types";

function mdx(frontmatter: string): string {
  return `---\n${frontmatter}\n---\n\nBody text.\n`;
}

describe("parseMdx date fields", () => {
  it("keeps full precision for unquoted datetimes (parsed as Date by js-yaml)", () => {
    const post = parseMdx(
      mdx(
        [
          "title: T",
          "dateCreated: 2026-08-19T14:30:22Z",
          "dateUpdated: 2026-08-19T15:31:23Z",
          "datePublished: 2026-08-19T16:32:24Z",
        ].join("\n"),
      ),
      "id-1",
    );
    expect(post.dateCreated).toBe("2026-08-19T14:30:22Z");
    expect(post.dateUpdated).toBe("2026-08-19T15:31:23Z");
    expect(post.datePublished).toBe("2026-08-19T16:32:24Z");
  });

  it("passes quoted strings through unchanged (day or datetime)", () => {
    const post = parseMdx(
      mdx(
        [
          "title: T",
          'dateCreated: "2026-08-19"',
          'dateUpdated: "2026-08-19T15:31:23Z"',
        ].join("\n"),
      ),
      "id-1",
    );
    expect(post.dateCreated).toBe("2026-08-19");
    expect(post.dateUpdated).toBe("2026-08-19T15:31:23Z");
  });

  it("falls back to now() for missing dateCreated/dateUpdated", () => {
    const post = parseMdx(mdx("title: T"), "id-1");
    const shape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    expect(post.dateCreated).toMatch(shape);
    expect(post.dateUpdated).toMatch(shape);
    expect(post.datePublished).toBeUndefined();
  });
});

describe("serializeMdx date fields", () => {
  it("round-trips full-precision strings (quoted, so they stay strings)", () => {
    const post = {
      projectId: "p",
      id: "id-1",
      slug: "",
      title: "T",
      dateCreated: "2026-08-19T14:30:22Z",
      dateUpdated: "2026-08-19T15:31:23Z",
      datePublished: "2026-08-19T16:32:24Z",
      description: "",
      tags: [],
      draft: false,
      page: false,
      body: "Body text.",
      extra: {},
      dirty: 0,
    } satisfies IPostRecord;
    const reparsed = parseMdx(serializeMdx(post), "id-1");
    expect(reparsed.dateCreated).toBe(post.dateCreated);
    expect(reparsed.dateUpdated).toBe(post.dateUpdated);
    expect(reparsed.datePublished).toBe(post.datePublished);
  });
});
