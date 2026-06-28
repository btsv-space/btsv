<script lang="ts">
  import { goto } from "$app/navigation";
  import { isAuthenticated, ensureInit } from "$lib/stores/auth.svelte";
  import { projects, getProject } from "$lib/stores/projects.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { syncer } from "$lib/stores/syncer.svelte";
  import { checkProjectDirExists } from "$lib/fs";
  import { api } from "$lib/api";
  import { dbGetProjects, dbSaveProjects, dbSavePrefs } from "$lib/db";
  import type { TProjectEntry } from "$lib/shared/types";
  import { onMount, onDestroy } from "svelte";

  let { children } = $props();
  let sessionReady = $state(false);
  let projectsReady = $state(false);

  async function projectEntryWithStatus(
    p: { id: string } & Partial<TProjectEntry>,
  ): Promise<TProjectEntry> {
    const exists = await checkProjectDirExists(p.id);
    console.log(
      `[/:layout] projectEntryWithStatus: ${p.id} dirExists=${exists}`,
    );
    return {
      ...p,
      status: exists ? "ready" : "unknown",
      error: "",
    } as TProjectEntry;
  }
  async function loadProjects() {
    // 1. Read from cache immediately so the UI never blinks
    const cached = await dbGetProjects();
    if (cached.length > 0) {
      projects.value = await Promise.all(
        cached.map((p) => projectEntryWithStatus(p)),
      );
    }

    // 2. Wait for server preferences BEFORE anything triggers a pull
    let apiPrefs: typeof prefs.value | undefined;
    try {
      apiPrefs = await api.preferences.get();
    } catch {
      // prefs not available yet (e.g., new user) — keep defaults
    }
    if (apiPrefs) {
      prefs.value = { ...prefs.value, ...apiPrefs };
      await dbSavePrefs(prefs.value);
    }

    // 3. Now safe to show children (their onMount may trigger pulls)
    projectsReady = true;

    // 4. Start syncer with correct preferences
    syncer.start();
    console.log("[/:layout] syncer started");

    // 5. Fetch fresh projects from API in background
    try {
      console.log("[/:layout] fetching projects from API...");
      const apiProjects = await api.projects.list();
      console.log(`[/:layout] API returned ${apiProjects.length} project(s)`);

      const entries: TProjectEntry[] = await Promise.all(
        apiProjects.map(async (apiProject) => {
          const existing = getProject(apiProject.id);
          if (existing) {
            console.log(
              `[/:layout] ${apiProject.id}: using cached status=${existing.status}`,
            );
            return {
              ...apiProject,
              status: existing.status,
              error: existing.error,
            } as TProjectEntry;
          }
          return await projectEntryWithStatus(apiProject);
        }),
      );

      console.log(
        "[/:layout] entries:",
        entries.map((e) => ({ id: e.id, status: e.status })),
      );
      projects.value = entries;
      console.log("[/:layout] projectsReady=true");

      // Persist project list
      await dbSaveProjects(entries);

      // Trigger clones for newly-seen projects — fire-and-forget
      // IMPORTANT: iterate projects.value (not entries) so mutations go through $state proxy
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
      projectsReady = true;
    }
  }
  onMount(async () => {
    await ensureInit();
    sessionReady = true;
    if (!isAuthenticated.value) {
      goto("/login");
      return;
    }

    await loadProjects();
  });

  onDestroy(() => {
    syncer.stop();
  });
</script>

{#if !sessionReady}
  <p class="text-center text-muted-foreground p-8">Checking session…</p>
{:else if !isAuthenticated.value}{:else if !projectsReady}
  <p class="text-center text-muted-foreground p-8">Loading projects...</p>
{:else}
  {@render children()}
{/if}
