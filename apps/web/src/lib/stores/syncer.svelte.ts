import { Syncer } from "$lib/sync/syncer";
import { prefs } from "$lib/stores/prefs.svelte";
import {
  projects,
  getProject,
  ensureProjectsHydrated,
} from "$lib/stores/projects.svelte";
import { dbGetPost, dbGetPosts } from "$lib/db";
import { type ILoadPostsOpts, type IPostRecord } from "$lib/shared/types";
import { POSTS_PAGE_SIZE } from "$lib/shared/constants";
import { projectCommits } from "$lib/stores/projectCommits.svelte";
import { syncStatus } from "$lib/stores/syncStatus.svelte";
import { getCurrentSaver } from "$lib/stores/currentSaver";

export const canSync = { value: false };

export const syncer = new Syncer({
  getPrefs: () => prefs,
  getProjects: () => projects.value,
  canSync: () => canSync.value,
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
    projectCommits.set(projectId, lastCommitTime);
  }
});

const defaultLoadPostsOpts = {
  pullOption: "check",
  page: 1,
  pageSize: POSTS_PAGE_SIZE,
} satisfies ILoadPostsOpts;

// The post-loading paths need the projects store hydrated before reading it
// (a full page reload would otherwise race ahead of the IDB hydration and
// return empty results).
async function ensureStoresReady(): Promise<void> {
  await ensureProjectsHydrated();
}

export async function loadPosts(
  projectId: string,
  opts: ILoadPostsOpts = {},
): Promise<IPostRecord[]> {
  await ensureStoresReady();
  const { pullOption, page, pageSize, listPrefs } = {
    ...defaultLoadPostsOpts,
    ...opts,
  };
  const offset = (page - 1) * pageSize;

  const project = getProject(projectId);
  if (!project) {
    console.error(`[loadPosts] project not found: ${projectId}`);
    return [];
  }

  const shouldPull = pullOption === "always";

  if (shouldPull) {
    await syncer.pull(project);
    console.log(`[loadPosts] ${projectId}: page=${page} using pulled posts`);
  } else {
    console.log(`[loadPosts] ${projectId}: page=${page} using cached, no pull`);
  }

  return await dbGetPosts(projectId, { limit: pageSize, offset, listPrefs });
}

export async function loadPost(
  projectId: string,
  postId: string,
  opts: { forcePull?: boolean } = {},
): Promise<IPostRecord | null> {
  await ensureStoresReady();
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
