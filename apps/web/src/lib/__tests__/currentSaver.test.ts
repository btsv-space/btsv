import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IDebouncedSaverConfig, IPostRecord } from "$lib/shared/types";

const mockCancel = vi.fn();

class FakeSaver {
  cancel = mockCancel;
}

vi.mock("$lib/saver", () => ({
  DebouncedSaver: FakeSaver,
}));

vi.mock("$lib/db", () => ({
  dbSavePost: vi.fn(),
}));

function fakePost(overrides: Partial<IPostRecord> = {}): IPostRecord {
  const defaults = {
    projectId: "proj-1",
    id: "post-1",
    slug: "test-post",
    description: "",
    tags: [] as string[],
    draft: false,
    body: "",
    extra: {},
    dirty: 0 as 0 | 1,
    title: "",
    dateCreated: "",
    dateUpdated: "",
  };
  return { ...defaults, ...overrides } as IPostRecord;
}

function makeConfig(overrides: Partial<IDebouncedSaverConfig> = {}): IDebouncedSaverConfig {
  return {
    projectId: "proj-1",
    getWorkingPost: () => fakePost(),
    getTagsInput: () => "",
    onSave: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

// Import after mocks are set up.
let currentSaver: typeof import("$lib/stores/currentSaver");

describe("currentSaver", () => {
  beforeEach(async () => {
    vi.resetModules();
    // Re-import to get a fresh module state (the singleton is module-level).
    currentSaver = await import("$lib/stores/currentSaver");
  });

  it("createCurrentSaver creates and registers the saver", () => {
    const config = makeConfig();
    const saver = currentSaver.createCurrentSaver(config);

    const registered = currentSaver.getCurrentSaver();
    expect(registered).not.toBeNull();
    expect(registered!.projectId).toBe("proj-1");
    expect(registered!.postId).toBe("post-1");
    // The returned object includes the saver at runtime (type masks it).
    expect((registered as Record<string, unknown>).saver).toBe(saver);
  });

  it("destroyCurrentSaver cancels the saver and nulls the singleton", async () => {
    currentSaver.createCurrentSaver(makeConfig());
    expect(currentSaver.getCurrentSaver()).not.toBeNull();

    await currentSaver.destroyCurrentSaver();
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(currentSaver.getCurrentSaver()).toBeNull();
  });

  it("destroyCurrentSaver is a no-op when no saver is active", async () => {
    await expect(currentSaver.destroyCurrentSaver()).resolves.toBeUndefined();
  });

  it("createCurrentSaver throws when config has no workingPost", () => {
    const config = makeConfig({ getWorkingPost: () => null });
    expect(() => currentSaver.createCurrentSaver(config)).toThrow(
      "createCurrentSaver failed",
    );
  });

  it("getCurrentSaver returns null before any saver is created", () => {
    expect(currentSaver.getCurrentSaver()).toBeNull();
  });
});
