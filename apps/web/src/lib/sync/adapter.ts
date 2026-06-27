import type {
  IProject,
  IUserPreferences,
  ISyncAdapter,
} from "$lib/shared/types";

export async function createSyncAdapter(
  project: IProject,
  prefs: IUserPreferences,
): Promise<ISyncAdapter> {
  if (prefs.syncType === "api") {
    const { ApiAdapter } = await import("./api-adapter");
    return new ApiAdapter(project.repoUrl);
  }
  const { GitAdapter } = await import("./git-adapter");
  return new GitAdapter(project.repoUrl, prefs.proxyUrl || undefined);
}
