import { goto } from "$app/navigation";
import { api } from "$lib/api";
import {
  decryptToken,
  dekFromBase64,
  dekToBase64,
  bytesFromApi,
} from "$lib/crypto";
import { AUTH_STORAGE_KEY } from "$lib/shared/constants";
import {
  ERoute,
  type IUser,
  type IStoredAuth,
  type TSyncType,
} from "$lib/shared/types";
import { SvelteMap } from "svelte/reactivity";
import { prefs } from "$lib/stores/prefs.svelte";
import { projects } from "$lib/stores/projects.svelte";
import { syncer } from "$lib/stores/syncer.svelte";
import { syncStatus } from "$lib/stores/syncStatus.svelte";

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

function readStoredAuth(): IStoredAuth | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IStoredAuth;
  } catch {
    return null;
  }
}

function writeStoredAuth(dekValue: Uint8Array, user: IUser | null): void {
  if (typeof localStorage === "undefined") return;
  const payload: IStoredAuth = {
    dek: dekToBase64(dekValue),
    user,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

function clearStoredAuth(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function resetAuth(): void {
  clearStoredAuth();
  currentUser.value = null;
  isAuthenticated.value = false;
  dek.value = null;
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && /fetch|network/i.test(err.message);
}

let initPromise: Promise<void> | null = null;

async function init() {
  const stored = readStoredAuth();

  // nothing stored locally — the user logged out
  if (!stored) return resetAuth();

  // restore the DEK from localStorage so local crypto can work.
  try {
    dek.value = dekFromBase64(stored.dek);
  } catch {
    return resetAuth();
  }

  let user: IUser | null = stored.user;

  // check the session with the server when online.
  try {
    const me = await api.auth.me();
    // server says not authenticated (shouldn't normally reach here because
    // the middleware returns 401, but handle it defensively).
    if (!me) return resetAuth();
    user = me;
    writeStoredAuth(dek.value, user);
  } catch (err) {
    // session expired or another non-network error — force re-login.
    if (!isNetworkError(err)) return resetAuth();
    // offline — fall through and trust the locally stored credentials.
  }

  currentUser.value = user;
  isAuthenticated.value = true;
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

export function persistAuth(user: IUser, dekValue: Uint8Array): void {
  dek.value = dekValue;
  currentUser.value = user;
  isAuthenticated.value = true;
  writeStoredAuth(dekValue, user);
}

export async function logout() {
  try {
    await api.auth.logout();
  } finally {
    syncer.stop();
    resetAuth();
    gitTokenCache.clear();
    projects.value = [];
    syncStatus.clear();
    prefs.value = { syncType: "api" as TSyncType, proxyUrl: "" };
    goto(ERoute.LOGIN, { replaceState: true });
  }
}
