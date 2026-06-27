import { describe, it, expect, vi } from "vitest";
import type { IProject, ISyncAdapter } from "$lib/shared/types";

const mockGitAdapter = vi.fn();
const mockApiAdapter = vi.fn();

vi.mock("./git-adapter", () => ({
  GitAdapter: mockGitAdapter,
}));

vi.mock("./api-adapter", () => ({
  ApiAdapter: mockApiAdapter,
}));

const project: IProject = {
  id: "proj-1",
  name: "test",
  repoUrl: "https://github.com/user/repo.git",
};

describe("createSyncAdapter", () => {
  it("returns GitAdapter with default proxyUrl when syncType is git and prefs has no proxyUrl", async () => {
    const { createSyncAdapter } = await import("$lib/sync/adapter");
    mockGitAdapter.mockImplementation(function () {
      return {
        checkRemote: vi.fn(),
        pull: vi.fn(),
        initialPull: vi.fn(),
        mergeToMain: vi.fn(),
        commitAndPush: vi.fn(),
        commitDeletion: vi.fn(),
        isGit: true,
      } as ISyncAdapter;
    });

    const adapter = await createSyncAdapter(project, {
      syncType: "git",
      proxyUrl: "",
    });

    expect(mockGitAdapter).toHaveBeenCalledWith(project.repoUrl, undefined);

    expect(adapter).toHaveProperty("isGit", true);
  });

  it("returns GitAdapter with proxyUrl when syncType is git and prefs has proxyUrl", async () => {
    const { createSyncAdapter } = await import("$lib/sync/adapter");
    mockGitAdapter.mockImplementation(function () {
      return {
        checkRemote: vi.fn(),
        pull: vi.fn(),
        initialPull: vi.fn(),
        mergeToMain: vi.fn(),
        commitAndPush: vi.fn(),
        commitDeletion: vi.fn(),
        isGit: true,
      } as ISyncAdapter;
    });

    await createSyncAdapter(project, {
      syncType: "git",
      proxyUrl: "http://custom-proxy:8888",
    });

    expect(mockGitAdapter).toHaveBeenCalledWith(
      project.repoUrl,
      "http://custom-proxy:8888",
    );
  });

  it("returns ApiAdapter when syncType is api", async () => {
    const { createSyncAdapter } = await import("$lib/sync/adapter");
    mockApiAdapter.mockImplementation(function () {
      return {
        checkRemote: vi.fn(),
        pull: vi.fn(),
        initialPull: vi.fn(),
        mergeToMain: vi.fn(),
        commitAndPush: vi.fn(),
        commitDeletion: vi.fn(),
        isApi: true,
      } as ISyncAdapter;
    });

    const adapter = await createSyncAdapter(project, {
      syncType: "api",
      proxyUrl: "",
    });

    expect(mockApiAdapter).toHaveBeenCalledWith(project.repoUrl);
    expect(adapter).toHaveProperty("isApi", true);
  });
});
