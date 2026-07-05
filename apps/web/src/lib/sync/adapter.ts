import type {
  IProject,
  IUserPreferences,
  ISyncAdapter,
} from "$lib/shared/types";

export async function createSyncAdapter(
  project: IProject,
  userPrefs: IUserPreferences,
): Promise<ISyncAdapter> {
  if (userPrefs.syncType === "api") {
    const { ApiAdapter } = await import("./api-adapter");
    return new ApiAdapter(project.repoUrl);
  }
  const { GitAdapter } = await import("./git-adapter");
  return new GitAdapter(project.repoUrl, userPrefs.proxyUrl || undefined);
}
