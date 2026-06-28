import type { TProjectEntry } from "$lib/shared/types";

export const projects = $state<{ value: TProjectEntry[] }>({ value: [] });

export function getProject(projectId: string): TProjectEntry | undefined {
  return projects.value.find((p) => p.id === projectId);
}
