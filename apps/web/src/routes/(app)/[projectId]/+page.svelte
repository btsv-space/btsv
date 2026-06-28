<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { getProject } from "$lib/stores/projects.svelte";
  import { posts } from "$lib/stores/posts.svelte";
  import { loadPosts } from "$lib/stores/syncer.svelte";
  import { syncStatus } from "$lib/stores/syncer.svelte";
  import { dbGetPost, dbSavePost } from "$lib/db";
  import { SyncState, type IPostRecord } from "$lib/shared/types";
  import { today } from "$lib/shared/utils";
  import FloatingButton from "$lib/components/FloatingButton.svelte";
  import { FilePlus } from "@lucide/svelte";

  const projectId = page.params.projectId!;

  console.log(`[/:projectId] mounted: ${projectId}`);

  onMount(async () => {
    console.log(`[/:projectId] onMount: loading posts`);
    await loadPosts(projectId, true);
  });

  let retrying = $state(false);
  let retryError = $state("");

  const entry = $derived(getProject(projectId));

  function formatTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}${pad(Math.floor(date.getUTCMilliseconds() / 10))}`;
  }

  async function generateUniquePostId(projectId: string): Promise<string> {
    const base = Date.now();
    let id = formatTimestamp(new Date(base));
    for (let attempt = 0; await dbGetPost(projectId, id); attempt++) {
      id = formatTimestamp(new Date(base + attempt * 10));
    }
    return id;
  }

  async function createPost(projectId: string): Promise<{ id: string }> {
    const id = await generateUniquePostId(projectId);
    const todayStr = today();

    const record: IPostRecord = {
      projectId,
      id,
      slug: "",
      title: "",
      dateCreated: todayStr,
      dateUpdated: todayStr,
      description: "",
      tags: [],
      draft: true,
      body: "",
      extra: {},
      dirty: false,
    };

    await dbSavePost(record);
    posts.value = [record, ...posts.value];

    return { id };
  }

  async function handleRetry() {
    retrying = true;
    retryError = "";
    if (!entry) {
      retrying = false;
      return;
    }

    entry.status = "cloning";
    entry.error = "";
    try {
      await loadPosts(entry.id, true);
      entry.status = "ready";
    } catch (err) {
      entry.status = "error";
      entry.error = err instanceof Error ? err.message : "Clone failed";
      retryError = entry.error;
    }

    retrying = false;
  }

  async function handleCreate() {
    const { id } = await createPost(projectId);
    goto(`/${projectId}/${id}`);
  }

  function openPost(id: string) {
    goto(`/${projectId}/${id}`);
  }
</script>

{#if !entry}
  <p class="text-muted-foreground mt-4">Loading project...</p>
{:else if entry.status === "cloning"}
  <p class="text-muted-foreground mt-4">Cloning repository...</p>
{:else if entry.status === "error"}
  <div class="card bg-destructive/5 border-destructive/20 mt-6">
    <p class="font-semibold text-destructive m-0 mb-2">Clone failed</p>
    <p class="text-sm text-muted-foreground m-0 mb-3 font-mono">
      {entry.error}
    </p>
    {#if retryError}
      <p class="text-sm text-muted-foreground m-0 mb-3 font-mono">
        {retryError}
      </p>
    {/if}
    <button class="btn-primary" onclick={handleRetry} disabled={retrying}>
      {retrying ? "Retrying..." : "Retry Clone"}
    </button>
  </div>
{:else if entry.status === "ready"}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <button
      class="hidden md:flex card border-dashed border-2 border-muted-foreground/30 hover:border-primary/50 flex-col items-center justify-center gap-2 p-6 text-muted-foreground hover:text-primary transition-colors cursor-pointer min-h-[120px]"
      onclick={handleCreate}
    >
      <FilePlus class="icon w-6 h-6" />
      <span class="text-sm font-medium">New Post</span>
    </button>

    {#if posts.value.length === 0 && syncStatus.get(projectId)?.state !== SyncState.SYNCING_PULL}
      <p class="text-muted-foreground col-span-full">
        No posts yet. Create your first post to get started.
      </p>
    {:else}
      {#each posts.value as post (post.id)}
        <div
          class="card cursor-pointer hover:border-muted-foreground/50"
          role="button"
          tabindex="0"
          onclick={() => openPost(post.id)}
          onkeydown={(e) => e.key === "Enter" && openPost(post.id)}
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="text-base font-semibold m-0">
                {post.title || (post.draft ? "Untitled" : post.id)}
              </h3>
              {#if post.dirty}
                <span
                  class="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                  title="Unsaved changes"
                ></span>
              {/if}
            </div>
            <p
              class="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap"
            >
              <span>{post.datePublished}</span>
              {#if post.draft}
                <span
                  class="text-xs font-semibold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/12 text-amber-600"
                >
                  Draft
                </span>
              {/if}
              {#if post.tags.length > 0}
                <span class="text-primary">{post.tags.join(", ")}</span>
              {/if}
            </p>
            {#if post.description}
              <p class="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {post.description}
              </p>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <FloatingButton class="md:hidden" onclick={handleCreate}>
    <FilePlus class="icon" /> New Post
  </FloatingButton>
{:else}
  <p class="text-muted-foreground mt-4">Checking repository...</p>
{/if}
