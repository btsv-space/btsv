import { describe, it, expect, vi } from "vitest";
import type { IProject, ISyncAdapter } from "$lib/shared/types";

const mockGitAdapter = vi.fn();
const mockApiAdapter = vi.fn();

vi.mock("$lib/sync/git-adapter", () => ({
  GitAdapter: mockGitAdapter,
}));

vi.mock("$lib/sync/api-adapter", () => ({
  ApiAdapter: mockApiAdapter,
}));

const project: IProject = {
  id: "proj-1",
  name: "test",
  repoUrl: "https://github.com/user/repo.git",
};

describe("createSyncAdapter", () => {
  it("always returns an ApiAdapter (no git/proxy path)", async () => {
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

    const adapter = await createSyncAdapter(project);

    expect(mockApiAdapter).toHaveBeenCalledWith(project.repoUrl);
    expect(mockGitAdapter).not.toHaveBeenCalled();
    expect(adapter).toHaveProperty("isApi", true);
  });
});
