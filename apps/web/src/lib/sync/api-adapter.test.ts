import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiAdapter } from "$lib/sync/api-adapter";

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
  DEFAULT_GIT_BRANCH: "staging",
  MAIN_GIT_BRANCH: "main",
}));

const PROJECT_DIR = "/projects/proj-1";

function mockFetch(response: Partial<Response>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response as Response);
}

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
});

describe("constructor", () => {
  it("parses owner and repo from repoUrl", () => {
    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    expect(adapter).toBeInstanceOf(ApiAdapter);
  });
});

describe("checkRemote", () => {
  it("returns hasChanges:false + headSha when branch tip matches stored sha", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          commit: {
            sha: "sha-tip",
            commit: {
              committer: { date: "2026-06-01T00:00:00Z" },
            },
          },
        }),
      text: () => Promise.resolve(""),
    } as Response);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const result = await adapter.checkRemote("proj-1", "token-abc", "sha-tip");

    expect(result.hasChanges).toBe(false);
    expect(result.headSha).toBe("sha-tip");
    expect(result.lastCommitTime).toBe(
      new Date("2026-06-01T00:00:00Z").getTime(),
    );
  });

  it("returns hasChanges:true + headSha when branch tip differs from stored", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          commit: { sha: "sha-new", commit: { committer: { date: "" } } },
        }),
      text: () => Promise.resolve(""),
    } as Response);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const result = await adapter.checkRemote("proj-1", "token-abc", "sha-old");

    expect(result.hasChanges).toBe(true);
    expect(result.headSha).toBe("sha-new");
  });

  it("returns hasChanges:true on first sync (no stored sha)", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ commit: { sha: "sha-first" } }),
      text: () => Promise.resolve(""),
    } as Response);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const result = await adapter.checkRemote("proj-1", "token-abc");

    expect(result.hasChanges).toBe(true);
    expect(result.headSha).toBe("sha-first");
  });

  it("returns hasChanges:true when branch is not found", async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("Not Found"),
    } as Response);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const result = await adapter.checkRemote("proj-1", "token-abc", "sha-old");

    expect(result.hasChanges).toBe(true);
    expect(result.headSha).toBeUndefined();
  });
});

describe("pull", () => {
  it("fetches posts via GraphQL and writes them to fs", async () => {
    const graphqlResponse = {
      data: {
        repository: {
          object: {
            entries: [
              { name: "post-1.mdx", object: { text: "content-1" } },
              { name: "post-2.mdx", object: { text: "content-2" } },
            ],
          },
        },
      },
    };

    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(graphqlResponse),
      text: () => Promise.resolve(""),
    } as Response);

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const entries = await adapter.pull("proj-1", "token-abc");

    expect(entries).toEqual([
      { id: "post-1", content: "content-1" },
      { id: "post-2", content: "content-2" },
    ]);

    expect(mockWritePostFile).toHaveBeenCalledTimes(2);
    expect(mockWritePostFile).toHaveBeenCalledWith(
      "proj-1",
      "post-1",
      "content-1",
    );
    expect(mockWritePostFile).toHaveBeenCalledWith(
      "proj-1",
      "post-2",
      "content-2",
    );

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(fetchCall[0]).toBe("https://api.github.com/graphql");
    expect(fetchCall[1].headers.Authorization).toBe("Bearer token-abc");
  });

  it("skips non-mdx entries", async () => {
    const graphqlResponse = {
      data: {
        repository: {
          object: {
            entries: [
              { name: "readme.md", object: { text: "readme" } },
              { name: "post-1.mdx", object: { text: "content-1" } },
            ],
          },
        },
      },
    };

    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(graphqlResponse),
      text: () => Promise.resolve(""),
    } as Response);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const entries = await adapter.pull("proj-1", "token-abc");

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("post-1");
  });

  it("throws on non-ok response", async () => {
    mockFetch({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Bad credentials"),
    } as Response);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    await expect(adapter.pull("proj-1", "token-abc")).rejects.toThrow(
      "GraphQL pull failed: 401 Bad credentials",
    );
  });

  it("throws on GraphQL errors", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ errors: [{ message: "Not found" }] }),
      text: () => Promise.resolve(""),
    } as Response);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    await expect(adapter.pull("proj-1", "token-abc")).rejects.toThrow(
      "GraphQL pull errors",
    );
  });

  it("handles empty tree gracefully", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { repository: { object: null } } }),
      text: () => Promise.resolve(""),
    } as Response);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const entries = await adapter.pull("proj-1", "token-abc");

    expect(entries).toEqual([]);
  });
});

describe("commitAndPush", () => {
  it("creates a new file via PUT to GitHub API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (url: string | URL | Request, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (!urlStr.includes("api.github.com/repos")) {
          return Promise.resolve({} as Response);
        }
        const method = (opts as RequestInit)?.method ?? "GET";
        if (method === "GET") {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(""),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ commit: { sha: "sha-new" } }),
          text: () => Promise.resolve(""),
        } as Response);
      },
    );

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const sha = await adapter.commitAndPush(
      "proj-1",
      "post-1",
      "content",
      "commit msg",
      "token-abc",
    );

    expect(sha).toBe("sha-new");

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const putCall = fetchMock.mock.calls.find((c: unknown[]) => {
      const opts = c[1] as RequestInit;
      return opts?.method === "PUT";
    });
    expect(putCall).toBeDefined();
    expect((putCall![1] as RequestInit).headers!).toMatchObject({
      Authorization: "Bearer token-abc",
    });
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.message).toBe("commit msg");
    expect(body.content).toBe(btoa("content"));
    expect(body.sha).toBeUndefined();
  });

  it("updates existing file by including sha", async () => {
    const getResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sha: "existing-sha", content: "base64" }),
      text: () => Promise.resolve(""),
    };

    const putResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ commit: { sha: "sha-updated" } }),
      text: () => Promise.resolve(""),
    };

    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        callCount === 1 ? getResponse : putResponse,
      ) as Promise<Response>;
    });

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const sha = await adapter.commitAndPush(
      "proj-1",
      "post-1",
      "new-content",
      "update msg",
      "token-abc",
    );

    expect(sha).toBe("sha-updated");

    const putCall = (
      globalThis.fetch as unknown as {
        mock: { calls: Array<[unknown, Record<string, unknown>]> };
      }
    ).mock.calls.find(
      (c) => (c[1] as Record<string, unknown>)?.method === "PUT",
    );
    const body = JSON.parse(
      (putCall?.[1] as Record<string, string>)?.body ?? "{}",
    );
    expect(body.sha).toBe("existing-sha");
  });

  it("writes file to fs before pushing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (url: string | URL | Request, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (!urlStr.includes("api.github.com/repos")) {
          return Promise.resolve({} as Response);
        }
        const method = (opts as RequestInit)?.method ?? "GET";
        if (method === "GET") {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(""),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ commit: { sha: "sha-new" } }),
          text: () => Promise.resolve(""),
        } as Response);
      },
    );

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    await adapter.commitAndPush(
      "proj-1",
      "post-1",
      "file-content",
      "msg",
      "token-abc",
    );

    expect(mockWritePostFile).toHaveBeenCalledWith(
      "proj-1",
      "post-1",
      "file-content",
    );
  });

  it("throws on failed PUT", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (url: string | URL | Request) => {
        if (url.toString().includes("api.github.com/repos")) {
          return Promise.resolve({
            ok: false,
            status: 422,
            text: () => Promise.resolve("Unprocessable"),
          } as Response);
        }
        return Promise.resolve({} as Response);
      },
    );

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    await expect(
      adapter.commitAndPush("proj-1", "post-1", "content", "msg", "token-abc"),
    ).rejects.toThrow("GitHub API commit failed: 422 Unprocessable");
  });

  it("returns null when content has not changed", async () => {
    const existingContent = "unchanged-content";

    vi.spyOn(globalThis, "fetch").mockImplementation(
      (url: string | URL | Request, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (!urlStr.includes("api.github.com/repos")) {
          return Promise.resolve({} as Response);
        }
        const method = (opts as RequestInit)?.method ?? "GET";
        if (method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                sha: "existing-sha",
                content: btoa(existingContent),
              }),
            text: () => Promise.resolve(""),
          } as Response);
        }
        return Promise.resolve({} as Response);
      },
    );

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const sha = await adapter.commitAndPush(
      "proj-1",
      "post-1",
      existingContent,
      "msg",
      "token-abc",
    );

    expect(sha).toBeNull();

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const putCalls = fetchMock.mock.calls.filter((c: unknown[]) => {
      const opts = c[1] as RequestInit;
      return opts?.method === "PUT";
    });
    expect(putCalls).toHaveLength(0);
  });
});

describe("commitDeletion", () => {
  it("fetches existing sha and DELETEs via GitHub API", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (url: string | URL | Request, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (!urlStr.includes("api.github.com/repos")) {
          return Promise.resolve({} as Response);
        }
        const method = (opts as RequestInit)?.method ?? "GET";
        if (method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ sha: "file-sha" }),
            text: () => Promise.resolve(""),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ commit: { sha: "delete-sha" } }),
          text: () => Promise.resolve(""),
        } as Response);
      },
    );

    mockUnlink.mockResolvedValue(undefined);

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const sha = await adapter.commitDeletion(
      "proj-1",
      "post-1",
      "delete msg",
      "token-abc",
    );

    expect(sha).toBe("delete-sha");

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const deleteCall = fetchMock.mock.calls.find((c: unknown[]) => {
      const opts = c[1] as RequestInit;
      return opts?.method === "DELETE";
    });
    expect(deleteCall).toBeDefined();
    const deleteBody = JSON.parse(
      (deleteCall![1] as RequestInit).body as string,
    );
    expect(deleteBody.message).toBe("delete msg");
    expect(deleteBody.sha).toBe("file-sha");
    expect(mockDeletePostFile).toHaveBeenCalledWith("proj-1", "post-1");
  });

  it("returns null when file is 404 on GitHub", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      } as Response);
    });

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    const sha = await adapter.commitDeletion(
      "proj-1",
      "post-1",
      "msg",
      "token-abc",
    );

    expect(sha).toBeNull();
  });

  it("throws on non-404 failed GET", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      } as Response);
    });

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    await expect(
      adapter.commitDeletion("proj-1", "post-1", "msg", "token-abc"),
    ).rejects.toThrow("GitHub API get failed: 500");
  });

  it("throws on failed DELETE", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (url: string | URL | Request, opts?: RequestInit) => {
        const urlStr = url.toString();
        if (!urlStr.includes("api.github.com/repos")) {
          return Promise.resolve({} as Response);
        }
        const method = (opts as RequestInit)?.method ?? "GET";
        if (method === "GET") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ sha: "file-sha" }),
            text: () => Promise.resolve(""),
          } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve("Forbidden"),
        } as Response);
      },
    );

    const adapter = new ApiAdapter("https://github.com/owner/repo.git");
    await expect(
      adapter.commitDeletion("proj-1", "post-1", "msg", "token-abc"),
    ).rejects.toThrow("GitHub API delete failed: 403 Forbidden");
  });
});
