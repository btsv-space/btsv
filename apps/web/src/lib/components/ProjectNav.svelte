<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { projects, getProject } from "$lib/stores/projects.svelte";
  import { isAuthenticated } from "$lib/stores/auth.svelte";
  import { getProjectCommits } from "$lib/stores/recentProject";
  import SyncIndicator from "$lib/components/SyncIndicator.svelte";
  import Marker from "$lib/components/Marker.svelte";
  import { ChevronDown } from "@lucide/svelte";

  let open = $state(false);
  let buttonRef = $state<HTMLButtonElement | null>(null);

  function close() {
    open = false;
  }

  function toggle() {
    open = !open;
  }

  function handleClickOutside(e: MouseEvent) {
    if (buttonRef && !buttonRef.contains(e.target as Node)) {
      close();
    }
  }

  $effect(() => {
    if (open) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  });

  let label = $state("Projects");

  $effect(() => {
    if (currentPath === "/settings") {
      label = "Settings";
    } else if (currentPath === "/projects") {
      label = "Projects";
    } else if (page.params.projectId) {
      const project = getProject(page.params.projectId);
      label = project?.name ?? "Projects";
    } else {
      label = "🧱";
    }
  });

  const sortedProjects = $derived.by(() => {
    const commits = getProjectCommits();
    return [...projects.value].sort((a, b) => {
      const ta = commits[a.id] ?? 0;
      const tb = commits[b.id] ?? 0;
      if (ta !== tb) return tb - ta;
      return a.name.localeCompare(b.name);
    });
  });

  const currentPath = $derived(page.url.pathname);
  const currentProjectId = $derived(page.params.projectId);
</script>

{#if !isAuthenticated.value}
  <a href="/login" class="no-underline">
    <img
      src="/icons/logo_bot_no_border.svg"
      class="h-5 dark:invert"
      alt="btsv"
    />
  </a>
{:else}
  <div class="relative">
    <button
      bind:this={buttonRef}
      onclick={toggle}
      class="font-semibold text-lg p-0 no-underline text-foreground bg-transparent border-none cursor-pointer"
      aria-expanded={open}
      aria-haspopup="true"
    >
      <span class="flex items-center gap-1.5">
        {#if page.params.projectId}
          <SyncIndicator projectId={page.params.projectId} />
        {/if}
        <span>{label}</span>
      </span>
      <ChevronDown
        class="h-4 w-4 {open
          ? 'rotate-180'
          : ''} transition-transform duration-200"
      />
    </button>

    {#if open}
      <div
        class="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-md shadow-lg z-50 overflow-hidden text-base"
      >
        <div
          class="flex items-center gap-2 px-2 py-2 text-foreground cursor-pointer hover:bg-muted font-semibold relative"
          class:pointer-events-none={currentPath === "/projects"}
          onclick={() => {
            close();
            goto("/projects");
          }}
          onkeydown={(e) => e.key === "Enter" && (close(), goto("/projects"))}
          role="link"
          tabindex={currentPath === "/projects" ? -1 : 0}
        >
          Projects
          <Marker show={currentPath === "/projects"} />
        </div>

        {#if sortedProjects.length > 0}
          {#each sortedProjects as project (project.id)}
            <div
              class="flex items-center gap-2 px-2 py-2 pl-4 text-foreground cursor-pointer hover:bg-muted relative"
              class:pointer-events-none={project.id === currentProjectId}
              onclick={() => {
                close();
                goto(`/${project.id}`);
              }}
              onkeydown={(e) =>
                e.key === "Enter" && (close(), goto(`/${project.id}`))}
              role="link"
              tabindex={project.id === currentProjectId ? -1 : 0}
            >
              <SyncIndicator projectId={project.id} />
              {project.name}
              <Marker show={project.id === currentProjectId} />
            </div>
          {/each}
        {/if}

        <div
          class="flex items-center gap-2 px-2 py-2 pl-4 cursor-pointer hover:bg-muted text-muted-foreground"
          onclick={() => {
            close();
            goto("/projects?new=true");
          }}
          onkeydown={(e) =>
            e.key === "Enter" && (close(), goto("/projects?new=true"))}
          role="link"
          tabindex="0"
        >
          + New project
        </div>

        <div class="border-t border-border"></div>
        <div
          class="flex items-center gap-2 px-2 py-2 text-foreground cursor-pointer hover:bg-muted font-semibold relative"
          class:pointer-events-none={currentPath === "/settings"}
          onclick={() => {
            close();
            goto("/settings");
          }}
          onkeydown={(e) => e.key === "Enter" && (close(), goto("/settings"))}
          role="link"
          tabindex={currentPath === "/settings" ? -1 : 0}
        >
          Settings
          <Marker show={currentPath === "/settings"} />
        </div>
      </div>
    {/if}
  </div>
{/if}
