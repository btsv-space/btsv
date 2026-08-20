import type { TProjectEntry } from "$lib/shared/types";
import { checkProjectDirExists } from "$lib/fs";
import { dbGetProjects } from "$lib/db";

export const projects = $state<{ value: TProjectEntry[] }>({ value: [] });

export function getProject(projectId: string): TProjectEntry | undefined {
  return projects.value.find((p) => p.id === projectId);
}

export async function projectEntryWithStatus(
  p: { id: string } & Partial<TProjectEntry>,
): Promise<TProjectEntry> {
  const dirExists = await checkProjectDirExists(p.id);
  // storedRemoteSha = a completed pull/push (the api-sync ready signal);
  // lets a returning API-sync project skip the clone loop on reload
  const pulled = p.storedRemoteSha != null;
  console.log(
    `[projects] projectEntryWithStatus: ${p.id} dirExists=${dirExists} pulled=${pulled}`,
  );
  return {
    ...p,
    status: dirExists || pulled ? "ready" : "unknown",
    error: "",
  } as TProjectEntry;
}

async function hydrateFromCache(): Promise<void> {
  try {
    const cached = await dbGetProjects();
    if (cached.length > 0) {
      projects.value = await Promise.all(
        cached.map((p) => projectEntryWithStatus(p)),
      );
    }
  } catch (err) {
    console.error("[projects] failed to hydrate from cache:", err);
  }
}

let pendingHydration: Promise<void> | null = null;

export function ensureProjectsHydrated(): Promise<void> {
  if (pendingHydration) return pendingHydration;
  if (projects.value.length > 0) return Promise.resolve();
  pendingHydration = hydrateFromCache().finally(() => {
    pendingHydration = null;
  });
  return pendingHydration;
}
