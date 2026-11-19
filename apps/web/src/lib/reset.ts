import { dbClearAll } from "$lib/db";
import { clearFS } from "$lib/fs";
import { deviceLock } from "$lib/stores/device.svelte";
import {
  LEGACY_AUTH_STORAGE_KEY,
  POSTS_LIST_PREFS_STORAGE_KEY,
  PROJECT_COMMITS_STORAGE_KEY,
  SYNC_STATUS_STORAGE_KEY,
} from "$lib/shared/constants";

export async function wipeLocalData(): Promise<void> {
  deviceLock.reset();

  for (const key of [
    LEGACY_AUTH_STORAGE_KEY,
    SYNC_STATUS_STORAGE_KEY,
    PROJECT_COMMITS_STORAGE_KEY,
    POSTS_LIST_PREFS_STORAGE_KEY,
  ]) {
    localStorage.removeItem(key);
  }

  await dbClearAll().catch((err) => {
    console.error("[reset] failed to clear IDB:", err);
  });
  await clearFS().catch((err) => {
    console.error("[reset] failed to clear FS:", err);
  });

  if (typeof location !== "undefined") location.reload();
}
