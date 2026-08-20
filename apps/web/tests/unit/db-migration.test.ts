import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import type { IPostRecord } from "$lib/shared/types";

/**
 * v7→v8 migration: records that existed before the three date-sort indexes
 * were added must appear in date-sorted query results after the upgrade
 * (IndexedDB backfills new indexes from existing records during the upgrade
 * transaction — this guards the v8 upgrade block's keyPaths).
 *
 * vitest isolates module state per test file, so the dynamic import of
 * $lib/db below opens a fresh connection (at DB_VERSION 8) over the
 * manually-seeded v7 database.
 */
describe("db v7→v8 migration", () => {
  it("pre-existing posts appear in date-sorted results after upgrade", async () => {
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

    // Seed posts with distinct creation dates (insertion order ≠ date order).
    const seed = (id: string, dateCreated: string): IPostRecord => ({
      projectId: "proj-1",
      id,
      slug: "",
      title: "",
      dateCreated,
      dateUpdated: dateCreated,
      description: "",
      tags: [],
      draft: false,
      page: false,
      body: "",
      extra: {},
      dirty: 0,
    });
    await new Promise<void>((resolve, reject) => {
      const tx = raw.transaction("posts", "readwrite");
      tx.objectStore("posts").put(seed("post-b", "2026-01-01"));
      tx.objectStore("posts").put(seed("post-a", "2026-01-03"));
      tx.objectStore("posts").put(seed("post-c", "2026-01-02"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    raw.close();

    // Fresh import → getDB() opens at DB_VERSION 8 → upgrade 7→8 runs.
    const { dbGetPosts } = await import("$lib/db");
    const posts = await dbGetPosts("proj-1", { limit: 10 });
    expect(posts.map((p) => p.id)).toEqual(["post-a", "post-c", "post-b"]);
  });
});
