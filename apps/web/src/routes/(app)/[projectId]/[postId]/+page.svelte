<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { untrack, onMount, onDestroy } from "svelte";
  import { posts } from "$lib/stores/posts.svelte";
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
  import { today } from "$lib/shared/utils";
  import SyncIndicator from "$lib/components/SyncIndicator.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { ArrowLeft, Braces, PenLine, Save, Trash2 } from "@lucide/svelte";
  import Switch from "$lib/components/Switch.svelte";

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
    await syncer.commitDeletion(project, id);
    const idx = posts.value.findIndex(
      (p) => p.id === id && p.projectId === pid,
    );
    if (idx >= 0) {
      posts.value.splice(idx, 1);
    }
  }

  // initialize so there's no blink
  let workingPost = $state(posts.value.find((p) => p.id === postId) || null);
  let tagsInput = $state(
    tagsArrToString(posts.value.find((p) => p.id === postId)?.tags),
  );
  let saveError = $state<{ title: string; message: string } | null>(null);
  let showDeleteConfirm = $state(false);
  let isWriteMode = $state(true);
  let containerEl: HTMLDivElement | undefined = $state();

  let saver: DebouncedSaver | null = null;
  let unregisterHook: (() => void) | null = null;

  $effect(() => {
    if (!workingPost) return;
    void { ...workingPost, _t: tagsInput };

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

    saver?.schedule();
  });

  async function handleSave() {
    if (saver) {
      await saver.flush();
    }
    const project = getProject(projectId);
    if (project) await syncer.push(project);
  }

  async function handleBack() {
    goto(`/${projectId}`);
  }

  function dismissError() {
    saveError = null;
  }

  function tagsArrToString(tagsArr: string[] | undefined): string {
    if (!tagsArr) return "";
    return tagsArr.join(", ");
  }

  function handleTitleBlur() {
    // Derive slug from title when slug is empty
    if (!workingPost!.slug && workingPost!.title) {
      untrack(() => {
        workingPost!.slug = deriveSlug(workingPost!.title);
      });
    }
  }

  function handlePublishToggle(v: boolean) {
    workingPost!.draft = !v;
    if (v && !workingPost!.datePublished) {
      workingPost!.datePublished = today();
    }
  }

  async function handleDelete() {
    showDeleteConfirm = false;
    saver?.cancel();
    try {
      await deletePost(projectId, postId);
      goto(`/${projectId}`);
    } catch (err) {
      saveError = {
        title: "Delete Failed",
        message: err instanceof Error ? err.message : "Failed to delete post",
      };
    }
  }

  onMount(async () => {
    const freshPost = await loadPost(projectId, postId, { forcePull: true });
    if (!freshPost) {
      goto(`/${projectId}`);
      return;
    }
    workingPost = freshPost;

    tagsInput = tagsArrToString(workingPost.tags);

    let gitBaseline: IPostRecord | null = null;
    try {
      const raw = await readPostContent(projectId, postId);
      const parsed = parseMdx(raw, postId);
      gitBaseline = { ...workingPost, ...parsed };
    } catch {
      // New post — not yet in git
    }

    saver = createCurrentSaver({
      projectId,
      gitBaseline,
      getWorkingPost: () => workingPost,
      getTagsInput: () => tagsInput,
      onSave: (saved) => {
        const idx = posts.value.findIndex(
          (p) => p.id === saved.id && p.projectId === saved.projectId,
        );
        if (idx >= 0) {
          posts.value[idx] = { ...saved };
          // if the post is updated,
          // re-evaluate project dirty flag
          syncStatus.updateDirty(projectId);
        }
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
  });

  onDestroy(() => {
    unregisterHook?.();
    saver?.flush().then(() => {
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
        }, 100);
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
</script>

<div
  bind:this={containerEl}
  class="max-md:fixed inset-0 max-md:p-4 bg-background max-md:w-svw max-md:flex max-md:flex-col max-md:overflow-hidden"
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
          size={9}
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
            class="w-full min-h-100 px-4 py-3 border border-input rounded-md text-sm font-mono bg-background text-foreground resize-y leading-relaxed max-md:flex-1 max-md:min-h-0"
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
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
          />
        </label>

        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Slug</span>
          <input
            type="text"
            bind:value={workingPost.slug}
            onblur={() => {
              workingPost!.slug = deriveSlug(workingPost!.slug);
            }}
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
          />
        </label>

        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Date</span>
          <input
            type="date"
            bind:value={workingPost.datePublished}
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
          />
        </label>

        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Description</span>
          <textarea
            bind:value={workingPost.description}
            rows="3"
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground resize-y"
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
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
          />
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
