<script lang="ts">
  import { goto, replaceState, afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { getProject } from "$lib/stores/projects.svelte";
  import { posts } from "$lib/stores/posts.svelte";
  import { loadPosts } from "$lib/stores/syncer.svelte";
  import { syncStatus } from "$lib/stores/syncStatus.svelte";
  import { dbGetPost, dbSavePost } from "$lib/db";
  import { SyncState, type IPostRecord } from "$lib/shared/types";
  import { POSTS_PAGE_SIZE } from "$lib/shared/constants";
  import { today } from "$lib/shared/utils";
  import FloatingButton from "$lib/components/FloatingButton.svelte";
  import { FilePlus, ChevronLeft, ChevronRight } from "@lucide/svelte";

  const projectId = page.params.projectId!;

  console.log(`[/:projectId] mounted: ${projectId}`);

  const currentPage = $derived(
    Math.max(1, Number(page.url.searchParams.get("page") ?? "1")),
  );

  onMount(async () => {
    console.log(`[/:projectId] onMount: loading posts`);
    await loadPosts(projectId, { forcePull: true, page: currentPage });
  });

  afterNavigate(() => {
    void loadPosts(projectId, { forcePull: false, page: currentPage });
  });

  let retrying = $state(false);
  let retryError = $state("");

  const projectEntry = $derived(getProject(projectId));

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

    const newPost: IPostRecord = {
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

    await dbSavePost(newPost);

    return { id };
  }

  async function handleRetry() {
    retrying = true;
    retryError = "";
    if (!projectEntry) {
      retrying = false;
      return;
    }

    projectEntry.status = "cloning";
    projectEntry.error = "";
    try {
      await loadPosts(projectEntry.id, {
        forcePull: true,
        page: currentPage,
      });
      projectEntry.status = "ready";
    } catch (err) {
      projectEntry.status = "error";
      projectEntry.error = err instanceof Error ? err.message : "Clone failed";
      retryError = projectEntry.error;
    }

    retrying = false;
  }

  async function handleCreate() {
    const { id } = await createPost(projectId);
    replaceState(`/${projectId}?page=1`, {});
    await goto(`/${projectId}/${id}`);
  }

  function openPost(id: string) {
    goto(`/${projectId}/${id}`);
  }

  function changePage(newPage: number) {
    if (newPage < 1) return;
    goto(`/${projectId}?page=${newPage}`);
  }
</script>

{#if !projectEntry}
  <p class="text-muted-foreground mt-4">Loading project...</p>
{:else if projectEntry.status === "cloning"}
  <p class="text-muted-foreground mt-4">Cloning repository...</p>
{:else if projectEntry.status === "error"}
  <div class="card bg-destructive/5 border-destructive/20 mt-6">
    <p class="font-semibold text-destructive m-0 mb-2">Clone failed</p>
    <p class="text-sm text-muted-foreground m-0 mb-3 font-mono">
      {projectEntry.error}
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
{:else if projectEntry.status === "ready"}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <button
      class="hidden md:flex card border-dashed border-2 border-muted-foreground/30 hover:border-primary/50 flex-col items-center justify-center gap-2 p-6 text-muted-foreground hover:text-primary transition-colors cursor-pointer min-h-[120px]"
      onclick={handleCreate}
    >
      <FilePlus class="icon w-6 h-6" />
      <span class="text-sm font-medium">New Post</span>
    </button>

    {#if posts.value.length === 0 && syncStatus.get(projectId)?.state !== SyncState.SYNCING_PULL}
      {#if currentPage > 1}
        <p class="text-muted-foreground col-span-full">
          No posts on this page.
          <button
            class="text-primary underline ml-1"
            onclick={() => changePage(1)}>Go to page 1</button
          >
        </p>
      {:else}
        <p class="text-muted-foreground col-span-full">
          No posts yet. Create your first post to get started.
        </p>
      {/if}
    {:else}
      {#each posts.value as post (post.id)}
        <div
          class="card cursor-pointer hover:border-muted-foreground/50 relative overflow-hidden"
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
              {#if !post.draft}
                {#if post.datePublished}
                  <span>{post.datePublished}</span>
                {/if}
              {:else}
                <span
                  title="Draft"
                  class="text-xs font-serif italic aspect-square px-1.5 py-1 bg-muted-foreground/10 absolute top-0 right-0 bevel z-5 rounded-bl"
                >
                  d
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

  {#if currentPage > 1 || posts.value.length === POSTS_PAGE_SIZE}
    <div class="flex items-center justify-center gap-2 mt-6">
      <button
        class="btn-outline rounded-full disabled:opacity-30"
        onclick={() => changePage(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft class="icon" />
      </button>
      <span class="text-sm text-muted-foreground px-2">Page {currentPage}</span>
      <button
        class="btn-outline rounded-full disabled:opacity-30"
        onclick={() => changePage(currentPage + 1)}
        disabled={posts.value.length < POSTS_PAGE_SIZE}
        aria-label="Next page"
      >
        <ChevronRight class="icon" />
      </button>
    </div>
  {/if}

  <div class="h-16"></div>

  <FloatingButton class="md:hidden" onclick={handleCreate}>
    <FilePlus class="icon" /> New Post
  </FloatingButton>
{:else}
  <p class="text-muted-foreground mt-4">Checking repository...</p>
{/if}
