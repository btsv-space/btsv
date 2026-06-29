import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Syncer } from "$lib/sync/syncer";
import type { IPostRecord, TSyncType, TProjectEntry } from "$lib/shared/types";
import type { ISyncAdapter } from "$lib/shared/types";

const {
  mockGetDirtyPosts,
  mockSavePost,
  mockSaveProject,
  mockDeletePost,
  mockGetPost,
  mockSerializeMdx,
  mockComputeSaveDates,
  mockParseMdx,
  mockDecryptToken,
  mockBytesFromApi,
  mockGetSecret,
  mockGetDEK,
  mockEnsureGitToken,
  mockAdapterCommitAndPush,
  mockAdapterCheckRemote,
  mockAdapterPull,
  mockAdapterInitialPull,
  mockAdapterMergeToMain,
  mockCreateSyncAdapter,
  mockPostFileExists,
  mockDeletePostFile,
} = vi.hoisted(() => ({
  mockGetDirtyPosts: vi.fn(),
  mockSavePost: vi.fn(),
  mockSaveProject: vi.fn(),
  mockDeletePost: vi.fn(),
  mockGetPost: vi.fn(),
  mockSerializeMdx: vi.fn(),
  mockComputeSaveDates: vi.fn(),
  mockParseMdx: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockBytesFromApi: vi.fn(),
  mockGetSecret: vi.fn(),
  mockGetDEK: vi.fn(),
  mockEnsureGitToken: vi.fn().mockResolvedValue("decrypted-token"),
  mockAdapterCommitAndPush: vi.fn(),
  mockAdapterCheckRemote: vi.fn(),
  mockAdapterPull: vi.fn(),
  mockAdapterInitialPull: vi.fn(),
  mockAdapterMergeToMain: vi.fn(),
  mockCreateSyncAdapter: vi.fn(),
  mockPostFileExists: vi.fn().mockResolvedValue(true),
  mockDeletePostFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/db", () => ({
  dbGetDirtyPosts: mockGetDirtyPosts,
  dbSavePost: mockSavePost,
  dbDeletePost: mockDeletePost,
  dbGetPost: mockGetPost,
  dbSaveProject: mockSaveProject,
}));

vi.mock("$lib/fs", () => ({
  postFileExists: (...args: unknown[]) => mockPostFileExists(...args),
  deletePostFile: (...args: unknown[]) => mockDeletePostFile(...args),
}));

vi.mock("$lib/parser", () => ({
  serializeMdx: mockSerializeMdx,
  computeSaveDates: mockComputeSaveDates,
  parseMdx: mockParseMdx,
}));

vi.mock("$lib/crypto", () => ({
  decryptToken: mockDecryptToken,
  bytesFromApi: mockBytesFromApi,
}));

vi.mock("$lib/api", () => ({
  api: {
    projects: {
      getSecret: mockGetSecret,
    },
  },
}));

vi.mock("$lib/stores/auth.svelte", () => ({
  getDEK: mockGetDEK,
  currentUser: { value: { username: "testuser" } },
  ensureGitToken: mockEnsureGitToken,
}));

vi.mock("$lib/sync/adapter", () => ({
  createSyncAdapter: mockCreateSyncAdapter,
}));

function makeDirtyPost(overrides: Partial<IPostRecord> = {}): IPostRecord {
  return {
    projectId: "proj-1",
    id: "20260608-14302250",
    slug: "test-post",
    title: "Test Post",
    dateCreated: "2026-05-01",
    dateUpdated: "2026-06-01",
    description: "",
    tags: [],
    draft: false,
    body: "Some content",
    extra: {},
    dirty: true,
    ...overrides,
  };
}

function makeConfig(getProjects?: () => TProjectEntry[]) {
  const onSyncStatus = vi.fn();
  return {
    getPrefs: () => ({ syncType: "git" as TSyncType, proxyUrl: "" }),
    getProjects: getProjects ?? (() => []),
    onSyncStatus,
  };
}

function makeMockAdapter(): ISyncAdapter {
  return {
    checkRemote: mockAdapterCheckRemote,
    pull: mockAdapterPull,
    initialPull: mockAdapterInitialPull,
    mergeToMain: mockAdapterMergeToMain,
    commitAndPush: mockAdapterCommitAndPush,
    commitDeletion: vi.fn(),
  };
}

function makeMockProjectEntry(): TProjectEntry {
  return {
    id: "proj-1",
    name: "Test Project",
    repoUrl: "https://github.com/test/test.git",
    status: "ready" as const,
    error: "",
    syncType: "git" as TSyncType,
  };
}

describe("Syncer", () => {
  let syncer: Syncer;
  let config: ReturnType<typeof makeConfig>;

  beforeEach(() => {
    vi.useFakeTimers();
    config = makeConfig(() => [makeMockProjectEntry()]);
    syncer = new Syncer(config);

    (globalThis as Record<string, unknown>).document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: "visible",
    };
    (globalThis as Record<string, unknown>).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockCreateSyncAdapter.mockReset();

    mockGetDirtyPosts.mockReset();
    mockSavePost.mockReset();
    mockSaveProject.mockReset();
    mockDeletePost.mockReset();
    mockGetPost.mockReset();
    mockSerializeMdx.mockReset();
    mockComputeSaveDates.mockReset();
    mockDecryptToken.mockReset();
    mockBytesFromApi.mockReset();
    mockGetSecret.mockReset();
    mockGetDEK.mockReset();
    mockAdapterCommitAndPush.mockReset();
    mockAdapterCheckRemote.mockReset();
    mockAdapterPull.mockReset();
    mockAdapterInitialPull.mockReset();
    mockAdapterMergeToMain.mockReset();
    mockEnsureGitToken.mockReset();
    mockPostFileExists.mockReset();
    mockDeletePostFile.mockReset();
    mockPostFileExists.mockResolvedValue(true);
    mockDeletePostFile.mockResolvedValue(undefined);

    mockSerializeMdx.mockImplementation(
      (post: IPostRecord) => `serialized-${post.id}`,
    );
    mockComputeSaveDates.mockReturnValue({
      dateUpdated: "2026-06-08",
      datePublished: "2026-06-08",
    });
    mockAdapterCommitAndPush.mockResolvedValue("sha-abc123");
    mockAdapterCheckRemote.mockResolvedValue({ hasChanges: true });
    mockAdapterPull.mockResolvedValue([]);
    mockAdapterInitialPull.mockResolvedValue({
      entries: [],
      lastCommitTime: undefined,
    });
    mockEnsureGitToken.mockResolvedValue("decrypted-token");
    mockDecryptToken.mockResolvedValue("decrypted-token");
    mockBytesFromApi.mockImplementation(
      (s: string) => new Uint8Array(s.length),
    );
    mockGetSecret.mockResolvedValue({ ciphertext: "abc", iv: "def" });
    mockGetDEK.mockReturnValue(new Uint8Array(32));
    mockCreateSyncAdapter.mockResolvedValue(makeMockAdapter());

    mockParseMdx.mockImplementation((_content: string, id: string) => ({
      id,
      slug: `slug-${id}`,
      title: `Title ${id}`,
      dateCreated: "2026-06-01",
      dateUpdated: "2026-06-01",
      datePublished: "2026-06-01",
      description: "",
      tags: [],
      draft: false,
      body: "content",
      extra: {},
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("hooks", () => {
    it("fires hook with correct params after sync", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      const hook = vi.fn();
      syncer.addAfterSyncHook(hook);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(hook).toHaveBeenCalledTimes(1);
      const [pid, id, syncedPost] = hook.mock.calls[0];
      expect(pid).toBe("proj-1");
      expect(id).toBe(post.id);
      expect(syncedPost).toMatchObject({
        id: post.id,
        projectId: "proj-1",
        dirty: false,
      });
    });

    it("does not fire hook when no dirty posts", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);
      const hook = vi.fn();
      syncer.addAfterSyncHook(hook);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(hook).not.toHaveBeenCalled();
    });

    it("multiple hooks all fire", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      const hook1 = vi.fn();
      const hook2 = vi.fn();
      syncer.addAfterSyncHook(hook1);
      syncer.addAfterSyncHook(hook2);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
    });

    it("unregistered hook does not fire", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      const hook = vi.fn();
      const unregister = syncer.addAfterSyncHook(hook);
      unregister();

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(hook).not.toHaveBeenCalled();
    });

    it("hook fires for each synced post", async () => {
      mockGetDirtyPosts.mockResolvedValue([
        makeDirtyPost({ id: "post-1" }),
        makeDirtyPost({ id: "post-2" }),
      ]);
      const hook = vi.fn();
      syncer.addAfterSyncHook(hook);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(hook).toHaveBeenCalledTimes(2);
      expect(hook.mock.calls[0][1]).toBe("post-1");
      expect(hook.mock.calls[1][1]).toBe("post-2");
    });

    it("hook is not called when sync fails for a post", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitAndPush.mockRejectedValue(new Error("push failed"));
      const hook = vi.fn();
      syncer.addAfterSyncHook(hook);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(hook).not.toHaveBeenCalled();
    });
  });

  describe("push", () => {
    it("returns true when no dirty posts", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(config.onSyncStatus).toHaveBeenCalledWith("proj-1", {
        state: "synced",
        errorMsg: "",
      });
      expect(mockSavePost).not.toHaveBeenCalled();
    });

    it("syncs each dirty post sequentially", async () => {
      mockGetDirtyPosts.mockResolvedValue([
        makeDirtyPost({ id: "post-1" }),
        makeDirtyPost({ id: "post-2" }),
      ]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockSerializeMdx).toHaveBeenCalledTimes(2);
      expect(mockAdapterCommitAndPush).toHaveBeenCalledTimes(2);
      expect(mockSavePost).toHaveBeenCalledTimes(2);
    });

    it("marks post clean after successful sync", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(post.dirty).toBe(false);
      expect(mockSavePost).toHaveBeenCalledWith(post);
    });

    it("transitions sync status: syncing-push → synced", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(config.onSyncStatus).toHaveBeenCalledTimes(2);
      expect(config.onSyncStatus).toHaveBeenNthCalledWith(1, "proj-1", {
        state: "syncing-push",
        errorMsg: "",
      });
      expect(config.onSyncStatus).toHaveBeenNthCalledWith(2, "proj-1", {
        state: "synced",
        errorMsg: "",
      });
    });

    it("sets error status when commit fails", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitAndPush.mockRejectedValue(new Error("network error"));

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(config.onSyncStatus).toHaveBeenCalledWith("proj-1", {
        state: "error",
        errorMsg: "network error",
      });
    });

    it("continues to next post when one fails", async () => {
      const post1 = makeDirtyPost({ id: "post-1" });
      const post2 = makeDirtyPost({ id: "post-2" });
      mockGetDirtyPosts.mockResolvedValue([post1, post2]);
      mockAdapterCommitAndPush
        .mockRejectedValueOnce(new Error("first failed"))
        .mockResolvedValueOnce("sha-2");

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterCommitAndPush).toHaveBeenCalledTimes(2);
      expect(mockSavePost).toHaveBeenCalledTimes(1);
    });

    it("calls mergeToMain when a published post is synced", async () => {
      const post = makeDirtyPost({ draft: false });
      mockGetDirtyPosts.mockResolvedValue([post]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterMergeToMain).toHaveBeenCalledTimes(1);
      expect(mockAdapterMergeToMain).toHaveBeenCalledWith(
        "proj-1",
        "decrypted-token",
      );
    });

    it("does not call mergeToMain when only drafts are synced", async () => {
      const post = makeDirtyPost({ draft: true });
      mockGetDirtyPosts.mockResolvedValue([post]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterMergeToMain).not.toHaveBeenCalled();
    });

    it("calls mergeToMain once when multiple published posts are synced", async () => {
      mockGetDirtyPosts.mockResolvedValue([
        makeDirtyPost({ id: "post-1", draft: false }),
        makeDirtyPost({ id: "post-2", draft: false }),
      ]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterMergeToMain).toHaveBeenCalledTimes(1);
    });

    it("does not call mergeToMain when sync fails", async () => {
      const post = makeDirtyPost({ draft: false });
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitAndPush.mockRejectedValue(new Error("push failed"));

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterMergeToMain).not.toHaveBeenCalled();
    });

    it("generates correct commit message format", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterCommitAndPush).toHaveBeenCalledWith(
        "proj-1",
        post.id,
        expect.stringContaining("serialized-"),
        expect.stringContaining("btsv-testuser-proj-1-20260608-14302250-save-"),
        "decrypted-token",
      );
    });
  });

  describe("pull serialization", () => {
    it("serializes concurrent pull calls for the same project", async () => {
      let pullResolve: () => void;
      const pullPromise = new Promise<void>((r) => {
        pullResolve = r;
      });
      const order: string[] = [];

      mockAdapterCheckRemote.mockImplementation(async () => {
        order.push("checkRemote");
        await pullPromise;
        return { hasChanges: false };
      });

      const first = syncer.pull(makeMockProjectEntry());
      const second = syncer.pull(makeMockProjectEntry());

      await vi.advanceTimersByTimeAsync(0);
      expect(order).toEqual(["checkRemote"]);

      pullResolve!();
      await vi.advanceTimersByTimeAsync(0);
      expect(order).toEqual(["checkRemote", "checkRemote"]);

      await first;
      await second;
    });
  });

  describe("parseAndSave guard", () => {
    it("does not overwrite locally-dirty post during pull", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);
      mockAdapterPull.mockResolvedValue([
        { id: "post-1", content: "# Old remote content" },
      ]);
      // Local post is dirty — should be preserved
      const localDirty = makeDirtyPost({ id: "post-1", dirty: true });
      mockGetPost.mockResolvedValue(localDirty);

      const result = await syncer.pull(makeMockProjectEntry());

      // dbSavePost should NOT be called for the remote version
      expect(mockSavePost).not.toHaveBeenCalled();
      // Returned records should include the local dirty post
      expect(result).toHaveLength(1);
      expect(result[0].dirty).toBe(true);
    });

    it("stores remote version when local post is clean", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);
      mockAdapterPull.mockResolvedValue([
        { id: "post-1", content: "# Remote content" },
      ]);
      const localClean = makeDirtyPost({ id: "post-1", dirty: false });
      mockGetPost.mockResolvedValue(localClean);

      const result = await syncer.pull(makeMockProjectEntry());

      expect(mockSavePost).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].dirty).toBe(false);
    });
  });

  describe("pulled deletions (Phase 2)", () => {
    it("deletes IDB row + lightning-fs mirror and fires hook when adapter returns deleted entry", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);
      mockAdapterCheckRemote.mockResolvedValue({
        hasChanges: true,
        headSha: "sha-new",
        lastCommitTime: 1700000000000,
      });
      mockAdapterPull.mockResolvedValue([
        { id: "post-deleted", deleted: true },
      ]);
      mockGetPost.mockResolvedValue(makeDirtyPost({ id: "post-deleted" }));

      const hook = vi.fn();
      syncer.addAfterSyncHook(hook);

      const result = await syncer.pull(makeMockProjectEntry());

      expect(mockDeletePost).toHaveBeenCalledTimes(1);
      expect(mockDeletePost).toHaveBeenCalledWith("proj-1", "post-deleted");
      expect(mockDeletePostFile).toHaveBeenCalledTimes(1);
      expect(mockDeletePostFile).toHaveBeenCalledWith("proj-1", "post-deleted");
      expect(mockSavePost).not.toHaveBeenCalled();
      // Hook fires twice: once for the deleted post, once at the end of pull.
      expect(hook).toHaveBeenCalledTimes(2);
      expect(hook).toHaveBeenNthCalledWith(
        1,
        "proj-1",
        "post-deleted",
        undefined,
      );
      expect(hook).toHaveBeenNthCalledWith(
        2,
        "proj-1",
        undefined,
        undefined,
        expect.any(Number),
      );
      expect(result).toEqual([]);
    });

    it("preserves locally-dirty row but still deletes row that is returned as deleted", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);
      mockAdapterCheckRemote.mockResolvedValue({ hasChanges: true });
      mockAdapterPull.mockResolvedValue([
        { id: "kept", content: "# New content" },
        { id: "gone", deleted: true },
      ]);
      const localKeptDirty = makeDirtyPost({ id: "kept", dirty: true });
      mockGetPost.mockResolvedValueOnce(localKeptDirty);

      const result = await syncer.pull(makeMockProjectEntry());

      expect(mockSavePost).not.toHaveBeenCalled();
      expect(mockDeletePost).toHaveBeenCalledTimes(1);
      expect(mockDeletePost).toHaveBeenCalledWith("proj-1", "gone");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("kept");
      expect(result[0].dirty).toBe(true);
    });

    it("passes storedRemoteSha + headSha from checkRemote into adapter.pull", async () => {
      mockAdapterCheckRemote.mockResolvedValue({
        hasChanges: true,
        headSha: "sha-head",
      });
      mockAdapterPull.mockResolvedValue([]);
      mockGetPost.mockResolvedValue(undefined);

      const project = makeMockProjectEntry();
      project.storedRemoteSha = "sha-stored";

      await syncer.pull(project);

      expect(mockAdapterPull).toHaveBeenCalledWith(
        "proj-1",
        "decrypted-token",
        "sha-stored",
        "sha-head",
      );
    });

    it("ignores deletePostFile error during pulled-delete (file may not exist locally)", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);
      mockAdapterCheckRemote.mockResolvedValue({ hasChanges: true });
      mockAdapterPull.mockResolvedValue([{ id: "ghost", deleted: true }]);
      mockDeletePostFile.mockRejectedValue(new Error("ENOENT"));
      mockGetPost.mockResolvedValue(undefined);

      await expect(syncer.pull(makeMockProjectEntry())).resolves.toEqual([]);
      expect(mockDeletePost).toHaveBeenCalledTimes(1);
    });
  });

  describe("pull", () => {
    it("skips pull when checkRemote returns false", async () => {
      mockAdapterCheckRemote.mockResolvedValue({ hasChanges: false });

      const result = await syncer.pull(makeMockProjectEntry());

      expect(mockAdapterCheckRemote).toHaveBeenCalledWith(
        "proj-1",
        "decrypted-token",
        undefined,
      );
      expect(mockAdapterPull).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("proceeds with pull when checkRemote returns true", async () => {
      mockAdapterCheckRemote.mockResolvedValue({ hasChanges: true });
      mockAdapterPull.mockResolvedValue([{ id: "post-1", content: "# Hello" }]);

      const result = await syncer.pull(makeMockProjectEntry());

      expect(mockAdapterCheckRemote).toHaveBeenCalledWith(
        "proj-1",
        "decrypted-token",
        undefined,
      );
      expect(mockAdapterPull).toHaveBeenCalledWith(
        "proj-1",
        "decrypted-token",
        undefined,
        undefined,
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("post-1");
    });

    it("with tokenOverride always proceeds without checkRemote", async () => {
      mockAdapterPull.mockResolvedValue([{ id: "post-1", content: "# Hello" }]);

      const result = await syncer.pull(
        makeMockProjectEntry(),
        "override-token",
      );

      expect(mockAdapterCheckRemote).not.toHaveBeenCalled();
      expect(mockAdapterPull).toHaveBeenCalledWith(
        "proj-1",
        "override-token",
        undefined,
        undefined,
      );
      expect(result).toHaveLength(1);
    });

    it("returns empty when no git token available", async () => {
      mockEnsureGitToken.mockResolvedValue("");

      const result = await syncer.pull(makeMockProjectEntry());

      expect(mockAdapterCheckRemote).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe("storedRemoteSha persistence", () => {
    it("persists checkRemote headSha to project + IDB after a successful pull", async () => {
      mockAdapterCheckRemote.mockResolvedValue({
        hasChanges: true,
        headSha: "sha-tip",
      });
      mockAdapterPull.mockResolvedValue([]);
      mockGetPost.mockResolvedValue(undefined);

      const project = makeMockProjectEntry();
      expect(project.storedRemoteSha).toBeUndefined();

      await syncer.pull(project);

      expect(project.storedRemoteSha).toBe("sha-tip");
      expect(mockSaveProject).toHaveBeenCalledWith(project);
    });

    it("does not call adapter.pull or persist when remote hasn't moved", async () => {
      mockAdapterCheckRemote.mockResolvedValue({
        hasChanges: false,
        headSha: "sha-tip",
      });

      const project = makeMockProjectEntry();
      project.storedRemoteSha = "sha-tip";

      await syncer.pull(project);

      expect(mockAdapterPull).not.toHaveBeenCalled();
      expect(project.storedRemoteSha).toBe("sha-tip");
      expect(mockSaveProject).not.toHaveBeenCalled();
    });

    it("passes stored storedRemoteSha to checkRemote", async () => {
      mockAdapterCheckRemote.mockResolvedValue({
        hasChanges: false,
        headSha: "x",
      });

      const project = makeMockProjectEntry();
      project.storedRemoteSha = "stored-sha";

      await syncer.pull(project);

      expect(mockAdapterCheckRemote).toHaveBeenCalledWith(
        "proj-1",
        "decrypted-token",
        "stored-sha",
      );
    });

    it("persists headSha to project + IDB after initialPull", async () => {
      mockAdapterInitialPull.mockResolvedValue({
        entries: [],
        lastCommitTime: undefined,
        headSha: "sha-init",
      });

      const project = makeMockProjectEntry();
      await syncer.initialPull(project);

      expect(project.storedRemoteSha).toBe("sha-init");
      expect(mockSaveProject).toHaveBeenCalledWith(project);
    });

    it("persists pushed commit sha to project + IDB after push", async () => {
      const post = makeDirtyPost({ draft: false });
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitAndPush.mockResolvedValue("sha-push");

      const project = makeMockProjectEntry();
      await syncer.push(project);

      expect(project.storedRemoteSha).toBe("sha-push");
      expect(mockSaveProject).toHaveBeenCalledWith(project);
    });

    it("does not persist storedRemoteSha when push commits nothing", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitAndPush.mockResolvedValue(null);

      const project = makeMockProjectEntry();
      project.storedRemoteSha = "unchanged";
      await syncer.push(project);

      expect(project.storedRemoteSha).toBe("unchanged");
      expect(mockSaveProject).not.toHaveBeenCalled();
    });
  });

  describe("start / stop", () => {
    afterEach(() => {
      delete (globalThis as Record<string, unknown>).document;
      delete (globalThis as Record<string, unknown>).window;
    });

    it("calls push on start via syncAllDirty", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterCommitAndPush).toHaveBeenCalledTimes(1);
    });

    it("sets up interval when started", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockGetDirtyPosts).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockGetDirtyPosts).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockGetDirtyPosts).toHaveBeenCalledTimes(3);
    });

    it("stop clears interval", async () => {
      const callsBeforeStart = mockGetDirtyPosts.mock.calls.length;

      mockGetDirtyPosts.mockResolvedValue([]);
      syncer.start();
      await vi.advanceTimersByTimeAsync(0);
      syncer.stop();

      await vi.advanceTimersByTimeAsync(120_000);
      const callsAfterStop = mockGetDirtyPosts.mock.calls.length;
      expect(callsAfterStop).toBe(callsBeforeStart + 1);
    });

    it("stop removes visibilitychange listener", () => {
      syncer.start();
      syncer.stop();

      expect(
        (globalThis as unknown as { document: typeof document }).document
          .removeEventListener,
      ).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    });

    it("second start is a no-op (started guard)", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(mockGetDirtyPosts).toHaveBeenCalledTimes(2);
    });
  });
});
