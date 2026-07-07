<script lang="ts">
  import { goto, replaceState, afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { getProject } from "$lib/stores/projects.svelte";
  import { syncer, loadPosts } from "$lib/stores/syncer.svelte";
  import { syncStatus } from "$lib/stores/syncStatus.svelte";
  import { dbGetPost, dbSavePost } from "$lib/db";
  import {
    ESyncState,
    type ILoadPostsOpts,
    type IPostRecord,
  } from "$lib/shared/types";
  import { POSTS_PAGE_SIZE } from "$lib/shared/constants";
  import { today } from "$lib/shared/utils";
  import FloatingButton from "$lib/components/FloatingButton.svelte";
  import EditTokenModal from "$lib/components/EditTokenModal.svelte";
  import { FilePlus, ChevronLeft, ChevronRight, Wrench } from "@lucide/svelte";

  const projectId = page.params.projectId!;

  console.log(`[/:projectId] mounted: ${projectId}`);

  const currentPage = $derived.by(() => {
    const n = Number(page.url.searchParams.get("page") ?? "1");
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  let posts = $state<IPostRecord[]>([]);

  let loadPostsController: AbortController | null = null;

  async function loadPage(opts: ILoadPostsOpts = {}) {
    loadPostsController?.abort();
    const controller = new AbortController();
    loadPostsController = controller;

    const records = await loadPosts(projectId, opts);
    if (controller.signal.aborted) return;
    posts = records;
  }

  onMount(async () => {
    // populate cached posts
    posts = await loadPosts(projectId, {
      pullOption: "never",
      page: currentPage,
    });
    // load posts from pull
    console.log(`[/:projectId] onMount: loading posts`);
    await loadPage({ pullOption: "always", page: currentPage });
  });

  onMount(() => {
    // update posts list after a sync
    const unsubAfterSync = syncer.addAfterSyncHook((hookProjectId) => {
      if (hookProjectId !== projectId) return;
      // just synced, no need to sync again, if not it'll be infinite
      void loadPage({ pullOption: "never", page: currentPage });
    });
    return unsubAfterSync;
  });

  afterNavigate(() => {
    void loadPage({ pullOption: "check", page: currentPage });
  });

  let retrying = $state(false);
  let retryError = $state("");
  let editingToken = $state(false);

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
      page: false,
      body: "",
      extra: {},
      dirty: 0,
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
      await loadPage({ pullOption: "always", page: currentPage });
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
  <div class="-mt-2 mb-4">
    <button
      class="btn-secondary text-muted-foreground text-sm shrink-0 p-2 px-3 rounded-full"
      onclick={() => {
        editingToken = true;
      }}
    >
      <Wrench class="icon" /> Edit
    </button>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <button
      class="hidden md:flex card border-dashed border-2 border-muted-foreground/30 hover:border-primary/50 flex-col items-center justify-center gap-2 p-6 text-muted-foreground hover:text-primary transition-colors cursor-pointer min-h-[120px]"
      onclick={handleCreate}
    >
      <FilePlus class="icon w-6 h-6" />
      <span class="text-sm font-medium">New Post</span>
    </button>

    {#if posts.length === 0 && syncStatus.get(projectId)?.state !== ESyncState.SYNCING_PULL}
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
      {#each posts.filter((p) => !p.deleted) as post (post.id)}
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
                  class="text-xs h-6 w-5 font-serif italic aspect-square px-1.5 py-1 bg-muted-foreground/10 absolute top-0 right-0 bevel z-5 rounded-bl"
                >
                  d
                </span>
              {/if}
              {#if post.page}
                <span
                  title="Page"
                  class="text-xs h-6 w-5 font-serif italic aspect-square px-1.5 py-1 bg-muted-foreground/10 absolute top-0 bevel z-5 rounded-bl {!post.draft
                    ? 'right-0'
                    : 'right-6 rounded-br'}"
                >
                  p
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

  {#if currentPage > 1 || posts.length === POSTS_PAGE_SIZE}
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
        disabled={posts.length < POSTS_PAGE_SIZE}
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

  {#if projectEntry}
    <EditTokenModal
      projectId={projectEntry.id}
      show={editingToken}
      onclose={() => {
        editingToken = false;
      }}
    />
  {/if}
{:else}
  <p class="text-muted-foreground mt-4">Checking repository...</p>
{/if}
