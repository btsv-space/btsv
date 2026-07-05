import { dbGetPrefs } from "$lib/db";
import type { IUserPreferences, TSyncType } from "$lib/shared/types";

export const prefs = $state<{ value: IUserPreferences }>({
  value: { syncType: "api" as TSyncType, proxyUrl: "" },
});

dbGetPrefs().then((cached) => {
  if (cached) prefs.value = cached;
});
