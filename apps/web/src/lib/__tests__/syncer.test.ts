import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Syncer } from "$lib/sync/syncer";
import {
  ESyncState,
  type IPostRecord,
  type TSyncType,
  type TProjectEntry,
} from "$lib/shared/types";
import type { ISyncAdapter } from "$lib/shared/types";

const {
  mockGetDirtyPosts,
  mockSavePost,
  mockSaveProject,
  mockDeletePost,
  mockGetPost,
  mockSerializeMdx,
  mockParseMdx,
  mockDecryptToken,
  mockBytesFromApi,
  mockGetSecret,
  mockGetDEK,
  mockEnsureGitToken,
  mockAdapterCommitAndPush,
  mockAdapterCommitDeletion,
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
  mockParseMdx: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockBytesFromApi: vi.fn(),
  mockGetSecret: vi.fn(),
  mockGetDEK: vi.fn(),
  mockEnsureGitToken: vi.fn().mockResolvedValue("decrypted-token"),
  mockAdapterCommitAndPush: vi.fn(),
  mockAdapterCommitDeletion: vi.fn(),
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
    page: false,
    body: "Some content",
    extra: {},
    dirty: 1,
    ...overrides,
  };
}

function makeConfig(getProjects?: () => TProjectEntry[]) {
  const onSyncStatus = vi.fn();
  return {
    getPrefs: () => ({ syncType: "git" as TSyncType, proxyUrl: "" }),
    getProjects: getProjects ?? (() => []),
    onSyncStatus,
    // Defaults to "no editor open" — saver-closed push path semantics.
    isPostEditing: vi.fn().mockReturnValue(false),
  };
}

function makeMockAdapter(): ISyncAdapter {
  return {
    checkRemote: mockAdapterCheckRemote,
    pull: mockAdapterPull,
    initialPull: mockAdapterInitialPull,
    mergeToMain: mockAdapterMergeToMain,
    commitAndPush: mockAdapterCommitAndPush,
    commitDeletion: mockAdapterCommitDeletion,
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
    mockGetDirtyPosts.mockResolvedValue([]);
    mockSavePost.mockReset();
    mockSaveProject.mockReset();
    mockDeletePost.mockReset();
    mockGetPost.mockReset();
    mockSerializeMdx.mockReset();
    mockDecryptToken.mockReset();
    mockBytesFromApi.mockReset();
    mockGetSecret.mockReset();
    mockGetDEK.mockReset();
    mockAdapterCommitAndPush.mockReset();
    mockAdapterCommitDeletion.mockReset();
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
    mockAdapterCommitAndPush.mockResolvedValue("sha-abc123");
    mockAdapterCheckRemote.mockResolvedValue({ hasChanges: true });
    mockAdapterPull.mockResolvedValue([]);
    mockAdapterInitialPull.mockResolvedValue({
      postEntries: [],
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
    syncer.stop();
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
      // Hook receives the post as it now lives in IDB post-sync: same content
      // as the dirty original, but with dirty=0.
      expect(syncedPost).toMatchObject({
        id: post.id,
        projectId: "proj-1",
        slug: post.slug,
        title: post.title,
        body: post.body,
        dirty: 0,
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

      // Empty dirty list: syncer writes SYNCED state + dirtyOverride=false
      // (the empty-dirty early return knows dirty=0).
      expect(config.onSyncStatus).toHaveBeenCalledWith(
        "proj-1",
        {
          state: "synced",
          errorMsg: "",
        },
        false,
      );
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

      expect(mockSavePost).toHaveBeenCalledTimes(1);
      expect(mockSavePost).toHaveBeenCalledWith(
        expect.objectContaining({ id: post.id, dirty: 0 }),
      );
    });

    it("transitions sync status: syncing-push → synced", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValueOnce([post]).mockResolvedValueOnce([]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(config.onSyncStatus).toHaveBeenCalledTimes(2);
      expect(config.onSyncStatus).toHaveBeenNthCalledWith(
        1,
        "proj-1",
        {
          state: "syncing-push",
          errorMsg: "",
        },
        null,
      );
      expect(config.onSyncStatus).toHaveBeenNthCalledWith(
        2,
        "proj-1",
        {
          state: "synced",
          errorMsg: "",
        },
        null,
      );
    });

    it("sets error status when commit fails", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitAndPush.mockRejectedValue(new Error("network error"));

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(config.onSyncStatus).toHaveBeenCalledWith(
        "proj-1",
        {
          state: "error",
          errorMsg: "network error",
        },
        null,
      );
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
      // Only the successful iterate (post2) gets a dbSavePost writeback.
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

  describe("saver-aware push", () => {
    it("skips dbSavePost when isPostEditing reports editor open for the post", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      config.isPostEditing.mockReturnValue(true);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      // Pushed to git but IDB writeback was deferred to the saver.
      expect(mockAdapterCommitAndPush).toHaveBeenCalledTimes(1);
      expect(mockSavePost).not.toHaveBeenCalled();
    });

    it("writes dbSavePost with dirty=0 when saver-closed for the post", async () => {
      const post = makeDirtyPost();
      mockGetDirtyPosts.mockResolvedValue([post]);
      // Default isPostEditing returns false (saver-closed).

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterCommitAndPush).toHaveBeenCalledTimes(1);
      expect(mockSavePost).toHaveBeenCalledTimes(1);
      expect(mockSavePost).toHaveBeenCalledWith(
        expect.objectContaining({ id: post.id, dirty: 0 }),
      );
    });

    it("isPostEditing receives projectId + postId for each dirty post", async () => {
      mockGetDirtyPosts.mockResolvedValue([
        makeDirtyPost({ id: "post-a" }),
        makeDirtyPost({ id: "post-b" }),
      ]);
      config.isPostEditing.mockReturnValue(false);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(config.isPostEditing).toHaveBeenCalledTimes(2);
      expect(config.isPostEditing).toHaveBeenNthCalledWith(
        1,
        "proj-1",
        "post-a",
      );
      expect(config.isPostEditing).toHaveBeenNthCalledWith(
        2,
        "proj-1",
        "post-b",
      );
    });

    it("hook receives syncedPost with new dateUpdated from syncer", async () => {
      const post = makeDirtyPost({ dateUpdated: "2026-06-01" });
      mockGetDirtyPosts.mockResolvedValue([post]);
      const hook = vi.fn();
      syncer.addAfterSyncHook(hook);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(hook).toHaveBeenCalledTimes(1);
      const syncedPost = hook.mock.calls[0][2];
      // Syncer mutates post.dateUpdated = today() before serializing for git,
      // and the hook's syncedPost reflects post-mutation state.
      expect(syncedPost.dateUpdated).not.toBe("2026-06-01");
      expect(syncedPost.dirty).toBe(0);
    });
  });

  describe("push deletion branch", () => {
    it("calls commitDeletion instead of commitAndPush for deleted posts", async () => {
      const post = makeDirtyPost({ deleted: true });
      mockGetDirtyPosts.mockResolvedValue([post]);

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAdapterCommitAndPush).not.toHaveBeenCalled();
      expect(mockAdapterCommitDeletion).toHaveBeenCalledWith(
        "proj-1",
        post.id,
        expect.stringContaining("-delete-"),
        "decrypted-token",
      );
    });

    it("deletes from IDB after successful deletion push", async () => {
      const post = makeDirtyPost({ deleted: true });
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitDeletion.mockResolvedValue("sha-deleted");

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockDeletePost).toHaveBeenCalledWith("proj-1", post.id);
      expect(mockSavePost).not.toHaveBeenCalled();
    });

    it("keeps IDB entry when deletion push fails", async () => {
      const post = makeDirtyPost({ deleted: true });
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitDeletion.mockRejectedValue(new Error("push failed"));

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockDeletePost).not.toHaveBeenCalled();
      expect(mockSavePost).not.toHaveBeenCalled();
    });

    it("calls mergeToMain after deleting a published post", async () => {
      const post = makeDirtyPost({ deleted: true, draft: false });
      mockGetDirtyPosts.mockResolvedValue([post]);
      mockAdapterCommitDeletion.mockResolvedValue("sha-deleted");

      syncer.start();
      await vi.advanceTimersByTimeAsync(0);

      // Deletion commit was pushed to staging; merge staging→main includes it.
      expect(mockAdapterMergeToMain).toHaveBeenCalledWith(
        "proj-1",
        "decrypted-token",
      );
    });
  });

  describe("pull coalescing", () => {
    it("coalesces concurrent pull calls for the same project", async () => {
      let pullResolve: (value: { hasChanges: boolean }) => void;
      const pullPromise = new Promise<{ hasChanges: boolean }>((r) => {
        pullResolve = r;
      });
      const order: string[] = [];

      mockAdapterCheckRemote.mockImplementation(async () => {
        order.push("checkRemote");
        return pullPromise;
      });

      const first = syncer.pull(makeMockProjectEntry());
      const second = syncer.pull(makeMockProjectEntry());

      await vi.advanceTimersByTimeAsync(0);
      expect(order).toEqual(["checkRemote"]);

      pullResolve!({ hasChanges: false });
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult).toEqual([]);
      expect(secondResult).toBe(firstResult);
    });

    it("starts a fresh pull after the coalesced one resolves", async () => {
      mockAdapterCheckRemote.mockResolvedValue({ hasChanges: false });

      const first = await syncer.pull(makeMockProjectEntry());
      expect(mockAdapterCheckRemote).toHaveBeenCalledTimes(1);

      const second = await syncer.pull(makeMockProjectEntry());
      expect(mockAdapterCheckRemote).toHaveBeenCalledTimes(2);

      expect(first).toEqual([]);
      expect(second).toEqual([]);
    });
  });

  describe("parseAndSave guard", () => {
    it("does not overwrite locally-dirty post during pull", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);
      mockAdapterPull.mockResolvedValue([
        { id: "post-1", content: "# Old remote content" },
      ]);
      // Local post is dirty — should be preserved
      const localDirty = makeDirtyPost({ id: "post-1", dirty: 1 });
      mockGetPost.mockResolvedValue(localDirty);

      const result = await syncer.pull(makeMockProjectEntry());

      // dbSavePost should NOT be called for the remote version
      expect(mockSavePost).not.toHaveBeenCalled();
      // Returned records should include the local dirty post
      expect(result).toHaveLength(1);
      expect(result[0].dirty).toBe(1);
    });

    it("stores remote version when local post is clean", async () => {
      mockGetDirtyPosts.mockResolvedValue([]);
      mockAdapterPull.mockResolvedValue([
        { id: "post-1", content: "# Remote content" },
      ]);
      const localClean = makeDirtyPost({ id: "post-1", dirty: 0 });
      mockGetPost.mockResolvedValue(localClean);

      const result = await syncer.pull(makeMockProjectEntry());

      expect(mockSavePost).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].dirty).toBe(0);
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
      const localKeptDirty = makeDirtyPost({ id: "kept", dirty: 1 });
      mockGetPost.mockResolvedValueOnce(localKeptDirty);

      const result = await syncer.pull(makeMockProjectEntry());

      expect(mockSavePost).not.toHaveBeenCalled();
      expect(mockDeletePost).toHaveBeenCalledTimes(1);
      expect(mockDeletePost).toHaveBeenCalledWith("proj-1", "gone");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("kept");
      expect(result[0].dirty).toBe(1);
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

  describe("commitDeletion", () => {
    it("saves as pending deletion when no git token and file exists on disk", async () => {
      mockEnsureGitToken.mockResolvedValue(null);
      mockPostFileExists.mockResolvedValue(true);
      mockGetPost.mockResolvedValue(makeDirtyPost({ id: "post-1" }));

      await syncer.commitDeletion(makeMockProjectEntry(), "post-1");

      // OPFS file is deleted regardless
      expect(mockDeletePostFile).toHaveBeenCalledWith("proj-1", "post-1");
      // No token — saved as pending deletion for the push loop to handle
      expect(mockDeletePost).not.toHaveBeenCalled();
      expect(mockSavePost).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "post-1",
          dirty: 1,
          deleted: true,
        }),
      );
      // #ensureGitToken emits ERROR status itself when no token available.
      expect(config.onSyncStatus).toHaveBeenCalledWith(
        "proj-1",
        {
          state: ESyncState.ERROR,
          errorMsg: "No git token available",
        },
        null,
      );
    });

    it("deletes IDB row when file does not exist on disk", async () => {
      mockPostFileExists.mockResolvedValue(false);

      await syncer.commitDeletion(makeMockProjectEntry(), "post-1");

      expect(mockDeletePost).toHaveBeenCalledTimes(1);
      expect(mockDeletePost).toHaveBeenCalledWith("proj-1", "post-1");
      // File-not-on-disk path fires SYNCED status after the deletion.
      expect(config.onSyncStatus).toHaveBeenCalledWith(
        "proj-1",
        { state: ESyncState.SYNCED, errorMsg: "" },
        null,
      );
    });

    it("saves as pending deletion with deleted:true and persists sha after successful commit", async () => {
      mockPostFileExists.mockResolvedValue(true);
      mockAdapterCommitDeletion.mockResolvedValue("sha-delete");
      mockGetPost.mockResolvedValue(
        makeDirtyPost({ id: "post-1", draft: true }),
      );

      const project = makeMockProjectEntry();
      await syncer.commitDeletion(project, "post-1");

      expect(mockAdapterCommitDeletion).toHaveBeenCalledWith(
        "proj-1",
        "post-1",
        expect.stringMatching(/-delete-/),
        "decrypted-token",
      );
      // Post is saved as pending deletion, not deleted outright
      expect(mockDeletePost).not.toHaveBeenCalled();
      expect(mockSavePost).toHaveBeenCalledTimes(1);
      expect(mockSavePost).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "post-1",
          dirty: 1,
          deleted: true,
        }),
      );
      expect(mockSaveProject).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "proj-1",
          storedRemoteSha: "sha-delete",
        }),
      );
      expect(config.onSyncStatus).toHaveBeenCalledWith(
        "proj-1",
        { state: ESyncState.SYNCED, errorMsg: "" },
        null,
      );
    });

    it("recompute flags project dirty when other dirty posts remain after a deletion", async () => {
      mockPostFileExists.mockResolvedValue(false);
      // After deleting the requested post, one other dirty post remains.
      mockGetDirtyPosts.mockResolvedValue([
        makeDirtyPost({ id: "other-post", dirty: 1 }),
      ]);

      await syncer.commitDeletion(makeMockProjectEntry(), "post-1");

      expect(mockDeletePost).toHaveBeenCalledTimes(1);
      // The !existsOnDisk path fires SYNCED.
      expect(config.onSyncStatus).toHaveBeenCalledWith(
        "proj-1",
        { state: ESyncState.SYNCED, errorMsg: "" },
        null,
      );
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
        postEntries: [],
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
      syncer.stop();
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
