import { dbGetPrefs } from "$lib/db";
import type { IUserPreferences } from "$lib/shared/types";

export const prefs = $state<{ value: IUserPreferences }>({
  value: { name: "" },
});

let pendingPrefs: Promise<void> | null = null;

/** Hydrate prefs from the IDB cache (once; subsequent calls reuse it). */
export function ensurePrefsReady(): Promise<void> {
  pendingPrefs ??= dbGetPrefs().then((cached) => {
    if (cached) prefs.value = { name: cached.name?.trim() ?? "" };
  });
  return pendingPrefs;
}
