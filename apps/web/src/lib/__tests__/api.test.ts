import { describe, it, expect, vi, beforeEach } from "vitest";

function mockFetch(response: Partial<Response>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api.projects.create", () => {
  it("sends name and repoUrl", async () => {
    mockFetch({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "proj-1",
          name: "test",
          repoUrl: "https://github.com/user/repo",
        }),
    } as Response);

    const { api } = await import("$lib/api");
    await api.projects.create("test", "https://github.com/user/repo");

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body).toEqual({
      name: "test",
      repoUrl: "https://github.com/user/repo",
    });
  });
});
