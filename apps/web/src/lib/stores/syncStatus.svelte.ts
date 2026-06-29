import { SvelteMap } from "svelte/reactivity";
import { SyncState, type ISyncStatus } from "$lib/shared/types";

const STORAGE_KEY = "btsv:syncStatus";

class SyncStatusStore {
  private map = this.#load();

  get(projectId: string): ISyncStatus | undefined {
    return this.map.get(projectId);
  }

  set(projectId: string, status: ISyncStatus): void {
    this.map.set(projectId, status);
    this.#persist();
  }

  clear(): void {
    this.map.clear();
    this.#persist();
  }

  #load(): SvelteMap<string, ISyncStatus> {
    const map = new SvelteMap<string, ISyncStatus>();
    if (typeof localStorage === "undefined") {
      return map;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return map;
      }
      const parsed = JSON.parse(raw) as Record<string, ISyncStatus>;
      // transient SYNCING_* states do not survive a page refresh:
      // the operation that set them is gone, so we default to SYNCED
      for (const [projectId, status] of Object.entries(parsed)) {
        if (
          status.state === SyncState.SYNCING_PULL ||
          status.state === SyncState.SYNCING_PUSH
        ) {
          map.set(projectId, { state: SyncState.SYNCED, errorMsg: "" });
        } else {
          map.set(projectId, status);
        }
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
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const data = Object.fromEntries(this.map.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  }
}

export const syncStatus = new SyncStatusStore();
