import { openDB, type IDBPDatabase } from "idb";
import type {
  IPostRecord,
  IUserPreferences,
  TProjectEntry,
} from "$lib/shared/types";

const DB_NAME = "btsv";
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains("documents")) {
            db.createObjectStore("documents", {
              keyPath: ["projectId", "path"],
            });
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("posts")) {
            const store = db.createObjectStore("posts", {
              keyPath: ["projectId", "slug"],
            });
            store.createIndex("by_dirty", "dirty");
          }
        }
        if (oldVersion < 3) {
          if (db.objectStoreNames.contains("posts")) {
            db.deleteObjectStore("posts");
          }
          const store = db.createObjectStore("posts", {
            keyPath: ["projectId", "id"],
          });
          store.createIndex("by_dirty", "dirty");
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains("projects")) {
            db.createObjectStore("projects", { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains("preferences")) {
            db.createObjectStore("preferences", { keyPath: "id" });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function dbGetPosts(projectId: string): Promise<IPostRecord[]> {
  const db = await getDB();
  const tx = db.transaction("posts", "readonly");
  const store = tx.objectStore("posts");
  const posts = await store.getAll();
  return posts.filter((p) => p.projectId === projectId);
}

export async function dbGetPost(
  projectId: string,
  id: string,
): Promise<IPostRecord | undefined> {
  const db = await getDB();
  return db.get("posts", [projectId, id]);
}

export async function dbSavePost(post: IPostRecord): Promise<void> {
  const db = await getDB();
  const plain = JSON.parse(JSON.stringify(post));
  await db.put("posts", plain);
}

export async function dbDeletePost(
  projectId: string,
  id: string,
): Promise<void> {
  const db = await getDB();
  await db.delete("posts", [projectId, id]);
}

export async function dbGetDirtyPosts(
  projectId: string,
): Promise<IPostRecord[]> {
  const db = await getDB();
  const tx = db.transaction("posts", "readonly");
  const store = tx.objectStore("posts");
  const posts = await store.getAll();
  return posts.filter((p) => p.projectId === projectId && p.dirty);
}

// ── Projects cache ────────────────────────────────

export async function dbGetProjects(): Promise<TProjectEntry[]> {
  const db = await getDB();
  return db.getAll("projects");
}

export async function dbSaveProjects(projects: TProjectEntry[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("projects", "readwrite");
  const store = tx.objectStore("projects");
  await store.clear();
  for (const p of projects) {
    await store.put(p);
  }
  await tx.done;
}

export async function dbSaveProject(project: TProjectEntry): Promise<void> {
  const db = await getDB();
  await db.put("projects", project);
}

// ── Preferences cache ─────────────────────────────

export async function dbGetPrefs(): Promise<IUserPreferences | undefined> {
  const db = await getDB();
  return db.get("preferences", "default");
}

export async function dbSavePrefs(prefs: IUserPreferences): Promise<void> {
  const db = await getDB();
  await db.put("preferences", { ...prefs, id: "default" });
}
