import { PREFS_STORAGE_KEY } from "$lib/shared/constants";
import type { IPreferences } from "$lib/shared/types";

const DEFAULT_PREFS: IPreferences = Object.freeze({ name: "" });

function hydrate(): IPreferences {
  try {
    return {
      ...DEFAULT_PREFS,
      ...JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? "{}"),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

class PrefsStore {
  #value = $state<IPreferences>(hydrate());

  get name(): string {
    return this.#value.name;
  }

  save(next: Partial<IPreferences>): void {
    Object.assign(this.#value, next);

    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(this.#value));
    } catch {
      // ignore storage errors
    }
  }
}

export const prefs = new PrefsStore();
