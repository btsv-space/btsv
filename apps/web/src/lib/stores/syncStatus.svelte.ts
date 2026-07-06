import { SvelteMap } from "svelte/reactivity";
import { dbGetDirtyPosts } from "$lib/db";
import { ESyncState, type ISyncStatus } from "$lib/shared/types";
import { SYNC_STATUS_STORAGE_KEY } from "$lib/shared/constants";

class SyncStatusStore {
  private map = this.#load();

  get(projectId: string): ISyncStatus | undefined {
    return this.map.get(projectId);
  }

  // Persisted mutators: only `state` + `errorMsg` are persisted; `dirty` is preserved in-memory.
  setStateAndMsg(projectId: string, status: Omit<ISyncStatus, "dirty">): void {
    const existing = this.map.get(projectId);
    const entry: ISyncStatus = {
      state: status.state,
      errorMsg: status.errorMsg,
      dirty: existing?.dirty ?? false,
    };
    this.map.set(projectId, entry);
    this.#persist();
  }

  updateDirty(projectId: string, dirtyOverride: boolean | null = null) {
    if (dirtyOverride != null)
      this.#updateProjectDirty(projectId, dirtyOverride);
    dbGetDirtyPosts(projectId).then((dbDirtyPosts) => {
      this.#updateProjectDirty(projectId, dbDirtyPosts.length > 0);
    });
  }

  clear(): void {
    this.map.clear();
    this.#persist();
  }

  #updateProjectDirty(projectId: string, dirty: boolean) {
    const projectStatus = this.map.get(projectId);
    if (!projectStatus) return;
    this.map.set(projectId, {
      ...projectStatus,
      dirty,
    });
  }

  #load(): SvelteMap<string, ISyncStatus> {
    const map = new SvelteMap<string, ISyncStatus>();
    if (typeof localStorage === "undefined") {
      return map;
    }
    try {
      const raw = localStorage.getItem(SYNC_STATUS_STORAGE_KEY);
      if (!raw) {
        return map;
      }
      const parsed = JSON.parse(raw) as Record<
        string,
        Omit<ISyncStatus, "dirty">
      >;
      // transient SYNCING_* states do not survive a page refresh:
      // the operation that set them is gone, so we default to SYNCED.
      for (const [projectId, status] of Object.entries(parsed)) {
        const isSyncing =
          status.state === ESyncState.SYNCING_PULL ||
          status.state === ESyncState.SYNCING_PUSH;
        map.set(projectId, {
          state: isSyncing ? ESyncState.SYNCED : status.state,
          errorMsg: isSyncing ? "" : status.errorMsg,
          dirty: false,
        });
        // `dirty` is updated via direct IDB lookup
        this.updateDirty(projectId);
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
        localStorage.removeItem(SYNC_STATUS_STORAGE_KEY);
        return;
      }
      // Strip `dirty` — it is in-memory only, recomputed on load.
      const data = Object.fromEntries(
        Array.from(this.map.entries()).map(([pid, e]) => [
          pid,
          { state: e.state, errorMsg: e.errorMsg },
        ]),
      );
      localStorage.setItem(SYNC_STATUS_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  }
}

export const syncStatus = new SyncStatusStore();
