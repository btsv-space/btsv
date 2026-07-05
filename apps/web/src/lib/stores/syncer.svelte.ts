import { Syncer } from "$lib/sync/syncer";
import { prefs } from "$lib/stores/prefs.svelte";
import { projects, getProject } from "$lib/stores/projects.svelte";
import { dbGetPost, dbGetPosts, dbSaveProject } from "$lib/db";
import { type ILoadPostsOpts, type IPostRecord } from "$lib/shared/types";
import { POSTS_PAGE_SIZE } from "$lib/shared/constants";
import { setProjectCommitTime } from "$lib/stores/recentProject";
import { syncStatus } from "$lib/stores/syncStatus.svelte";
import { getCurrentSaver } from "$lib/stores/currentSaver";

export const syncer = new Syncer({
  getPrefs: () => prefs.value,
  getProjects: () => projects.value,
  isPostEditing: (projectId, postId) => {
    const currentSaver = getCurrentSaver();
    return (
      currentSaver?.projectId === projectId && currentSaver?.postId === postId
    );
  },
  onSyncStatus: (projectId, status, dirtyOverride) => {
    syncStatus.setStateAndMsg(projectId, status);
    syncStatus.updateDirty(projectId, dirtyOverride);
  },
});

syncer.addAfterSyncHook((projectId, postId, syncedPost, lastCommitTime) => {
  if (projectId != null && lastCommitTime != null) {
    setProjectCommitTime(projectId, lastCommitTime);
  }
});

const defaultLoadPostsOpts = {
  forcePull: false,
  page: 1,
  pageSize: POSTS_PAGE_SIZE,
} satisfies ILoadPostsOpts;

export async function loadPosts(
  projectId: string,
  opts: ILoadPostsOpts = {},
): Promise<IPostRecord[]> {
  const { forcePull, page, pageSize } = { ...defaultLoadPostsOpts, ...opts };
  const offset = (page - 1) * pageSize;

  const project = getProject(projectId);
  if (!project) {
    console.error(`[loadPosts] project not found: ${projectId}`);
    return [];
  }

  const syncTypeChanged =
    project.syncType !== undefined && project.syncType !== prefs.value.syncType;
  const shouldPull = forcePull || syncTypeChanged;

  if (shouldPull) {
    await syncer.pull(project);
    console.log(`[loadPosts] ${projectId}: page=${page} using pulled posts`);
  } else {
    console.log(`[loadPosts] ${projectId}: page=${page} using cached, no pull`);
  }

  if (syncTypeChanged) {
    project.syncType = prefs.value.syncType;
    await dbSaveProject(project);
  }

  return await dbGetPosts(projectId, { limit: pageSize, offset });
}

export async function loadPost(
  projectId: string,
  postId: string,
  opts: { forcePull?: boolean } = {},
): Promise<IPostRecord | null> {
  if (opts.forcePull) {
    const project = getProject(projectId);
    if (project) {
      try {
        await syncer.pull(project);
      } catch (err) {
        console.warn(`[loadPost] pull failed for ${projectId}/${postId}:`, err);
      }
    }
  }
  return (await dbGetPost(projectId, postId)) ?? null;
}
