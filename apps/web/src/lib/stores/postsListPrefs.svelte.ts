import { SvelteMap } from "svelte/reactivity";
import type { IPostsListPrefs } from "$lib/shared/types";
import { POSTS_LIST_PREFS_STORAGE_KEY } from "$lib/shared/constants";
import { DEFAULT_LIST_PREFS, sanitizeListPrefs } from "$lib/postsList";

class PostsListPrefsStore {
  private map = this.#load();

  get(projectId: string): IPostsListPrefs {
    return this.map.get(projectId) ?? DEFAULT_LIST_PREFS;
  }

  set(projectId: string, prefs: IPostsListPrefs): void {
    this.map.set(projectId, prefs);
    this.#persist();
  }

  #load(): SvelteMap<string, IPostsListPrefs> {
    const map = new SvelteMap<string, IPostsListPrefs>();
    if (typeof localStorage === "undefined") {
      return map;
    }
    try {
      const raw = localStorage.getItem(POSTS_LIST_PREFS_STORAGE_KEY);
      if (!raw) {
        return map;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [projectId, prefs] of Object.entries(parsed)) {
        map.set(projectId, sanitizeListPrefs(prefs));
      }
    } catch {
      // ignore parse/storage errors
    }
    return map;
  }

  #persist(): void {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      if (this.map.size === 0) {
        localStorage.removeItem(POSTS_LIST_PREFS_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        POSTS_LIST_PREFS_STORAGE_KEY,
        JSON.stringify(Object.fromEntries(this.map)),
      );
    } catch {
      // ignore storage errors
    }
  }
}

export const postsListPrefs = new PostsListPrefsStore();
