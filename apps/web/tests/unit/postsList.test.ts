import { describe, it, expect } from "vitest";
import {
  DEFAULT_LIST_PREFS,
  isDefaultListPrefs,
  matchesListPrefs,
  sanitizeListPrefs,
} from "$lib/postsList";
import type { IPostRecord, IPostsListPrefs } from "$lib/shared/types";

function makePost(overrides: Partial<IPostRecord> = {}): IPostRecord {
  return {
    projectId: "proj-1",
    id: "20260101-00000000-abcd",
    slug: "",
    title: "",
    dateCreated: "2026-01-01",
    dateUpdated: "2026-01-01",
    description: "",
    tags: [],
    draft: false,
    page: false,
    body: "",
    extra: {},
    dirty: 0,
    ...overrides,
  };
}

function prefs(overrides: Partial<IPostsListPrefs> = {}): IPostsListPrefs {
  return { ...DEFAULT_LIST_PREFS, ...overrides };
}

describe("matchesListPrefs", () => {
  it("passes a plain post under default prefs", () => {
    expect(matchesListPrefs(makePost(), DEFAULT_LIST_PREFS)).toBe(true);
  });

  it("excludes deleted posts regardless of filters", () => {
    expect(matchesListPrefs(makePost({ deleted: true }), prefs())).toBe(false);
    expect(
      matchesListPrefs(makePost({ deleted: true, draft: true }), prefs()),
    ).toBe(false);
  });

  it("draft filter: drafts-only keeps drafts, drops published", () => {
    const p = prefs({ draft: "drafts" });
    expect(matchesListPrefs(makePost({ draft: true }), p)).toBe(true);
    expect(matchesListPrefs(makePost({ draft: false }), p)).toBe(false);
  });

  it("draft filter: published-only keeps published, drops drafts", () => {
    const p = prefs({ draft: "published" });
    expect(matchesListPrefs(makePost({ draft: false }), p)).toBe(true);
    expect(matchesListPrefs(makePost({ draft: true }), p)).toBe(false);
  });

  it("page filter: pages-only keeps pages, drops posts", () => {
    const p = prefs({ page: "pages" });
    expect(matchesListPrefs(makePost({ page: true }), p)).toBe(true);
    expect(matchesListPrefs(makePost({ page: false }), p)).toBe(false);
  });

  it("page filter: posts-only keeps posts, drops pages", () => {
    const p = prefs({ page: "posts" });
    expect(matchesListPrefs(makePost({ page: false }), p)).toBe(true);
    expect(matchesListPrefs(makePost({ page: true }), p)).toBe(false);
  });

  it("combines draft + page filters", () => {
    const p = prefs({ draft: "drafts", page: "pages" });
    expect(matchesListPrefs(makePost({ draft: true, page: true }), p)).toBe(
      true,
    );
    expect(matchesListPrefs(makePost({ draft: true, page: false }), p)).toBe(
      false,
    );
    expect(matchesListPrefs(makePost({ draft: false, page: true }), p)).toBe(
      false,
    );
  });
});

describe("isDefaultListPrefs", () => {
  it("true for defaults", () => {
    expect(isDefaultListPrefs(DEFAULT_LIST_PREFS)).toBe(true);
    expect(isDefaultListPrefs(prefs())).toBe(true);
  });

  it("false when any field differs", () => {
    expect(isDefaultListPrefs(prefs({ sort: "dateUpdated" }))).toBe(false);
    expect(isDefaultListPrefs(prefs({ order: "asc" }))).toBe(false);
    expect(isDefaultListPrefs(prefs({ draft: "drafts" }))).toBe(false);
    expect(isDefaultListPrefs(prefs({ page: "pages" }))).toBe(false);
  });
});

describe("sanitizeListPrefs", () => {
  it("passes a valid payload through", () => {
    const valid: IPostsListPrefs = {
      sort: "datePublished",
      order: "asc",
      draft: "published",
      page: "pages",
    };
    expect(sanitizeListPrefs(valid)).toEqual(valid);
  });

  it("fills missing fields with defaults", () => {
    expect(sanitizeListPrefs({ sort: "dateUpdated" })).toEqual(
      prefs({ sort: "dateUpdated" }),
    );
  });

  it("falls back per-field on invalid enum values", () => {
    expect(sanitizeListPrefs({ sort: "title", order: "sideways" })).toEqual(
      prefs(),
    );
    expect(sanitizeListPrefs({ draft: "maybe", page: "posts" })).toEqual(
      prefs({ page: "posts" }),
    );
  });

  it("returns full defaults for non-object input", () => {
    expect(sanitizeListPrefs(undefined)).toEqual(DEFAULT_LIST_PREFS);
    expect(sanitizeListPrefs(null)).toEqual(DEFAULT_LIST_PREFS);
    expect(sanitizeListPrefs("dateCreated")).toEqual(DEFAULT_LIST_PREFS);
    expect(sanitizeListPrefs(42)).toEqual(DEFAULT_LIST_PREFS);
  });
});
