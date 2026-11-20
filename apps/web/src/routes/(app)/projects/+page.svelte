<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { projects } from "$lib/stores/projects.svelte";
  import { FolderPlus, Wrench, QrCode } from "@lucide/svelte";
  import FloatingButton from "$lib/components/FloatingButton.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import EditTokenModal from "$lib/components/EditTokenModal.svelte";
  import LinkDeviceModal from "$lib/components/LinkDeviceModal.svelte";
  import NewProjectForm from "$lib/components/NewProjectForm.svelte";

  console.log("[/projects] mounted");

  const showCreateForm = $derived(page.url.searchParams.get("new") === "true");
  let editingProject = $state<string | null>(null);
  let linkingProject = $state<string | null>(null);
</script>

<Modal
  show={showCreateForm}
  onclose={() => goto("/projects", { replaceState: true })}
>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold m-0">New Project</h2>
    <NewProjectForm
      oncreated={(id) => goto(`/${id}`)}
      oncancel={() => goto("/projects", { replaceState: true })}
    />
  </div>
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
          <div class="flex gap-2 -mr-1 -mb-1">
            <button
              class="btn-secondary p-2 text-muted-foreground cursor-pointer rounded-full"
              onclick={(e) => {
                e.stopPropagation();
                linkingProject = project.id;
              }}
              aria-label="Link device"
            >
              <QrCode class="icon" />
            </button>
            <button
              class="btn-secondary p-2 text-muted-foreground cursor-pointer rounded-full"
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
    </div>
  {/each}
</div>

<FloatingButton class="md:hidden" onclick={() => goto("/projects?new=true")}>
  <FolderPlus class="icon" /> New Project
</FloatingButton>

<LinkDeviceModal
  project={projects.value.find((p) => p.id === linkingProject) ?? null}
  show={linkingProject != null}
  onclose={() => (linkingProject = null)}
/>

<EditTokenModal
  projectId={editingProject ?? ""}
  show={editingProject != null}
  onclose={() => {
    editingProject = null;
  }}
/>
