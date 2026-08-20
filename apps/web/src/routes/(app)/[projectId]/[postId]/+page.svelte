<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { untrack, onMount, onDestroy } from "svelte";
  import { syncer, loadPost } from "$lib/stores/syncer.svelte";
  import { getProject } from "$lib/stores/projects.svelte";
  import { readPostContent } from "$lib/fs";
  import { parseMdx } from "$lib/parser";
  import { DebouncedSaver } from "$lib/saver";
  import { syncStatus } from "$lib/stores/syncStatus.svelte";
  import {
    createCurrentSaver,
    destroyCurrentSaver,
  } from "$lib/stores/currentSaver";
  import { type IPostRecord } from "$lib/shared/types";
  import {
    now,
    toDatetimeLocalValue,
    fromDatetimeLocalValue,
  } from "$lib/shared/utils";
  import SyncIndicator from "$lib/components/SyncIndicator.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { ArrowLeft, Braces, PenLine, Save, Trash2 } from "@lucide/svelte";
  import Switch from "$lib/components/Switch.svelte";
  import { dbGetPost, dbGetPostBySlug, dbGetPostPage } from "$lib/db";
  import { POSTS_PAGE_SIZE } from "$lib/shared/constants";
  import { postsListPrefs } from "$lib/stores/postsListPrefs.svelte";

  const projectId = page.params.projectId!;
  const postId = page.params.postId!;

  console.log(`[/:projectId/:postId] mounted: ${projectId}/${postId}`);

  function deriveSlug(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function deletePost(pid: string, id: string): Promise<void> {
    const project = getProject(pid);
    if (!project) {
      console.error(`[post] cannot delete ${id}: project ${pid} not found`);
      return;
    }
    await syncer.markForDeletion(project, id);
    syncer.push(project).catch(() => {});
  }

  let workingPost = $state<IPostRecord | null>(null);
  let tagsInput = $state("");
  let saveError = $state<{ title: string; message: string } | null>(null);
  let slugError = $state("");
  let showDeleteConfirm = $state(false);
  let isWriteMode = $state(true);
  let containerEl: HTMLDivElement | undefined = $state();

  let saver: DebouncedSaver | null = null;
  let unregisterHook: (() => void) | null = null;
  let workingSlug = $state("");
  let lastCheckedSlug: string | undefined;

  $effect(() => {
    if (!workingPost) return;
    void { ...workingPost, _t: tagsInput, _s: workingSlug };

    // Validate: can't publish without a title
    if (!workingPost.draft && !workingPost.title.trim()) {
      untrack(() => {
        workingPost!.draft = true;
      });
      saveError = {
        title: "Cannot Publish",
        message: "Title is required before publishing.",
      };
    }

    const slug = deriveSlug(workingSlug);

    if (slug === lastCheckedSlug) {
      saver?.schedule();
      return;
    }

    if (!slug) {
      slugError = "";
      lastCheckedSlug = slug;
      workingPost!.slug = slug;
      saver?.schedule();
      return;
    }

    dbGetPostBySlug(projectId, slug).then((duplicateSlugPost) => {
      if (slug !== deriveSlug(workingSlug)) return;
      if (duplicateSlugPost && duplicateSlugPost.id !== workingPost!.id) {
        slugError = "This slug is already used by another post.";
        workingPost!.slug = lastCheckedSlug!;
        saver?.schedule();
        return;
      }
      slugError = "";
      lastCheckedSlug = slug;
      workingPost!.slug = slug;
      saver?.schedule();
    });
  });

  async function handleSave() {
    if (slugError) {
      saveError = { title: "Cannot Save", message: slugError };
      return;
    }
    if (saver) {
      await saver.flush();
    }
    const project = getProject(projectId);
    if (project) await syncer.push(project);
  }

  async function handleBack() {
    const listPage = await dbGetPostPage(
      projectId,
      postId,
      POSTS_PAGE_SIZE,
      postsListPrefs.get(projectId),
    );
    if (listPage == null) {
      // not in the current filtered view (or deleted) — go to page 1
      goto(`/${projectId}?page=1`);
    } else {
      goto(
        `/${projectId}?page=${listPage}&focus=${encodeURIComponent(postId)}`,
      );
    }
  }

  function dismissError() {
    saveError = null;
  }

  function tagsArrToString(tagsArr: string[] | undefined): string {
    if (!tagsArr) return "";
    return tagsArr.join(", ");
  }

  function editableSnapshot(
    post: IPostRecord,
    tags: string,
    slug: string,
  ): string {
    return JSON.stringify({
      title: post.title,
      body: post.body,
      description: post.description,
      draft: post.draft,
      page: post.page,
      datePublished: post.datePublished,
      tags,
      slug,
    });
  }

  function handleTitleBlur() {
    if (!workingSlug && workingPost!.title) {
      workingSlug = deriveSlug(workingPost!.title);
    }
  }

  function handlePublishToggle(v: boolean) {
    workingPost!.draft = !v;
    if (v && !workingPost!.datePublished) {
      workingPost!.datePublished = now();
    }
  }

  async function handleDelete() {
    showDeleteConfirm = false;
    saver?.cancel();
    try {
      await deletePost(projectId, postId);
      // on delete, null the saver so that typical destroy lifecycle does not run
      saver = null;
      destroyCurrentSaver();
      goto(`/${projectId}`);
    } catch (err) {
      saveError = {
        title: "Delete Failed",
        message: err instanceof Error ? err.message : "Failed to delete post",
      };
    }
  }

  onMount(async () => {
    // load cached post first
    const cachedPost = (await dbGetPost(projectId, postId)) || null;
    if (!cachedPost || cachedPost.deleted) {
      goto(`/${projectId}`);
      return;
    }
    const cachedSnapshot = editableSnapshot(
      cachedPost,
      tagsArrToString(cachedPost.tags),
      cachedPost.slug,
    );
    workingPost = cachedPost;
    tagsInput = tagsArrToString(cachedPost.tags);
    workingSlug = cachedPost.slug;
    lastCheckedSlug = cachedPost.slug;

    // create saver and register the sync hook before async pull
    // mid-pull edits will be saved even if user exits editor before pull completes
    let gitBaseline: IPostRecord | null = null;
    try {
      const raw = await readPostContent(projectId, postId);
      const parsed = parseMdx(raw, postId);
      gitBaseline = { ...(workingPost ?? {}), ...parsed } as IPostRecord;
    } catch {
      // New post — not yet in git/fs
    }

    saver = createCurrentSaver({
      projectId,
      gitBaseline,
      getWorkingPost: () => workingPost,
      getTagsInput: () => tagsInput,
      onSave: () => {
        syncStatus.updateDirty(projectId);
      },
      onError: (err) => {
        console.error("[editor] save failed:", err);
        saveError = { title: "Editor Error", message: err };
      },
    });

    unregisterHook = syncer.addAfterSyncHook((pid, id, syncedPost) => {
      if (pid === projectId && id === postId && syncedPost) {
        saver?.updateBaseline(syncedPost);
      }
    });

    const freshPost = await loadPost(projectId, postId, { forcePull: true });
    if (!freshPost || freshPost.deleted) {
      goto(`/${projectId}`);
      return;
    }
    // adopt the fresh post only if the user hasn't made any edits
    const userEdited =
      !workingPost ||
      editableSnapshot(workingPost, tagsInput, workingSlug) !== cachedSnapshot;
    if (!userEdited) {
      workingPost = freshPost;
      tagsInput = tagsArrToString(freshPost.tags);
      workingSlug = freshPost.slug;
      lastCheckedSlug = freshPost.slug;
    }
  });

  onDestroy(() => {
    unregisterHook?.();
    saver?.flush()?.then(() => {
      const project = getProject(projectId);
      if (project) syncer.push(project);
      destroyCurrentSaver();
    });
  });

  $effect(() => {
    if (import.meta.env.SSR) return;

    function beforeUnload(e: BeforeUnloadEvent) {
      // Warns the user with the browser's native "unsaved changes" dialog
      if (saver?.isScheduled() ?? false) {
        e.preventDefault();
        e.returnValue = true;
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  });

  onMount(() => {
    if (typeof window.visualViewport === "undefined") return;

    const el = containerEl!;
    if (!el) return;

    let focusing = false;

    function onFocusin(e: FocusEvent) {
      if (window.innerWidth >= 768) return;
      el.style.height = `${window.visualViewport!.height}px`;

      const target = e.target;
      if (
        (target instanceof HTMLTextAreaElement ||
          target instanceof HTMLInputElement) &&
        !focusing
      ) {
        focusing = true;
        setTimeout(() => {
          if (document.activeElement === target) {
            target.blur();
            target.focus();
            window.scrollTo(0, 0);
          }
          focusing = false;
        }, 200);
      }
    }

    function onFocusout() {
      if (window.innerWidth >= 768) return;
      setTimeout(() => {
        if (!el.contains(document.activeElement)) {
          el.style.height = "";
        }
      });
    }

    el.addEventListener("focusin", onFocusin);
    el.addEventListener("focusout", onFocusout);

    return () => {
      el.removeEventListener("focusin", onFocusin);
      el.removeEventListener("focusout", onFocusout);
      el.style.height = "";
    };
  });

  onMount(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.width = "100%";

    // iOS rubber-band scroll fix: allow touchmove only when element is really scrollable
    const el = containerEl!;
    function onTouchmove(e: TouchEvent) {
      if (window.innerWidth >= 768) return;
      const t = e.target;
      // Selection-handle drag (a selection exists before the drag starts) — let iOS drive it
      if (
        (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) &&
        t.selectionStart !== t.selectionEnd
      ) {
        return;
      }
      let node = e.target as Element | null;
      while (node && node !== el) {
        const style = getComputedStyle(node);
        // Scrollable now: overflow-y allows scrolling AND content exceeds the box
        // TBD: if noticeable, track direction to also block chain-bounce at element's boundary
        if (
          /(auto|scroll)/.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight
        ) {
          return;
        }
        node = node.parentElement;
      }
      // No scrollable ancestor found — prevent the iOS bounce on this gesture
      e.preventDefault();
    }
    // passive:false so preventDefault() is honored by iOS
    el.addEventListener("touchmove", onTouchmove, { passive: false });

    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
      body.style.position = "";
      body.style.width = "";
      el.removeEventListener("touchmove", onTouchmove);
    };
  });
</script>

<div
  bind:this={containerEl}
  class="max-md:fixed max-md:z-50 inset-0 max-md:p-4 bg-background max-md:w-svw max-md:flex max-md:flex-col max-md:overflow-hidden max-md:touch-none max-md:overscroll-none"
>
  {#if !workingPost}
    <p class="text-muted-foreground mt-4">Loading post...</p>
  {:else}
    {#if saveError}
      <ConfirmDialog
        title={saveError.title}
        message={saveError.message}
        confirmText="Dismiss"
        danger
        onConfirm={dismissError}
      />
    {/if}

    <header class="flex items-center justify-between mb-4 flex-wrap gap-3">
      <div class="flex items-center gap-3 flex-wrap">
        <button
          class="btn-outline"
          onclick={handleBack}
          aria-label="Back to posts"
        >
          <ArrowLeft class="icon" />
        </button>
        <h1 class="max-md:hidden text-lg font-semibold m-0">
          {workingPost?.title ?? ""}
        </h1>
        <Switch
          radius="sm"
          onBg="bg-muted"
          offBg="bg-muted"
          onIcon={Braces}
          offIcon={PenLine}
          checked={!isWriteMode}
          onCheckedChange={() => (isWriteMode = !isWriteMode)}
          size={10}
          class="md:hidden"
          lengthMultiple={2}
        />
        <SyncIndicator {projectId} />
      </div>
      <div class="flex gap-3">
        <button
          class="btn-destructive"
          onclick={() => (showDeleteConfirm = true)}
        >
          <Trash2 class="icon" />
        </button>
        <button class="btn-primary" onclick={handleSave}
          ><Save class="icon" /></button
        >
      </div>
    </header>

    <div
      class="grid grid-cols-[1fr_300px] gap-8 max-md:flex max-md:flex-col max-md:flex-1 max-md:min-h-0"
    >
      <div
        class="flex flex-col gap-2 max-md:flex max-md:flex-col max-md:flex-1 max-md:min-h-0 {isWriteMode
          ? ''
          : 'max-md:hidden'}"
      >
        <input
          type="text"
          bind:value={workingPost.title}
          onblur={handleTitleBlur}
          placeholder="Title"
          class="text-muted-foreground md:hidden bg-transparent border-none p-0 m-0 font-inherit text-base"
        />
        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium max-md:flex max-md:flex-col max-md:flex-1 max-md:min-h-0"
        >
          <span class={isWriteMode ? "max-md:hidden" : ""}>Content</span>
          <textarea
            bind:value={workingPost.body}
            class="w-full min-h-100 px-4 py-3 border border-input rounded-md text-sm font-mono text-foreground resize-y leading-relaxed max-md:flex-1 max-md:min-h-0 max-md:overscroll-none"
          ></textarea>
        </label>
      </div>
      <div
        class="flex flex-col gap-4 max-md:grow max-md:px-1 max-md:-mx-1 overflow-y-auto overscroll-y-contain {isWriteMode
          ? 'max-md:hidden'
          : ''}"
      >
        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Title</span>
          <input
            type="text"
            bind:value={workingPost.title}
            onblur={handleTitleBlur}
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit text-foreground"
          />
        </label>

        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Slug</span>
          <input
            type="text"
            bind:value={workingSlug}
            onblur={() => {
              workingSlug = deriveSlug(workingSlug);
            }}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Use lowercase letters, numbers, and hyphens only."
            class="px-3 py-2 border rounded-md text-sm font-inherit text-foreground
              {slugError ? 'border-destructive' : 'border-input'}
              invalid:border-destructive"
          />
          {#if slugError}
            <p class="text-destructive text-xs mt-1">{slugError}</p>
          {/if}
        </label>

        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Date</span>
          <input
            type="datetime-local"
            value={toDatetimeLocalValue(workingPost.datePublished)}
            onchange={(e) => {
              workingPost!.datePublished = fromDatetimeLocalValue(
                e.currentTarget.value,
              );
            }}
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit text-foreground"
          />
        </label>

        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Description</span>
          <textarea
            bind:value={workingPost.description}
            rows="3"
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit text-foreground resize-y"
          ></textarea>
        </label>

        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Tags (comma-separated)</span>
          <input
            type="text"
            bind:value={tagsInput}
            placeholder="tag1, tag2"
            autocapitalize="off"
            autocorrect="off"
            spellcheck={false}
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit text-foreground"
          />
        </label>
        <label class="flex flex-row items-center gap-2 cursor-pointer">
          <Switch
            checked={workingPost.page}
            onCheckedChange={(v) => (workingPost!.page = v)}
            class="my-1"
          />
          <span class="text-sm text-muted-foreground">Page</span>
        </label>
        <label class="flex flex-row items-center gap-2 cursor-pointer">
          <Switch
            checked={!workingPost.draft}
            onCheckedChange={handlePublishToggle}
            class="my-1"
          />
          <span
            class="text-sm {workingPost.draft
              ? 'text-muted-foreground'
              : 'text-foreground'}">Published</span
          >
        </label>
      </div>
    </div>

    {#if showDeleteConfirm}
      <ConfirmDialog
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText="Delete"
        danger={true}
        onConfirm={handleDelete}
        onCancel={() => (showDeleteConfirm = false)}
      />
    {/if}
  {/if}
</div>

<style>
  @media (max-width: 767px) {
    input:focus,
    textarea:focus {
      animation: blink-opacity 0.01s;
    }
  }
  @keyframes blink-opacity {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
</style>
