import { describe, it, expect, beforeAll } from "vitest";
import "fake-indexeddb/auto";
import type { IPostRecord } from "$lib/shared/types";

/**
 * db migrations: records that existed before an index was added must
 * remain queryable after the upgrade (IndexedDB backfills new indexes
 * from existing records during the upgrade transaction).
 *
 * One database version timeline per file: seed at v7, then the dynamic
 * $lib/db import opens at the current DB_VERSION and runs every
 * migration block (v8 date-sort indexes, v9 by_tag multiEntry). Each
 * block's backfill is asserted in its own test. A separate 8→9 timeline
 * can't share this file — the version only moves up, and the
 * module-cached connection holds the upgraded database.
 */
let dbGetPosts: typeof import("$lib/db").dbGetPosts;
let dbGetProjectTags: typeof import("$lib/db").dbGetProjectTags;

beforeAll(async () => {
  // Open at version 7 with the v7 end-state schema.
  const raw: IDBDatabase = await new Promise((resolve, reject) => {
    const req = indexedDB.open("btsv", 7);
    req.onupgradeneeded = () => {
      const db = req.result;
      const posts = db.createObjectStore("posts", {
        keyPath: ["projectId", "id"],
      });
      posts.createIndex("by_project_dirty", ["projectId", "dirty"], {
        unique: false,
      });
      posts.createIndex("by_project_slug", ["projectId", "slug"], {
        unique: false,
      });
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("preferences", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  // Seed posts with distinct creation dates (insertion order ≠ date order)
  // and tags (for the v9 backfill assertion).
  const seed = (
    id: string,
    dateCreated: string,
    tags: string[] = [],
  ): IPostRecord => ({
    projectId: "proj-1",
    id,
    slug: "",
    title: "",
    dateCreated,
    dateUpdated: dateCreated,
    description: "",
    tags,
    draft: false,
    page: false,
    body: "",
    extra: {},
    dirty: 0,
  });
  await new Promise<void>((resolve, reject) => {
    const tx = raw.transaction("posts", "readwrite");
    tx.objectStore("posts").put(seed("post-b", "2026-01-01"));
    tx.objectStore("posts").put(seed("post-a", "2026-01-03", ["js", "svelte"]));
    tx.objectStore("posts").put(seed("post-c", "2026-01-02", ["kit"]));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  raw.close();

  // Fresh import → getDB() opens at the current DB_VERSION → upgrade runs.
  const mod = await import("$lib/db");
  dbGetPosts = mod.dbGetPosts;
  dbGetProjectTags = mod.dbGetProjectTags;
});

describe("db migrations", () => {
  it("v8: pre-existing posts appear in date-sorted results after upgrade", async () => {
    const posts = await dbGetPosts("proj-1", { limit: 10 });
    expect(posts.map((p) => p.id)).toEqual(["post-a", "post-c", "post-b"]);
  });

  it("v9: pre-existing posts' tags are queryable after upgrade", async () => {
    expect(await dbGetProjectTags("proj-1")).toEqual(["js", "kit", "svelte"]);
  });
});
