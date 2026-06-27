import { Syncer } from "$lib/sync/syncer";
import { prefs } from "$lib/stores/prefs.svelte";
import { projects } from "$lib/stores/projects.svelte";
import { posts } from "$lib/stores/posts.svelte";
import { dbGetPosts, dbSaveProject } from "$lib/db";
import { SvelteMap } from "svelte/reactivity";
import { SyncState } from "$lib/shared/types";
import { setProjectCommitTime } from "$lib/stores/recentProject.svelte";

export const syncStates = new SvelteMap<string, SyncState>();
export const syncErrors = new SvelteMap<string, string>();

export const syncer = new Syncer({
  getPrefs: () => prefs.value,
  getProjects: () => projects.value,
  onStateChange: (pid, state) => {
    syncStates.set(pid, state);
  },
  onError: (pid, err) => {
    syncErrors.set(pid, err);
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
  const cached = await dbGetPosts(projectId);
  if (cached.length > 0) {
    posts.value = cached.sort((a, b) => b.id.localeCompare(a.id));
  }

  const project = projects.value.find((p) => p.id === projectId);
  if (!project) {
    console.error(`[loadPosts] project not found: ${projectId}`);
    return;
  }

  const syncTypeChanged =
    project.syncType !== undefined && project.syncType !== prefs.value.syncType;
  const shouldPull = forcePull || syncTypeChanged;

  console.log(
    `[loadPosts] ${projectId}: cached=${cached.length} syncTypeChanged=${syncTypeChanged} shouldPull=${shouldPull}`,
  );

  if (shouldPull) {
    console.log(`[loadPosts] ${projectId}: pulling...`);
    const parsed = await syncer.pull(project);
    if (parsed.length > 0) {
      posts.value = parsed.sort((a, b) => b.id.localeCompare(a.id));
    }
    console.log(
      `[loadPosts] ${projectId}: pull returned ${parsed.length} posts`,
    );
  } else {
    console.log(`[loadPosts] ${projectId}: using cached, no pull`);
  }

  if (syncTypeChanged) {
    project.syncType = prefs.value.syncType;
    await dbSaveProject({ ...project });
  }
}
