import { goto } from "$app/navigation";
import { api } from "$lib/api";
import { decryptToken, dekFromBase64, bytesFromApi } from "$lib/crypto";
import { APP_NAMESPACE } from "$lib/shared/constants";
import { Route, type IUser, type TSyncType } from "$lib/shared/types";
import { SvelteMap } from "svelte/reactivity";
import { posts } from "$lib/stores/posts.svelte";
import { prefs } from "$lib/stores/prefs.svelte";
import { projects } from "$lib/stores/projects.svelte";
import { syncer } from "$lib/stores/syncer.svelte";
import { syncStatus } from "$lib/stores/syncStatus.svelte";

const DEK_KEY = `${APP_NAMESPACE}_dek`;

export const currentUser = $state<{ value: IUser | null }>({ value: null });
export const isAuthenticated = $state<{ value: boolean }>({ value: false });
export const dek = $state<{ value: Uint8Array | null }>({ value: null });

export const gitTokenCache = new SvelteMap<string, string>();

export async function ensureGitToken(
  projectId: string,
): Promise<string | null> {
  if (gitTokenCache.has(projectId)) {
    return gitTokenCache.get(projectId)!;
  }

  try {
    const result = await api.projects.getSecret(projectId);
    const dekVal = getDEK();
    const ciphertext = bytesFromApi(result.ciphertext);
    const iv = bytesFromApi(result.iv);
    const token = await decryptToken(ciphertext, iv, dekVal);
    gitTokenCache.set(projectId, token);
    return token;
  } catch (err) {
    console.warn(`[auth] failed to fetch git token for ${projectId}:`, err);
    return null;
  }
}

let initPromise: Promise<void> | null = null;

async function init() {
  try {
    const me = await api.auth.me();
    if (!me) {
      currentUser.value = null;
      isAuthenticated.value = false;
      return;
    }

    const stored = sessionStorage.getItem(DEK_KEY);
    if (!stored) {
      await api.auth.logout();
      currentUser.value = null;
      isAuthenticated.value = false;
      dek.value = null;
      return;
    }

    dek.value = dekFromBase64(stored);
    currentUser.value = { id: me.id, username: me.username };
    isAuthenticated.value = true;
  } catch {
    currentUser.value = null;
    isAuthenticated.value = false;
    dek.value = null;
  }
}

export function ensureInit() {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}

export function getDEK(): Uint8Array {
  if (!dek.value) throw new Error("DEK not available — please log in again");
  return dek.value;
}

export async function logout() {
  try {
    await api.auth.logout();
  } finally {
    syncer.stop();
    sessionStorage.removeItem(DEK_KEY);
    gitTokenCache.clear();
    currentUser.value = null;
    isAuthenticated.value = false;
    dek.value = null;
    posts.value = [];
    projects.value = [];
    syncStatus.clear();
    prefs.value = { syncType: "api" as TSyncType, proxyUrl: "" };
    goto(Route.LOGIN, { replaceState: true });
  }
}
