import { describe, it, expect, beforeAll } from "vitest";
import type { IPostRecord } from "$lib/shared/types";

let posts: { value: IPostRecord[] };

beforeAll(async () => {
  const mod = await import("$lib/stores/posts.svelte");
  posts = mod.posts;
});

describe("posts store", () => {
  it("exports posts as a reactive state container", () => {
    expect(posts).toHaveProperty("value");
    expect(Array.isArray(posts.value)).toBe(true);
  });

  it("can be assigned and read", () => {
    posts.value = [{ projectId: "p1", id: "post-1" } as IPostRecord];
    expect(posts.value).toHaveLength(1);
    expect(posts.value[0].id).toBe("post-1");
  });
});
