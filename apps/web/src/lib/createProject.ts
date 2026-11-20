import { dbSaveProject } from "$lib/db";
import { saveGitToken } from "$lib/secrets";
import { projects, getProject } from "$lib/stores/projects.svelte";
import { syncer } from "$lib/stores/syncer.svelte";
import type { TProjectEntry } from "$lib/shared/types";

export interface ICreateProjectInput {
  repoUrl: string;
  pat: string;
  name?: string;
}

export type TCreateProjectResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export function generateProjectId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createProjectFromRepo(
  input: ICreateProjectInput,
): Promise<TCreateProjectResult> {
  const displayName =
    input.name?.trim() ||
    input.repoUrl.split("/").pop()?.replace(".git", "") ||
    "untitled";

  const project: TProjectEntry = {
    id: generateProjectId(),
    name: displayName,
    repoUrl: input.repoUrl,
    status: "cloning",
    error: "",
  };

  projects.value = [project, ...projects.value];

  try {
    await saveGitToken(project.id, input.pat);
    await dbSaveProject(project);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save project",
    };
  }

  const entry = getProject(project.id);
  if (!entry) return { ok: false, error: "Failed to save project" };

  try {
    await syncer.initialPull(entry, input.pat);
    entry.status = "ready";
    await dbSaveProject(entry);
    return { ok: true, id: project.id };
  } catch (err) {
    entry.status = "error";
    entry.error = err instanceof Error ? err.message : "Clone failed";
    await dbSaveProject(entry);
    return { ok: false, error: entry.error };
  }
}
