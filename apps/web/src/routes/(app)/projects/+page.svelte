<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { projects, getProject } from "$lib/stores/projects.svelte";
  import { syncer } from "$lib/stores/syncer.svelte";
  import { saveGitToken } from "$lib/secrets";
  import { dbSaveProject } from "$lib/db";
  import type { TProjectEntry } from "$lib/shared/types";
  import { FolderPlus, Wrench, Check } from "@lucide/svelte";
  import FloatingButton from "$lib/components/FloatingButton.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import GitTokenField from "$lib/components/GitTokenField.svelte";
  import EditTokenModal from "$lib/components/EditTokenModal.svelte";

  console.log("[/projects] mounted");

  const showCreateForm = $derived(page.url.searchParams.get("new") === "true");
  let formError = $state("");
  let formSubmitting = $state(false);
  let saved = $state(false);
  let name = $state("");
  let repoUrl = $state("");
  let gitToken = $state("");
  let editingProject = $state<string | null>(null);

  function resetForm() {
    name = "";
    repoUrl = "";
    gitToken = "";
    formError = "";
  }

  function generateProjectId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  }

  async function createProject(
    displayName: string,
    repoUrl: string,
    token: string,
  ): Promise<string | null> {
    formError = "";
    formSubmitting = true;

    const project: TProjectEntry = {
      id: generateProjectId(),
      name: displayName,
      repoUrl,
      status: "cloning",
      error: "",
    };

    projects.value = [project, ...projects.value];

    try {
      await saveGitToken(project.id, token);
      await dbSaveProject(project);
    } catch (err) {
      formError = err instanceof Error ? err.message : "Failed to save project";
      formSubmitting = false;
      return null;
    }

    const projectEntry = getProject(project.id);
    if (!projectEntry) {
      formSubmitting = false;
      return null;
    }

    let failed = false;

    try {
      await syncer.initialPull(projectEntry, token);
      projectEntry.status = "ready";
    } catch (err) {
      failed = true;
      projectEntry.status = "error";
      projectEntry.error = err instanceof Error ? err.message : "Clone failed";
      formError = projectEntry.error;
    }

    await dbSaveProject(projectEntry);
    formSubmitting = false;

    return failed ? null : project.id;
  }

  async function handleCreate(e: Event) {
    e.preventDefault();

    const displayName =
      name || repoUrl.split("/").pop()?.replace(".git", "") || "untitled";

    const projectId = await createProject(displayName, repoUrl, gitToken);

    if (projectId) {
      saved = true;
      setTimeout(() => {
        resetForm();
        goto(`/${projectId}`);
      }, 600);
    }
  }
</script>

<Modal
  show={showCreateForm}
  onclose={() => {
    goto("/projects", { replaceState: true });
    resetForm();
  }}
>
  <form class="flex flex-col gap-4" onsubmit={handleCreate}>
    <h2 class="text-lg font-semibold m-0">New Project</h2>

    {#if formError}
      <p
        class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2"
      >
        {formError}
      </p>
    {/if}

    <label
      class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
    >
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

    <label
      class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
    >
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
        onclick={() => {
          goto("/projects", { replaceState: true });
          resetForm();
        }}
      >
        Cancel
      </button>
      <button
        type="submit"
        class="btn-primary flex items-center gap-1"
        class:bg-green-600={saved}
        disabled={formSubmitting || saved}
      >
        {#if saved}
          <Check class="w-4 h-4" /> Saved
        {:else if formSubmitting}
          Creating & cloning...
        {:else}
          Create & Clone
        {/if}
      </button>
    </div>
  </form>
</Modal>

{#if projects.value.length === 0}
  <p class="text-muted-foreground m-0 mb-4">
    No projects yet. Create one to get started.
  </p>
{/if}

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  <button
    class="hidden md:flex card border-dashed border-2 border-muted-foreground/30 hover:border-primary/50 flex-col items-center justify-center gap-2 p-6 text-muted-foreground hover:text-primary transition-colors cursor-pointer min-h-[120px]"
    onclick={() => goto("/projects?new=true")}
  >
    <FolderPlus class="icon w-6 h-6" />
    <span class="text-sm font-medium">New Project</span>
  </button>

  {#each projects.value as project (project.id)}
    {@const isReady = project.status === "ready"}
    {@const isError = project.status === "error"}
    {@const isCloning = project.status === "cloning"}

    <div
      class="card cursor-pointer hover:border-muted-foreground/50"
      onclick={() => goto(`/${project.id}`)}
      onkeydown={(e) => e.key === "Enter" && goto(`/${project.id}`)}
      role="link"
      tabindex="0"
    >
      <div class="min-w-0 flex-1 flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <h3 class="text-base font-semibold m-0">{project.name}</h3>
          <p class="text-sm text-muted-foreground m-0 truncate">
            {project.repoUrl}
          </p>
        </div>
        <div class="flex items-end justify-between">
          <div class="flex items-center gap-2">
            <span
              class="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full {isReady
                ? 'bg-green-500/12 text-green-500'
                : isCloning
                  ? 'bg-amber-500/12 text-amber-500'
                  : isError
                    ? 'bg-destructive/12 text-destructive'
                    : 'bg-muted-foreground/12 text-muted-foreground'}"
            >
              {isReady
                ? "Ready"
                : isError
                  ? "Error"
                  : isCloning
                    ? "Cloning..."
                    : "Unknown"}
            </span>
            {#if isError}
              <span class="text-xs text-destructive">{project.error}</span>
            {/if}
          </div>
          <button
            class="btn-secondary p-2 text-muted-foreground cursor-pointer rounded-full -mr-1 -mb-1"
            onclick={(e) => {
              e.stopPropagation();
              editingProject = project.id;
            }}
            aria-label="Edit token"
          >
            <Wrench class="icon" />
          </button>
        </div>
      </div>
    </div>
  {/each}
</div>

<FloatingButton class="md:hidden" onclick={() => goto("/projects?new=true")}>
  <FolderPlus class="icon" /> New Project
</FloatingButton>

<EditTokenModal
  projectId={editingProject ?? ""}
  show={editingProject != null}
  onclose={() => {
    editingProject = null;
  }}
/>
