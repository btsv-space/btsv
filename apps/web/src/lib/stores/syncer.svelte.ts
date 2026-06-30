import { Syncer } from "$lib/sync/syncer";
import { prefs } from "$lib/stores/prefs.svelte";
import { projects, getProject } from "$lib/stores/projects.svelte";
import { posts } from "$lib/stores/posts.svelte";
import { dbGetPost, dbGetPosts, dbSaveProject } from "$lib/db";
import { type ILoadPostsOpts, type IPostRecord } from "$lib/shared/types";
import { POSTS_PAGE_SIZE } from "$lib/shared/constants";
import { setProjectCommitTime } from "$lib/stores/recentProject.svelte";
import { syncStatus } from "$lib/stores/syncStatus.svelte";

export const syncer = new Syncer({
  getPrefs: () => prefs.value,
  getProjects: () => projects.value,
  onSyncStatus: (pid, status) => {
    syncStatus.set(pid, status);
  },
});

syncer.addAfterSyncHook((projectId, _postId, syncedPost, lastCommitTime) => {
  if (projectId != null && syncedPost != null) {
    const idx = posts.value.findIndex((p) => p.id === syncedPost.id);
    if (idx >= 0) {
      posts.value[idx] = syncedPost;
    }
  }
  if (projectId != null && lastCommitTime != null) {
    setProjectCommitTime(projectId, lastCommitTime);
  }
});

const defaultLoadPostsOpts = {
  forcePull: false,
  page: 1,
  pageSize: POSTS_PAGE_SIZE,
} satisfies ILoadPostsOpts;

let loadPostsController: AbortController | null = null;

export async function loadPosts(
  projectId: string,
  opts: ILoadPostsOpts = {},
): Promise<void> {
  loadPostsController?.abort();
  const controller = new AbortController();
  loadPostsController = controller;

  const { forcePull, page, pageSize } = { ...defaultLoadPostsOpts, ...opts };
  const offset = (page - 1) * pageSize;

  const project = getProject(projectId);
  if (!project) {
    console.error(`[loadPosts] project not found: ${projectId}`);
    return;
  }

  const getPostsPage = async () => {
    const records = await dbGetPosts(projectId, { limit: pageSize, offset });
    // this avoids stale concurrent calls from mutating the posts store
    if (controller.signal.aborted) return;
    posts.value = records;
  };

  // Pre-pull posts population to prevent UI blink
  await getPostsPage();

  const syncTypeChanged =
    project.syncType !== undefined && project.syncType !== prefs.value.syncType;
  const shouldPull = forcePull || syncTypeChanged;
console.log(
    `[loadPosts] ${projectId}: page=${page} cached=${posts.value.length} shouldPull=${shouldPull}`,
  );

  if (shouldPull) {
    await syncer.pull(project);
    // Post-pull posts population to return fresh posts
    await getPostsPage();
    console.log(`[loadPosts] ${projectId}: page=${page} using pulled posts`);
  } else {
    console.log(`[loadPosts] ${projectId}: page=${page} using cached, no pull`);
  }

  if (syncTypeChanged) {
    project.syncType = prefs.value.syncType;
    await dbSaveProject(project);
  }
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
