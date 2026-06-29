import { Syncer } from "$lib/sync/syncer";
import { prefs } from "$lib/stores/prefs.svelte";
import { projects, getProject } from "$lib/stores/projects.svelte";
import { posts } from "$lib/stores/posts.svelte";
import { dbGetPosts, dbSaveProject } from "$lib/db";
import { SvelteMap } from "svelte/reactivity";
import { type ISyncStatus } from "$lib/shared/types";
import { setProjectCommitTime } from "$lib/stores/recentProject.svelte";

export const syncStatus = new SvelteMap<string, ISyncStatus>();

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

export async function loadPosts(
  projectId: string,
  forcePull = false,
): Promise<void> {
  const dbPosts = await dbGetPosts(projectId);
  if (dbPosts.length > 0) {
    posts.value = dbPosts.sort((a, b) => b.id.localeCompare(a.id));
  }

  const project = getProject(projectId);
  if (!project) {
    console.error(`[loadPosts] project not found: ${projectId}`);
    return;
  }

  const syncTypeChanged =
    project.syncType !== undefined && project.syncType !== prefs.value.syncType;
  const shouldPull = forcePull || syncTypeChanged;

  console.log(
    `[loadPosts] ${projectId}: cached=${dbPosts.length} syncTypeChanged=${syncTypeChanged} shouldPull=${shouldPull}`,
  );

  if (shouldPull) {
    await syncer.pull(project);
    const dbPostsAfterPull = await dbGetPosts(projectId);
    if (dbPostsAfterPull.length > 0) {
      posts.value = dbPostsAfterPull.sort((a, b) => b.id.localeCompare(a.id));
    }
    console.log(`[loadPosts] ${projectId}: using pulled posts`);
  } else {
    console.log(`[loadPosts] ${projectId}: using cached, no pull`);
  }

  if (syncTypeChanged) {
    project.syncType = prefs.value.syncType;
    await dbSaveProject(project);
  }
}
