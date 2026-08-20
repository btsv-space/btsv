<script lang="ts">
  import {
    projects,
    getProject,
    projectEntryWithStatus,
    ensureProjectsHydrated,
  } from "$lib/stores/projects.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { syncer, canSync } from "$lib/stores/syncer.svelte";
  import { api } from "$lib/api";
  import { dbSaveProjects, dbSavePrefs } from "$lib/db";
  import type { TProjectEntry } from "$lib/shared/types";
  import { onMount, onDestroy } from "svelte";

  let { children } = $props();
  let projectsReady = $state(false);

  let prefFetchGeneration = 0;

  async function loadProjects() {
    // Cache hydration is owned by the projects store; emptiness-triggered,
    // so re-login re-reads the cache and stays blink-free.
    await ensureProjectsHydrated();

    // Show UI immediately — don't wait for network
    projectsReady = true;

    // Start syncer — internal ops no-op until canSync is true
    syncer.start();
    console.log("[/:layout] syncer started");

    // Background: fetch prefs, then projects, with backoff retry
    void fetchPrefsThenProjects();
  }

  async function tryFetchPrefs(): Promise<boolean> {
    try {
      const apiPrefs = await api.preferences.get();
      if (apiPrefs) {
        prefs.value = { ...prefs.value, ...apiPrefs };
        await dbSavePrefs(prefs.value);
        return true;
      }
    } catch {
      // timeout or network error — will retry
    }
    return false;
  }

  async function fetchPrefsThenProjects() {
    const generation = ++prefFetchGeneration;
    let delay = 5000;

    while (!canSync.value && generation === prefFetchGeneration) {
      const ok = await tryFetchPrefs();
      if (ok) {
        canSync.value = true;
        break;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 60000);
    }

    if (generation !== prefFetchGeneration) return;

    await fetchAndCloneProjects();
  }

  async function fetchAndCloneProjects() {
    try {
      console.log("[/:layout] fetching projects from API...");
      const apiProjects = await api.projects.list();
      console.log(`[/:layout] API returned ${apiProjects.length} project(s)`);

      const projectEntries: TProjectEntry[] = await Promise.all(
        apiProjects.map(async (apiProject) => {
          const existing = getProject(apiProject.id);
          if (existing) {
            console.log(
              `[/:layout] ${apiProject.id}: using cached status=${existing.status}`,
            );
            return { ...apiProject, ...existing } as TProjectEntry;
          }
          return await projectEntryWithStatus(apiProject);
        }),
      );

      console.log(
        "[/:layout] projectEntries:",
        projectEntries.map((e) => ({ id: e.id, status: e.status })),
      );
      projects.value = projectEntries;

      // Persist project list
      await dbSaveProjects(projectEntries);

      // Trigger clones for newly-seen projects — fire-and-forget
      // IMPORTANT: iterate projects.value (not projectEntries) so mutations go through $state proxy
      console.log("[/:layout] checking for unknown projects to clone...");
      for (const project of projects.value) {
        console.log(
          `[/:layout] project ${project.id}: status=${project.status}`,
        );
        if (project.status === "unknown") {
          console.log(`[/:layout] triggering clone for ${project.id}`);
          project.status = "cloning";
          project.error = "";
          syncer
            .pull(project)
            .then(() => {
              console.log(
                `[/:layout] clone succeeded for ${project.id}, setting ready`,
              );
              project.status = "ready";
            })
            .catch((err: unknown) => {
              console.error(`[/:layout] clone failed for ${project.id}:`, err);
              project.status = "error";
              project.error =
                err instanceof Error ? err.message : "Clone failed";
            });
        }
      }
      console.log("[/:layout] clone loop done");
    } catch (err) {
      console.error("[/:layout] failed to load projects:", err);
    }
  }

  onMount(async () => {
    await loadProjects();
  });

  onMount(() => {
    function onOnline() {
      if (!canSync.value) {
        void fetchPrefsThenProjects();
      }
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  });

  onDestroy(() => {
    prefFetchGeneration++;
    syncer.stop();
  });
</script>

{#if !projectsReady}
  <p class="text-center text-muted-foreground p-8">Loading projects…</p>
{:else}
  {@render children()}
{/if}
