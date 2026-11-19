import type { IProject, ISyncAdapter } from "$lib/shared/types";

export async function createSyncAdapter(
  project: IProject,
): Promise<ISyncAdapter> {
  const { ApiAdapter } = await import("./api-adapter");
  return new ApiAdapter(project.repoUrl);
}
