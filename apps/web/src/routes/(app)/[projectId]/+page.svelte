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
    type IPostsListPrefs,
    type TDraftFilter,
    type TPageFilter,
    type TPostSortField,
  } from "$lib/shared/types";
  import { POSTS_PAGE_SIZE } from "$lib/shared/constants";
  import { now, formatPostDate } from "$lib/shared/utils";
  import { postsListPrefs } from "$lib/stores/postsListPrefs.svelte";
  import { DEFAULT_LIST_PREFS, isDefaultListPrefs } from "$lib/postsList";
  import FloatingButton from "$lib/components/FloatingButton.svelte";
  import EditTokenModal from "$lib/components/EditTokenModal.svelte";
  import Popover from "$lib/components/Popover.svelte";
  import {
    FilePlus,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Wrench,
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
  } from "@lucide/svelte";

  const projectId = page.params.projectId!;

  console.log(`[/:projectId] mounted: ${projectId}`);

  const currentPage = $derived.by(() => {
    const n = Number(page.url.searchParams.get("page") ?? "1");
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  let posts = $state<IPostRecord[]>([]);
  let postsLoaded = $state(false);

  const listPrefs = $derived(postsListPrefs.get(projectId));
  let optionsOpen = $state(false);

  const selectClass =
    "bg-background border border-border rounded-full text-sm pl-3 pr-8 py-1.5 cursor-pointer appearance-none";

  let loadPostsController: AbortController | null = null;

  async function loadPage(opts: ILoadPostsOpts = {}) {
    loadPostsController?.abort();
    const controller = new AbortController();
    loadPostsController = controller;

    const records = await loadPosts(projectId, { ...opts, listPrefs });
    if (controller.signal.aborted) return;
    posts = records;
  }

  function onPrefsChange(next: IPostsListPrefs) {
    postsListPrefs.set(projectId, next);
    if (currentPage > 1) {
      goto(`/${projectId}?page=1`); // afterNavigate reloads
    } else {
      void loadPage({ pullOption: "never", page: 1 });
    }
  }

  function onSortFieldChange(e: Event) {
    onPrefsChange({
      ...listPrefs,
      sort: (e.target as HTMLSelectElement).value as TPostSortField,
    });
  }

  function onToggleSortOrder() {
    onPrefsChange({
      ...listPrefs,
      order: listPrefs.order === "desc" ? "asc" : "desc",
    });
  }

  function onDraftFilterChange(e: Event) {
    onPrefsChange({
      ...listPrefs,
      draft: (e.target as HTMLSelectElement).value as TDraftFilter,
    });
  }

  function onPageFilterChange(e: Event) {
    onPrefsChange({
      ...listPrefs,
      page: (e.target as HTMLSelectElement).value as TPageFilter,
    });
  }

  function clearFilters() {
    onPrefsChange({ ...listPrefs, draft: "all", page: "all" });
  }

  onMount(async () => {
    // populate cached posts
    posts = await loadPosts(projectId, {
      pullOption: "never",
      page: currentPage,
      listPrefs,
    });
    postsLoaded = true;
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
    const makeId = () => {
      const rand = Math.random().toString(36).slice(2, 6);
      return `${formatTimestamp(new Date())}-${rand}`;
    };
    let id = makeId();
    for (let attempt = 0; await dbGetPost(projectId, id); attempt++) {
      id = makeId();
    }
    return id;
  }

  async function createPost(projectId: string): Promise<{ id: string }> {
    const id = await generateUniquePostId(projectId);
    const nowStr = now();

    const newPost: IPostRecord = {
      projectId,
      id,
      slug: "",
      title: "",
      dateCreated: nowStr,
      dateUpdated: nowStr,
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

  const focusId = $derived(page.url.searchParams.get("focus"));

  $effect(() => {
    if (!focusId || !postsLoaded) return;
    const el = document.querySelector(
      `[data-post-id="${CSS.escape(focusId)}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    replaceState(`/${projectId}?page=${currentPage}`, {});
  });
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
  <div class="-mt-2 mb-4 flex items-center gap-2">
    <button
      class="btn-secondary text-muted-foreground text-sm shrink-0 p-2 px-3 rounded-full"
      onclick={() => {
        editingToken = true;
      }}
    >
      <Wrench class="icon" /> Edit
    </button>

    <div class="ml-auto flex items-center gap-2">
      <Popover open={optionsOpen} onclose={() => (optionsOpen = false)}>
        {#snippet trigger()}
          <button
            class="btn-secondary text-muted-foreground text-sm shrink-0 p-2 rounded-full relative"
            aria-label="View options"
            aria-haspopup="dialog"
            aria-expanded={optionsOpen}
            onclick={() => (optionsOpen = !optionsOpen)}
          >
            {#if listPrefs.order === "desc"}
              <ArrowDownWideNarrow class="icon" />
            {:else}
              <ArrowUpNarrowWide class="icon" />
            {/if}
            {#if !isDefaultListPrefs(listPrefs)}
              <span
                aria-hidden="true"
                class="absolute top-0 right-0 w-2 h-2 rounded-full bg-primary"
              ></span>
            {/if}
          </button>
        {/snippet}
        <div class="flex flex-col gap-3">
          <div class="flex flex-col gap-2">
            <p class="text-xs font-medium text-muted-foreground">Sort</p>
            <div class="flex gap-2">
              <span class="relative inline-flex flex-1">
                <select
                  class="{selectClass} w-full"
                  value={listPrefs.sort}
                  onchange={onSortFieldChange}
                  aria-label="Sort posts"
                >
                  <option value="dateCreated">Created</option>
                  <option value="dateUpdated">Updated</option>
                  <option value="datePublished">Published</option>
                </select>
                <ChevronDown
                  class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                />
              </span>
              <button
                class="btn-secondary text-sm shrink-0 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5"
                aria-label={listPrefs.order === "desc"
                  ? "Sort direction: new first"
                  : "Sort direction: old first"}
                onclick={onToggleSortOrder}
              >
                {#if listPrefs.order === "desc"}
                  <ArrowDownWideNarrow class="icon" />
                {:else}
                  <ArrowUpNarrowWide class="icon" />
                {/if}
                <!-- both labels stacked in one grid cell → button width stays
                     the wider of the two, no resize when toggling -->
                <span class="grid">
                  <span
                    class="col-start-1 row-start-1 {listPrefs.order === 'desc'
                      ? ''
                      : 'invisible'}">New first</span
                  >
                  <span
                    class="col-start-1 row-start-1 {listPrefs.order === 'desc'
                      ? 'invisible'
                      : ''}">Old first</span
                  >
                </span>
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <p class="text-xs font-medium text-muted-foreground">Filter</p>
            <span class="relative inline-flex">
              <select
                class="{selectClass} w-full"
                value={listPrefs.draft}
                onchange={onDraftFilterChange}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="drafts">Drafts</option>
                <option value="published">Published</option>
              </select>
              <ChevronDown
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
              />
            </span>
            <span class="relative inline-flex">
              <select
                class="{selectClass} w-full"
                value={listPrefs.page}
                onchange={onPageFilterChange}
                aria-label="Filter by type"
              >
                <option value="all">All content types</option>
                <option value="posts">Posts</option>
                <option value="pages">Pages</option>
              </select>
              <ChevronDown
                class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
              />
            </span>
          </div>
          {#if !isDefaultListPrefs(listPrefs)}
            <button
              class="btn-secondary text-sm py-1.5 rounded-full w-full"
              onclick={() => onPrefsChange({ ...DEFAULT_LIST_PREFS })}
            >
              Use default
            </button>
          {/if}
        </div>
      </Popover>
    </div>
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
      {:else if listPrefs.draft !== "all" || listPrefs.page !== "all"}
        <p class="text-muted-foreground col-span-full">
          No posts match the current filters.
          <button class="text-primary underline ml-1" onclick={clearFilters}
            >Clear filters</button
          >
        </p>
      {:else}
        <p class="text-muted-foreground col-span-full">
          No posts yet. Create your first post to get started.
        </p>
      {/if}
    {:else}
      {#each posts as post (post.id)}
        <div
          class="card cursor-pointer hover:border-muted-foreground/50 relative overflow-hidden"
          role="button"
          tabindex="0"
          data-post-id={post.id}
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
              {#if listPrefs.sort === "dateUpdated"}
                <span
                  ><span class="italic">updated</span>
                  {formatPostDate(post.dateUpdated)}</span
                >
              {:else if listPrefs.sort === "dateCreated"}
                <span
                  ><span class="italic">created</span>
                  {formatPostDate(post.dateCreated)}</span
                >
              {:else if !post.draft && post.datePublished}
                <span
                  ><span class="italic">published</span>
                  {formatPostDate(post.datePublished)}</span
                >
              {/if}
              {#if post.draft}
                <span
                  title="Draft"
                  class="text-xs h-5.5 w-5 font-serif italic text-center pb-1 flex items-end justify-center bg-muted-foreground/10 absolute top-0 right-2 bevel z-5 rounded-b-full"
                >
                  d
                </span>
              {/if}
              {#if post.page}
                <span
                  title="Page"
                  class="text-xs h-5.5 w-5 font-serif italic text-center pb-1 flex items-start justify-center bg-primary/50 text-primary-foreground absolute top-0 bevel z-5 rounded-b-full {!post.draft
                    ? 'right-2'
                    : 'right-8'}"
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
