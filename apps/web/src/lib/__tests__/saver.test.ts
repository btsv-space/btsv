import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizePost, contentEqual, DebouncedSaver } from "$lib/saver";
import type { IPostRecord } from "$lib/shared/types";

const { mockSavePost } = vi.hoisted(() => ({
  mockSavePost: vi.fn((_p: IPostRecord) => Promise.resolve()),
}));

vi.mock("$lib/db", () => ({
  dbSavePost: mockSavePost,
}));

function makePost(overrides: Partial<IPostRecord> = {}): IPostRecord {
  return {
    projectId: "proj-1",
    id: "20260608-14302250",
    slug: "hello-world",
    title: "Hello World",
    dateCreated: "2026-05-01",
    dateUpdated: "2026-06-01",
    datePublished: "2026-06-01",
    description: "A test post",
    tags: ["tag1", "tag2"],
    draft: false,
    page: false,
    body: "Some content",
    extra: {},
    dirty: 0,
    ...overrides,
  };
}

describe("normalizePost", () => {
  it("splits comma-separated tags into array", () => {
    const post = makePost({ tags: [] });
    const result = normalizePost(post, "a, b , c");
    expect(result.tags).toEqual(["a", "b", "c"]);
  });

  it("filters empty tags from trailing commas", () => {
    const post = makePost({ tags: [] });
    const result = normalizePost(post, "a, , b,");
    expect(result.tags).toEqual(["a", "b"]);
  });

  it("returns empty array for empty input", () => {
    const post = makePost({ tags: [] });
    const result = normalizePost(post, "");
    expect(result.tags).toEqual([]);
  });

  it("handles whitespace-only input", () => {
    const post = makePost({ tags: [] });
    const result = normalizePost(post, "  ");
    expect(result.tags).toEqual([]);
  });

  it("preserves all other post fields", () => {
    const post = makePost();
    const result = normalizePost(post, "x, y");
    expect(result.title).toBe("Hello World");
    expect(result.body).toBe("Some content");
    expect(result.projectId).toBe("proj-1");
  });
});

describe("contentEqual", () => {
  it("returns true for identical posts", () => {
    const a = makePost();
    const b = makePost();
    expect(contentEqual(a, b)).toBe(true);
  });

  it("returns false when title differs", () => {
    const a = makePost({ title: "A" });
    const b = makePost({ title: "B" });
    expect(contentEqual(a, b)).toBe(false);
  });

  it("returns false when body differs", () => {
    const a = makePost({ body: "old" });
    const b = makePost({ body: "new" });
    expect(contentEqual(a, b)).toBe(false);
  });

  it("returns false when tags differ", () => {
    const a = makePost({ tags: ["a"] });
    const b = makePost({ tags: ["b"] });
    expect(contentEqual(a, b)).toBe(false);
  });

  it("ignores metadata fields (id, dirty, projectId, dateCreated, dateUpdated)", () => {
    const a = makePost({
      id: "a",
      dirty: 1,
      projectId: "x",
    });
    const b = makePost({
      id: "b",
      dirty: 0,
      projectId: "y",
    });
    expect(contentEqual(a, b)).toBe(true);
  });

  it("returns false when slug differs", () => {
    const a = makePost({ slug: "slug-a" });
    const b = makePost({ slug: "slug-b" });
    expect(contentEqual(a, b)).toBe(false);
  });

  it("returns false when draft status differs", () => {
    const a = makePost({ draft: true });
    const b = makePost({ draft: false });
    expect(contentEqual(a, b)).toBe(false);
  });

  it("returns false when extra fields differ", () => {
    const a = makePost({ extra: { custom: "x" } });
    const b = makePost({ extra: { custom: "y" } });
    expect(contentEqual(a, b)).toBe(false);
  });

  it("round-trip: tagsInput normalize is stable for same tags", () => {
    const post = makePost({ tags: ["tag1", "tag2"] });
    const normalized = normalizePost(post, "tag1, tag2");
    expect(normalized.tags).toEqual(["tag1", "tag2"]);
    expect(post.tags).toEqual(["tag1", "tag2"]);
  });
});

describe("createDebouncedSaver", () => {
  let params: ReturnType<typeof makeParams>;
  let dbSavePost: ReturnType<typeof vi.fn>;

  function makeParams() {
    let workingPost: IPostRecord | null = makePost();
    let tagsInput = "tag1, tag2";

    return {
      projectId: "proj-1",
      getWorkingPost: () => workingPost,
      getTagsInput: () => tagsInput,
      onSave: vi.fn(),
      onError: vi.fn(),
      setWorkingPost: (p: IPostRecord | null) => {
        workingPost = p;
      },
      setTagsInput: (s: string) => {
        tagsInput = s;
      },
    };
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    const db = await import("$lib/db");
    dbSavePost = db.dbSavePost as unknown as ReturnType<typeof vi.fn>;
    // Re-assert default behavior in case a prior test overrode it.
    mockSavePost.mockReset();
    mockSavePost.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("writes unconditionally on schedule (no gitBaseline → dirty=1)", async () => {
    params = makeParams();
    const saver = new DebouncedSaver(params);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(dbSavePost).toHaveBeenCalledTimes(1);
    expect(params.onSave).toHaveBeenCalledTimes(1);
    const saved = dbSavePost.mock.calls[0][0] as IPostRecord;
    expect(saved.dirty).toBe(1);
  });

  it("saves after debounce when content differs", async () => {
    params = makeParams();
    params.setWorkingPost(makePost({ title: "Changed Title" }));
    const saver = new DebouncedSaver(params);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(500);

    expect(dbSavePost).toHaveBeenCalledTimes(1);
    expect(params.onSave).toHaveBeenCalledTimes(1);

    const saved = dbSavePost.mock.calls[0][0] as IPostRecord;
    expect(saved.title).toBe("Changed Title");
    expect(saved.dirty).toBe(1);
  });

  it("debounces: multiple rapid calls only save once", async () => {
    params = makeParams();
    params.setWorkingPost(makePost({ title: "First" }));
    const saver = new DebouncedSaver(params);

    saver.schedule(); // t=0, fires at t=50
    await vi.advanceTimersByTimeAsync(40); // t=40, timer hasn't fired yet
    params.setWorkingPost(makePost({ title: "Second" }));
    saver.schedule(); // timer reset, now fires at t=90
    await vi.advanceTimersByTimeAsync(20); // t=60, still within debounce
    params.setWorkingPost(makePost({ title: "Third" }));
    saver.schedule(); // timer reset, now fires at t=110

    // t=100, nothing should have fired yet
    await vi.advanceTimersByTimeAsync(40); // t=100
    expect(dbSavePost).not.toHaveBeenCalled();

    // 50ms after last schedule at t=110 → should fire at t=110
    await vi.advanceTimersByTimeAsync(20); // t=120
    expect(dbSavePost).toHaveBeenCalledTimes(1);
    expect((dbSavePost.mock.calls[0][0] as IPostRecord).title).toBe("Third");
  });

  it("flush saves immediately without waiting for debounce", async () => {
    params = makeParams();
    params.setWorkingPost(makePost({ title: "Changed" }));
    const saver = new DebouncedSaver(params);

    await saver.flush();

    expect(dbSavePost).toHaveBeenCalledTimes(1);
  });

  it("sets dirty=false when content reverts to gitBaseline", async () => {
    params = makeParams();
    params.setWorkingPost(makePost({ title: "Interim Title" }));
    const saver = new DebouncedSaver({ ...params, gitBaseline: makePost() });

    // First save: content differs from baseline → dirty=1
    await saver.flush();
    expect(dbSavePost).toHaveBeenCalledTimes(1);
    let saved = dbSavePost.mock.calls[0][0] as IPostRecord;
    expect(saved.title).toBe("Interim Title");
    expect(saved.dirty).toBe(1);

    // Now revert back to baseline content
    dbSavePost.mockClear();
    params.onSave.mockClear();
    params.setWorkingPost(makePost({ title: "Hello World" }));

    await saver.flush();
    expect(dbSavePost).toHaveBeenCalledTimes(1);
    saved = dbSavePost.mock.calls[0][0] as IPostRecord;
    expect(saved.title).toBe("Hello World");
    expect(saved.dirty).toBe(0);
  });

  it("calls onError when dbSavePost fails", async () => {
    params = makeParams();
    params.setWorkingPost(makePost({ title: "Changed" }));
    dbSavePost.mockRejectedValue(new Error("IDB error"));
    const saver = new DebouncedSaver(params);

    await saver.flush();

    expect(params.onError).toHaveBeenCalledWith("IDB error");
  });

  it("updateBaseline(syncedPost) allows revert to synced state to be detected as clean", async () => {
    params = makeParams();
    const gitOriginal = makePost({ title: "Original" });
    params.setWorkingPost(makePost({ title: "Edited" }));
    const saver = new DebouncedSaver({ ...params, gitBaseline: gitOriginal });

    // First save: differs from baseline → dirty
    await saver.flush();
    expect(dbSavePost).toHaveBeenCalledTimes(1);
    let saved = dbSavePost.mock.calls[0][0] as IPostRecord;
    expect(saved.title).toBe("Edited");
    expect(saved.dirty).toBe(1);

    // Simulate sync to git: update baseline with the actual synced post
    dbSavePost.mockClear();
    params.onSave.mockClear();
    const syncedPost: IPostRecord = {
      ...makePost({ title: "Edited" }),
      dirty: 0,
    };
    saver.updateBaseline(syncedPost);

    // Revert to synced state (Edited)
    // Should be clean because baseline now matches
    dbSavePost.mockClear();
    params.onSave.mockClear();
    params.setWorkingPost(makePost({ title: "Edited" }));
    await saver.flush();
    expect(dbSavePost).toHaveBeenCalledTimes(1);
    saved = dbSavePost.mock.calls[0][0] as IPostRecord;
    expect(saved.title).toBe("Edited");
    expect(saved.dirty).toBe(0);
  });

  it("updateBaseline uses the provided post as baseline, not the working post", async () => {
    params = makeParams();
    const saver = new DebouncedSaver(params); // no gitBaseline → syncBaseline = null

    // Working post has 'Edited', but the synced post has different content
    params.setWorkingPost(makePost({ title: "Edited" }));
    const syncedPost: IPostRecord = {
      ...makePost({ title: "SyncedVersion" }),
      dirty: 0,
    };
    saver.updateBaseline(syncedPost);

    // Save 'Edited' — should be dirty because baseline has 'SyncedVersion'
    await saver.flush();
    expect(dbSavePost).toHaveBeenCalledTimes(1);
    const saved = dbSavePost.mock.calls[0][0] as IPostRecord;
    expect(saved.title).toBe("Edited");
    expect(saved.dirty).toBe(1);

    // Revert to what was actually synced ('SyncedVersion') — should be clean
    dbSavePost.mockClear();
    params.onSave.mockClear();
    params.setWorkingPost(makePost({ title: "SyncedVersion" }));
    await saver.flush();
    expect(dbSavePost).toHaveBeenCalledTimes(1);
    const reverted = dbSavePost.mock.calls[0][0] as IPostRecord;
    expect(reverted.title).toBe("SyncedVersion");
    expect(reverted.dirty).toBe(0);
  });

  it("cancel prevents pending debounce from firing", async () => {
    params = makeParams();
    params.setWorkingPost(makePost({ title: "Changed" }));
    const saver = new DebouncedSaver(params);

    saver.schedule();
    saver.cancel();

    await vi.advanceTimersByTimeAsync(600);
    expect(dbSavePost).not.toHaveBeenCalled();
  });

  it("aborted save (signal.aborted after dbSavePost resolves) skips onSave", async () => {
    params = makeParams();
    params.setWorkingPost(makePost({ title: "First" }));
    const saver = new DebouncedSaver(params);

    // Hold AC1's #write at the `await dbSavePost(...)` suspension point.
    let resolveFirstSave!: () => void;
    const firstSavePromise = new Promise<void>((r) => {
      resolveFirstSave = r;
    });
    mockSavePost.mockImplementationOnce(() => firstSavePromise);

    saver.schedule();
    await vi.advanceTimersByTimeAsync(50);
    // AC1: #doSave created saved = { ...normalized "First", dirty: 1 } and
    //      awaits the deferred dbSavePost.

    // Now switch the working post to "Second" and flush. flush() aborts AC1 and
    // starts AC2 with the new content.
    params.setWorkingPost(makePost({ title: "Second" }));
    const flushPromise = saver.flush();
    // AC2: #doSave with "Second" awaits the default mockSavePost (resolves).

    // Resolve AC1's pending dbSavePost. AC1's signal is aborted → skip onSave.
    resolveFirstSave();
    await flushPromise;

    // Both called dbSavePost. Only AC2's onSave fires.
    expect(params.onSave).toHaveBeenCalledTimes(1);
    expect(params.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Second" }),
    );
    const lastSave = dbSavePost.mock.calls.at(-1)![0] as IPostRecord;
    expect(lastSave.title).toBe("Second");
  });
});
