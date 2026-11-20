<script lang="ts">
  import { untrack } from "svelte";
  import { Check } from "@lucide/svelte";
  import GitTokenField from "$lib/components/GitTokenField.svelte";
  import { createProjectFromRepo } from "$lib/createProject";

  let {
    initial,
    oncreated,
    oncancel,
  }: {
    initial?: { name: string; repoUrl: string; pat: string };
    oncreated: (id: string) => void;
    oncancel: () => void;
  } = $props();

  let name = $state(untrack(() => initial?.name ?? ""));
  let repoUrl = $state(untrack(() => initial?.repoUrl ?? ""));
  let gitToken = $state(untrack(() => initial?.pat ?? ""));

  let formError = $state("");
  let submitting = $state(false);
  let saved = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    formError = "";
    submitting = true;

    const result = await createProjectFromRepo({
      name,
      repoUrl,
      pat: gitToken,
    });

    submitting = false;

    if (!result.ok) {
      formError = result.error;
      return;
    }

    saved = true;
    setTimeout(() => oncreated(result.id), 600);
  }
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
  {#if formError}
    <p class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2">
      {formError}
    </p>
  {/if}

  <label class="flex flex-col gap-1 text-xs text-muted-foreground font-medium">
    <span class="flex items-center gap-2">
      Repo URL <span class="text-destructive">*</span>
    </span>
    <input
      type="url"
      bind:value={repoUrl}
      required
      placeholder="https://github.com/you/your-blog"
      class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
    />
  </label>

  <label class="flex flex-col gap-1 text-xs text-muted-foreground font-medium">
    <span class="flex items-center gap-2">Name</span>
    <input
      type="text"
      bind:value={name}
      placeholder="Defaults to repo name"
      class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
    />
  </label>

  <GitTokenField id="new-project-token" bind:value={gitToken} />

  <div class="flex gap-2 justify-between mt-2">
    <button
      type="button"
      class="btn-secondary"
      onclick={oncancel}
      disabled={submitting}
    >
      Cancel
    </button>
    <button
      type="submit"
      class="btn-primary flex items-center gap-1"
      class:bg-green-600={saved}
      disabled={submitting || saved}
    >
      {#if saved}
        <Check class="w-4 h-4" /> Saved
      {:else if submitting}
        Creating & cloning...
      {:else}
        Create & Clone
      {/if}
    </button>
  </div>
</form>
