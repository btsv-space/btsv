<script lang="ts">
  import {
    projects,
    ensureProjectsHydrated,
  } from "$lib/stores/projects.svelte";
  import { syncer } from "$lib/stores/syncer.svelte";
  import { syncStatus } from "$lib/stores/syncStatus.svelte";
  import { ESyncState } from "$lib/shared/types";
  import { onMount, onDestroy } from "svelte";

  let { children } = $props();
  let projectsReady = $state(false);

  async function load() {
    // Everything needed to start is local; projects live in IDB.
    await ensureProjectsHydrated();

    projectsReady = true;

    // Everything needed is local by now; start the background syncer.
    syncer.start();

    // Projects cached without their working tree (stale/partial state) are
    // cloned lazily in the background; the page-level pull is the fallback.
    for (const project of projects.value) {
      if (project.status !== "unknown") continue;
      project.status = "cloning";
      project.error = "";
      void syncer
        .pull(project)
        .then(() => {
          const failed = syncStatus.get(project.id)?.state === ESyncState.ERROR;
          project.status = failed ? "error" : "ready";
          project.error = failed
            ? (syncStatus.get(project.id)?.error?.message ?? "Clone failed")
            : "";
        })
        .catch((err: unknown) => {
          project.status = "error";
          project.error = err instanceof Error ? err.message : "Clone failed";
        });
    }
  }

  onMount(() => {
    void load();
  });

  onDestroy(() => {
    syncer.stop();
  });
</script>

{#if !projectsReady}
  <p class="text-center text-muted-foreground p-8">Loading projects…</p>
{:else}
  {@render children()}
{/if}
