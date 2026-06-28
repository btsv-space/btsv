<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { projects, getProject } from "$lib/stores/projects.svelte";
  import { syncer } from "$lib/stores/syncer.svelte";
  import { api } from "$lib/api";
  import { encryptToken, bytesToApi } from "$lib/crypto";
  import { getDEK, gitTokenCache } from "$lib/stores/auth.svelte";
  import type { TProjectEntry } from "$lib/shared/types";
  import { GITHUB_TOKEN_URL } from "$lib/shared/constants";
  import { FolderPlus, X } from "@lucide/svelte";
  import FloatingButton from "$lib/components/FloatingButton.svelte";
  import Modal from "$lib/components/Modal.svelte";

  console.log("[/projects] mounted");

  let showCreateForm = $derived(page.url.searchParams.get("new") === "true");
  let formError = $state("");
  let formSubmitting = $state(false);
  let name = $state("");
  let repoUrl = $state("");
  let gitToken = $state("");
  let showTokenHelp = $state(false);

  function resetForm() {
    name = "";
    repoUrl = "";
    gitToken = "";
    showTokenHelp = false;
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

    const entry: TProjectEntry = {
      ...project,
      status: "cloning",
      error: "",
    };

    projects.value = [entry, ...projects.value];

    try {
      await syncer.initialPull(entry, token);
      const proxied = getProject(entry.id);
      if (proxied) proxied.status = "ready";
    } catch (err) {
      const proxied = getProject(entry.id);
      if (proxied) {
        proxied.status = "error";
        proxied.error = err instanceof Error ? err.message : "Clone failed";
      }
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

    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
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

    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
      <span class="flex items-center gap-2">Name</span>
      <input
        type="text"
        bind:value={name}
        placeholder="Defaults to repo name"
        class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
      />
    </label>

    <label class="flex flex-col gap-1 text-xs text-muted-foreground">
      <span class="flex items-center gap-2">
        Git Token <span class="text-destructive">*</span>
        <button
          type="button"
          class="bg-none border-none text-primary cursor-pointer text-xs p-0"
          onclick={() => (showTokenHelp = !showTokenHelp)}
        >
          {showTokenHelp ? "Hide help" : "(?)"}
        </button>
      </span>
      <input
        type="password"
        bind:value={gitToken}
        required
        placeholder="github_pat_..."
        class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
      />
    </label>

    {#if showTokenHelp}
      <div
        class="relative text-sm text-foreground bg-muted/40 border border-border rounded-md p-3 leading-relaxed"
      >
        <button
          type="button"
          class="absolute top-2 right-2 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          onclick={() => (showTokenHelp = false)}
          aria-label="Close help"
        >
          <X class="w-4 h-4" />
        </button>
        <ol class="list-decimal list-inside space-y-2 m-0 pt-2">
          <li>
            Open GitHub → Settings → Developer settings → Fine-grained tokens →
            Generate new token
          </li>
          <li>
            <strong>Repository access:</strong> Only select repositories → choose
            your blog repo
          </li>
          <li>
            <strong>Permissions</strong> (only one needed):
            <code
              class="text-xs bg-background px-1.5 py-0.5 rounded-sm border border-border"
              >Contents → Read &amp; Write</code
            >
          </li>
          <li>
            Copy the token. It starts with <code
              class="text-xs bg-background px-1.5 py-0.5 rounded-sm border border-border"
              >github_pat_</code
            >
          </li>
        </ol>
        <a
          href={GITHUB_TOKEN_URL}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 mt-3 text-sm font-medium text-primary hover:underline"
        >
          Open GitHub token page
          <svg class="w-3 h-3" viewBox="0 0 12 12" fill="none"
            ><path
              d="M1 11L11 1M11 1H4M11 1V8"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            /></svg
          >
        </a>
      </div>
    {/if}

    <div class="flex gap-2 justify-between mt-2">
      <button type="submit" class="btn-primary" disabled={formSubmitting}>
        {formSubmitting ? "Creating & cloning..." : "Create & Clone"}
      </button>
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
        <div class="min-w-0 flex-1">
          <h3 class="text-base font-semibold m-0 mb-1">{project.name}</h3>
          <p class="text-sm text-muted-foreground m-0 truncate">
            {project.repoUrl}
          </p>
          <div class="flex items-center gap-2 mt-2">
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
        </div>
      </div>
    {/each}
  </div>
{/if}

<FloatingButton class="md:hidden" onclick={() => (showCreateForm = true)}>
  <FolderPlus class="icon" /> New Project
</FloatingButton>
