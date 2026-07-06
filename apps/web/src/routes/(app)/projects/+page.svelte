<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { projects, getProject } from "$lib/stores/projects.svelte";
  import { syncer } from "$lib/stores/syncer.svelte";
  import { api } from "$lib/api";
  import { encryptToken, bytesToApi } from "$lib/crypto";
  import { getDEK, gitTokenCache } from "$lib/stores/auth.svelte";
  import type { TProjectEntry } from "$lib/shared/types";
  import { FolderPlus, Wrench } from "@lucide/svelte";
  import FloatingButton from "$lib/components/FloatingButton.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import GitTokenField from "$lib/components/GitTokenField.svelte";
  import EditTokenModal from "$lib/components/EditTokenModal.svelte";

  console.log("[/projects] mounted");

  let showCreateForm = $derived(page.url.searchParams.get("new") === "true");
  let formError = $state("");
  let formSubmitting = $state(false);
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

  async function createProject(
    displayName: string,
    repoUrl: string,
    token: string,
  ): Promise<string | null> {
    formError = "";
    formSubmitting = true;

    let project: { id: string; name: string; repoUrl: string };
    try {
      project = await api.projects.create(displayName, repoUrl);
    } catch (err) {
      formError =
        err instanceof Error ? err.message : "Failed to create project";
      formSubmitting = false;
      return null;
    }

    projects.value = [
      { ...project, status: "cloning", error: "" } as TProjectEntry,
      ...projects.value,
    ];

    const projectEntry = getProject(project.id);
    if (!projectEntry) {
      formSubmitting = false;
      return null;
    }

    try {
      await syncer.initialPull(projectEntry, token);
      projectEntry.status = "ready";
    } catch (err) {
      projectEntry.status = "error";
      projectEntry.error = err instanceof Error ? err.message : "Clone failed";
      formSubmitting = false;
      return null;
    }

    const dek = getDEK();
    const { ciphertext, iv } = await encryptToken(token, dek);

    api.projects
      .setSecret(project.id, {
        ciphertext: bytesToApi(ciphertext),
        iv: bytesToApi(iv),
      })
      .catch((err: unknown) => {
        console.error("[/projects] failed to store encrypted token:", err);
      });

    gitTokenCache.set(project.id, token);
    formSubmitting = false;

    return project.id;
  }

  async function handleCreate(e: Event) {
    e.preventDefault();

    const displayName =
      name || repoUrl.split("/").pop()?.replace(".git", "") || "untitled";

    const projectId = await createProject(displayName, repoUrl, gitToken);

    if (projectId) {
      resetForm();
      goto(`/${projectId}`);
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
      <button type="submit" class="btn-primary" disabled={formSubmitting}>
        {formSubmitting ? "Creating & cloning..." : "Create & Clone"}
      </button>
    </div>
  </form>
</Modal>

{#if projects.value.length === 0}
  <p class="text-muted-foreground">
    No projects yet. Create one to get started.
  </p>
{:else}
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
{/if}

<FloatingButton class="md:hidden" onclick={() => (showCreateForm = true)}>
  <FolderPlus class="icon" /> New Project
</FloatingButton>

<EditTokenModal
  projectId={editingProject ?? ""}
  show={editingProject != null}
  onclose={() => {
    editingProject = null;
  }}
/>
