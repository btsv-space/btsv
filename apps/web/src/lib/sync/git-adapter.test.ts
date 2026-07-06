import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitAdapter } from "$lib/sync/git-adapter";

const mockPull = vi.fn();
const mockStatus = vi.fn();
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockCommit = vi.fn();
const mockPush = vi.fn();
const mockClone = vi.fn();
const mockInit = vi.fn();
const mockLog = vi.fn();
const mockResolveRef = vi.fn();
const mockWriteRef = vi.fn();
const mockResetIndex = vi.fn();
const mockHttp = Symbol("http");

vi.mock("isomorphic-git", () => ({
  pull: mockPull,
  status: mockStatus,
  add: mockAdd,
  remove: mockRemove,
  commit: mockCommit,
  push: mockPush,
  clone: mockClone,
  init: mockInit,
  log: mockLog,
  resolveRef: mockResolveRef,
  writeRef: mockWriteRef,
  resetIndex: mockResetIndex,
}));

vi.mock("isomorphic-git/http/web", () => ({ default: mockHttp }));

const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();
const mockReadFile = vi.fn();
const mockStat = vi.fn();
const mockReaddir = vi.fn();
const mockUnlink = vi.fn();
const mockGetFS = vi.fn();
const mockGetDir = vi.fn();
const mockGetPostPath = vi.fn();
const mockEnsureDirChain = vi.fn().mockResolvedValue(undefined);
const mockWritePostFile = vi.fn().mockResolvedValue(undefined);
const mockDeletePostFile = vi.fn().mockResolvedValue(undefined);

vi.mock("$lib/fs", () => ({
  getFS: (...args: unknown[]) => mockGetFS(...args),
  getDir: (...args: unknown[]) => mockGetDir(...args),
  getPostPath: (...args: unknown[]) => mockGetPostPath(...args),
  ensureDirChain: (...args: unknown[]) => mockEnsureDirChain(...args),
  writePostFile: (...args: unknown[]) => mockWritePostFile(...args),
  deletePostFile: (...args: unknown[]) => mockDeletePostFile(...args),
}));

vi.mock("$lib/shared/constants", () => ({
  PROJECTS_DIR: "/projects",
  POSTS_DIR: "src/content/posts",
  POST_EXT: ".mdx",
  DEFAULT_PROXY_URL: "http://localhost:9999",
  DEFAULT_GIT_BRANCH: "staging",
  MAIN_GIT_BRANCH: "main",
}));

const PROJECT_DIR = "/projects/proj-1";

beforeEach(() => {
  vi.clearAllMocks();

  mockGetFS.mockResolvedValue({
    promises: {
      mkdir: mockMkdir,
      writeFile: mockWriteFile,
      readFile: mockReadFile,
      stat: mockStat,
      readdir: mockReaddir,
      unlink: mockUnlink,
    },
  });

  mockGetDir.mockReturnValue(PROJECT_DIR);
  mockGetPostPath.mockImplementation(
    (id: string) => `src/content/posts/${id}.mdx`,
  );

  mockUnlink.mockResolvedValue(undefined);

  mockResolveRef.mockResolvedValue("abc123def456");
  mockWriteRef.mockResolvedValue(undefined);
  mockResetIndex.mockResolvedValue(undefined);
});

describe("constructor", () => {
  it("defaults proxyUrl to http://localhost:9999", () => {
    const adapter = new GitAdapter("https://github.com/user/repo.git");
    expect(adapter).toBeInstanceOf(GitAdapter);
  });

  it("accepts custom proxyUrl", () => {
    const adapter = new GitAdapter(
      "https://github.com/user/repo.git",
      "http://custom-proxy:8888",
    );
    expect(adapter).toBeInstanceOf(GitAdapter);
  });
});

describe("pull", () => {
  beforeEach(() => {
    mockPull.mockResolvedValue(undefined);
    mockClone.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockLog.mockRejectedValue(new Error("no commits"));
    mockInit.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockAdd.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue("sha-init");
    mockUnlink.mockResolvedValue(undefined);
  });

  it("pulls when repo exists locally", async () => {
    const mdxFiles = ["post-1.mdx", "post-2.mdx"];
    mockStat.mockImplementation((path: string) => {
      const isDir = !mdxFiles.some((f) => path.endsWith(f));
      return Promise.resolve({ isDirectory: () => isDir });
    });
    mockReaddir.mockImplementation((path: string) => {
      if (path === PROJECT_DIR) return Promise.resolve(["src"]);
      if (path === `${PROJECT_DIR}/src`) return Promise.resolve(["content"]);
      if (path === `${PROJECT_DIR}/src/content`)
        return Promise.resolve(["posts"]);
      if (path === `${PROJECT_DIR}/src/content/posts`)
        return Promise.resolve(mdxFiles);
      return Promise.reject(new Error("not found"));
    });
    mockReadFile.mockImplementation((path: string) => {
      if (path.endsWith("post-1.mdx")) return Promise.resolve("content-1");
      if (path.endsWith("post-2.mdx")) return Promise.resolve("content-2");
      return Promise.reject(new Error("not found"));
    });

    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const entries = await adapter.pull("proj-1", "token-abc");

    expect(mockPull).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: PROJECT_DIR,
        corsProxy: "http://localhost:9999",
        singleBranch: true,
      }),
    );
    const pullAuth = mockPull.mock.calls[0][0].onAuth();
    expect(pullAuth).toEqual({
      username: "token-abc",
      password: "x-oauth-basic",
    });
    expect(mockClone).not.toHaveBeenCalled();
    expect(entries).toEqual([
      { id: "post-1", content: "content-1" },
      { id: "post-2", content: "content-2" },
    ]);
  });

  it("clones when repo does not exist locally", async () => {
    mockStat.mockImplementation((path: string) => {
      if (path === `${PROJECT_DIR}/.git`)
        return Promise.reject(new Error("not found"));
      const isDir = !path.endsWith(".mdx");
      return Promise.resolve({ isDirectory: () => isDir });
    });
    mockReaddir.mockImplementation((path: string) => {
      if (path === PROJECT_DIR) return Promise.resolve(["src"]);
      if (path === `${PROJECT_DIR}/src`) return Promise.resolve(["content"]);
      if (path === `${PROJECT_DIR}/src/content`)
        return Promise.resolve(["posts"]);
      if (path === `${PROJECT_DIR}/src/content/posts`)
        return Promise.resolve(["post-1.mdx"]);
      return Promise.reject(new Error("not found"));
    });
    mockReadFile.mockImplementation((path: string) => {
      if (path.endsWith("post-1.mdx")) return Promise.resolve("content-1");
      return Promise.reject(new Error("not found"));
    });

    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const entries = await adapter.pull("proj-1", "token-abc");

    expect(mockClone).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: PROJECT_DIR,
        url: "https://github.com/user/repo.git",
        corsProxy: "http://localhost:9999",
        singleBranch: true,
      }),
    );
    const cloneAuth = mockClone.mock.calls[0][0].onAuth();
    expect(cloneAuth).toEqual({
      username: "token-abc",
      password: "x-oauth-basic",
    });
    expect(mockPull).not.toHaveBeenCalled();
    expect(entries).toHaveLength(1);
  });

  it("emits { deleted: true } entries for files removed by git.pull (Phase 2 parity)", async () => {
    let existingFiles = ["post-1.mdx", "post-2.mdx", "post-3.mdx"];

    mockPull.mockImplementation(async () => {
      existingFiles = existingFiles.filter(
        (f) => f !== "post-2.mdx" && f !== "post-3.mdx",
      );
    });

    mockStat.mockImplementation((path: string) => {
      if (path === `${PROJECT_DIR}/.git`)
        return Promise.resolve({ isDirectory: () => true });
      const matchingFile = existingFiles.find((f) => path.endsWith(f));
      if (matchingFile) return Promise.resolve({ isDirectory: () => false });
      return Promise.resolve({ isDirectory: () => true });
    });
    mockReaddir.mockImplementation((path: string) => {
      if (path === PROJECT_DIR) return Promise.resolve(["src"]);
      if (path === `${PROJECT_DIR}/src`) return Promise.resolve(["content"]);
      if (path === `${PROJECT_DIR}/src/content`)
        return Promise.resolve(["posts"]);
      if (path === `${PROJECT_DIR}/src/content/posts`)
        return Promise.resolve(existingFiles);
      return Promise.reject(new Error("not found"));
    });
    mockReadFile.mockImplementation((path: string) => {
      const file = existingFiles.find((f) => path.endsWith(f));
      if (file) return Promise.resolve(`content-${file.replace(".mdx", "")}`);
      return Promise.reject(new Error("not found"));
    });

    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const entries = await adapter.pull("proj-1", "token-abc");

    expect(mockPull).toHaveBeenCalledWith(
      expect.objectContaining({ dir: PROJECT_DIR, singleBranch: true }),
    );
    expect(mockClone).not.toHaveBeenCalled();
    expect(entries).toHaveLength(3);
    expect(entries).toContainEqual({
      id: "post-1",
      content: "content-post-1",
    });
    expect(entries).toContainEqual({ id: "post-2", deleted: true });
    expect(entries).toContainEqual({ id: "post-3", deleted: true });
  });

  it("does not emit deleted entries when git.pull fails (no working-tree change)", async () => {
    mockPull.mockRejectedValue(new Error("network failure"));
    const mdxFiles = ["post-1.mdx", "post-2.mdx"];
    mockStat.mockImplementation((path: string) => {
      const isDir = !mdxFiles.some((f) => path.endsWith(f));
      return Promise.resolve({ isDirectory: () => isDir });
    });
    mockReaddir.mockImplementation((path: string) => {
      if (path === PROJECT_DIR) return Promise.resolve(["src"]);
      if (path === `${PROJECT_DIR}/src`) return Promise.resolve(["content"]);
      if (path === `${PROJECT_DIR}/src/content`)
        return Promise.resolve(["posts"]);
      if (path === `${PROJECT_DIR}/src/content/posts`)
        return Promise.resolve(mdxFiles);
      return Promise.reject(new Error("not found"));
    });
    mockReadFile.mockImplementation((path: string) => {
      if (path.endsWith("post-1.mdx")) return Promise.resolve("content-1");
      if (path.endsWith("post-2.mdx")) return Promise.resolve("content-2");
      return Promise.reject(new Error("not found"));
    });

    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const entries = await adapter.pull("proj-1", "token-abc");

    expect(mockPull).toHaveBeenCalled();
    expect(entries).toEqual([
      { id: "post-1", content: "content-1" },
      { id: "post-2", content: "content-2" },
    ]);
    expect(entries.every((e) => !e.deleted)).toBe(true);
  });
});

describe("commitAndPush", () => {
  beforeEach(() => {
    mockPull.mockResolvedValue(undefined);
    mockStatus.mockResolvedValue("*modified");
    mockAdd.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue("sha-abc123");
    mockPush.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  it("writes file, adds, commits, and pushes", async () => {
    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const sha = await adapter.commitAndPush(
      "proj-1",
      "post-1",
      "content",
      "save message",
      "token-abc",
    );

    expect(sha).toBe("sha-abc123");
    expect(mockWritePostFile).toHaveBeenCalledWith(
      "proj-1",
      "post-1",
      "content",
    );
    expect(mockStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: PROJECT_DIR,
        filepath: "src/content/posts/post-1.mdx",
      }),
    );
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: PROJECT_DIR,
        filepath: "src/content/posts/post-1.mdx",
      }),
    );
    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({ dir: PROJECT_DIR, message: "save message" }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: PROJECT_DIR,
        corsProxy: "http://localhost:9999",
      }),
    );
  });

  it("passes onAuth credentials to push", async () => {
    const adapter = new GitAdapter("https://github.com/user/repo.git");
    await adapter.commitAndPush(
      "proj-1",
      "post-1",
      "content",
      "msg",
      "token-abc",
    );

    const pushAuth = mockPush.mock.calls[0][0].onAuth();
    expect(pushAuth).toEqual({
      username: "token-abc",
      password: "x-oauth-basic",
    });
  });

  it("returns null when file is unmodified", async () => {
    mockStatus.mockResolvedValue("unmodified");

    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const sha = await adapter.commitAndPush(
      "proj-1",
      "post-1",
      "content",
      "msg",
      "token-abc",
    );

    expect(sha).toBeNull();
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("falls back to force push on rejection", async () => {
    mockPush
      .mockRejectedValueOnce(new Error("rejected"))
      .mockResolvedValueOnce(undefined);

    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const sha = await adapter.commitAndPush(
      "proj-1",
      "post-1",
      "content",
      "msg",
      "token-abc",
    );

    expect(sha).toBe("sha-abc123");
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith(
      expect.objectContaining({ dir: PROJECT_DIR, force: true }),
    );
  });
});

describe("commitDeletion", () => {
  beforeEach(() => {
    mockPull.mockResolvedValue(undefined);
    mockStatus.mockResolvedValue("*modified");
    mockRemove.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue("sha-deleted-abc");
    mockPush.mockResolvedValue(undefined);
  });

  it("removes, commits, and pushes", async () => {
    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const sha = await adapter.commitDeletion(
      "proj-1",
      "post-1",
      "delete message",
      "token-abc",
    );

    expect(sha).toBe("sha-deleted-abc");
    expect(mockRemove).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: PROJECT_DIR,
        filepath: "src/content/posts/post-1.mdx",
      }),
    );
    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({ dir: PROJECT_DIR, message: "delete message" }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: PROJECT_DIR,
        corsProxy: "http://localhost:9999",
      }),
    );
  });

  it("passes onAuth to push", async () => {
    const adapter = new GitAdapter("https://github.com/user/repo.git");
    await adapter.commitDeletion("proj-1", "post-1", "msg", "token-abc");

    const pushAuth = mockPush.mock.calls[0][0].onAuth();
    expect(pushAuth).toEqual({
      username: "token-abc",
      password: "x-oauth-basic",
    });
  });

  it("returns null when file is absent", async () => {
    mockStatus.mockResolvedValue("absent");

    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const sha = await adapter.commitDeletion(
      "proj-1",
      "post-1",
      "msg",
      "token-abc",
    );

    expect(sha).toBeNull();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("falls back to force push on rejection", async () => {
    mockPush
      .mockRejectedValueOnce(new Error("rejected"))
      .mockResolvedValueOnce(undefined);

    const adapter = new GitAdapter("https://github.com/user/repo.git");
    const sha = await adapter.commitDeletion(
      "proj-1",
      "post-1",
      "msg",
      "token-abc",
    );

    expect(sha).toBe("sha-deleted-abc");
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith(
      expect.objectContaining({ dir: PROJECT_DIR, force: true }),
    );
  });
});
