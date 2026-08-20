import { openDB, type IDBPDatabase } from "idb";
import type {
  IPostRecord,
  IPostsListPrefs,
  IUserPreferences,
  TPostSortField,
  TProjectEntry,
} from "$lib/shared/types";
import { DEFAULT_LIST_PREFS, matchesListPrefs } from "$lib/postsList";

const DB_NAME = "btsv";
const DB_VERSION = 9;

const SORT_INDEXES: Record<TPostSortField, string> = {
  dateCreated: "by_project_dateCreated",
  dateUpdated: "by_project_dateUpdated",
  datePublished: "by_project_datePublished",
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
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
        if (oldVersion < 5 && tx) {
          const store = tx.objectStore("posts");
          if (store.indexNames.contains("by_dirty")) {
            store.deleteIndex("by_dirty");
          }
          if (!store.indexNames.contains("by_project_dirty")) {
            store.createIndex("by_project_dirty", ["projectId", "dirty"], {
              unique: false,
            });
          }
        }
        if (oldVersion < 6) {
          if (db.objectStoreNames.contains("documents")) {
            db.deleteObjectStore("documents");
          }
        }
        if (oldVersion < 7) {
          const store = tx.objectStore("posts");
          if (!store.indexNames.contains("by_project_slug")) {
            store.createIndex("by_project_slug", ["projectId", "slug"], {
              unique: false,
            });
          }
        }
        if (oldVersion < 8) {
          const store = tx.objectStore("posts");
          const dateIndexes: [string, string[]][] = [
            ["by_project_dateCreated", ["projectId", "dateCreated"]],
            ["by_project_dateUpdated", ["projectId", "dateUpdated"]],
            ["by_project_datePublished", ["projectId", "datePublished"]],
          ];
          for (const [name, keyPath] of dateIndexes) {
            if (!store.indexNames.contains(name)) {
              store.createIndex(name, keyPath, { unique: false });
            }
          }
        }
        if (oldVersion < 9) {
          const store = tx.objectStore("posts");
          if (!store.indexNames.contains("by_tag")) {
            // single-key: the IDB spec forbids compound+multiEntry
            store.createIndex("by_tag", "tags", { multiEntry: true });
          }
        }
      },
    });
  }
  return dbPromise;
}

async function walkPostsIndex(
  projectId: string,
  listPrefs: IPostsListPrefs,
  processPost: (post: IPostRecord) => boolean | void,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("posts", "readonly");
  const index = tx.store.index(SORT_INDEXES[listPrefs.sort]);
  const range = IDBKeyRange.bound([projectId, ""], [projectId, "\uffff"]);
  const direction = listPrefs.order === "desc" ? "prev" : "next";

  let cursor = await index.openCursor(range, direction);
  while (cursor) {
    if (processPost(cursor.value) === false) break;
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function dbGetPosts(
  projectId: string,
  opts: {
    limit: number;
    offset?: number;
    listPrefs?: IPostsListPrefs;
  },
): Promise<IPostRecord[]> {
  const { limit, offset = 0, listPrefs = DEFAULT_LIST_PREFS } = opts;

  const posts: IPostRecord[] = [];
  let matched = 0;
  await walkPostsIndex(projectId, listPrefs, (post) => {
    if (!matchesListPrefs(post, listPrefs)) return;
    if (matched >= offset) posts.push(post);
    matched++;
    // stop once page is full
    if (posts.length >= limit) return false;
  });
  return posts;
}

export async function dbGetPost(
  projectId: string,
  id: string,
): Promise<IPostRecord | undefined> {
  const db = await getDB();
  return db.get("posts", [projectId, id]);
}

export async function dbGetPostPage(
  projectId: string,
  id: string,
  pageSize: number,
  listPrefs: IPostsListPrefs = DEFAULT_LIST_PREFS,
): Promise<number | null> {
  let position = 0;
  let result: number | null = null;
  await walkPostsIndex(projectId, listPrefs, (post) => {
    const isMatch = matchesListPrefs(post, listPrefs);
    if (post.id === id) {
      // the target only counts if it passes the filter predicate
      if (isMatch) result = Math.floor(position / pageSize) + 1;
      return false;
    }
    if (isMatch) position++;
  });
  return result;
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
  const index = store.index("by_project_dirty");
  const dirty = await index.getAll(IDBKeyRange.only([projectId, 1]));
  await tx.done;
  return dirty;
}

export async function dbGetPostBySlug(
  projectId: string,
  slug: string,
): Promise<IPostRecord | undefined> {
  const db = await getDB();
  const tx = db.transaction("posts", "readonly");
  const index = tx.store.index("by_project_slug");
  const matches: IPostRecord[] = await index.getAll(
    IDBKeyRange.only([projectId, slug]),
  );
  await tx.done;
  return matches.find((m) => !m.deleted);
}

export async function dbGetProjectTags(projectId: string): Promise<string[]> {
  const db = await getDB();
  const tx = db.transaction("posts", "readonly");
  const index = tx.store.index("by_tag");
  const tags = new Set<string>();
  let cursor = await index.openCursor();
  while (cursor) {
    const post = cursor.value as IPostRecord;
    if (post.projectId === projectId && !post.deleted) {
      tags.add(cursor.key as string);
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return [...tags].sort((a, b) => a.localeCompare(b));
}

// ── Projects cache ────────────────────────────────

export async function dbGetProjects(): Promise<TProjectEntry[]> {
  const db = await getDB();
  return db.getAll("projects");
}

export async function dbSaveProjects(
  projectEntries: TProjectEntry[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("projects", "readwrite");
  const store = tx.objectStore("projects");
  await store.clear();
  for (const p of projectEntries) {
    await store.put({ ...p });
  }
  await tx.done;
}

export async function dbSaveProject(project: TProjectEntry): Promise<void> {
  const db = await getDB();
  await db.put("projects", { ...project });
}

// ── Preferences cache ─────────────────────────────

export async function dbGetPrefs(): Promise<IUserPreferences | undefined> {
  const db = await getDB();
  return db.get("preferences", "default");
}

export async function dbSavePrefs(userPrefs: IUserPreferences): Promise<void> {
  const db = await getDB();
  await db.put("preferences", { ...userPrefs, id: "default" });
}
