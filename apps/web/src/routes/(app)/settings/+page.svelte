<script lang="ts">
  import { fly } from "svelte/transition";
  import { api } from "$lib/api";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { projects } from "$lib/stores/projects.svelte";
  import { syncer } from "$lib/stores/syncer.svelte";
  import { currentUser, logout } from "$lib/stores/auth.svelte";
  import { dbSavePrefs } from "$lib/db";
  import type { TSyncType } from "$lib/shared/types";

  type SaveState = "idle" | "saving" | "success" | "error";

  let syncType = $state<TSyncType>(prefs.value.syncType);
  let proxyUrl = $state(prefs.value.proxyUrl);
  let saveState = $state<SaveState>("idle");
  let saveMsg = $state("");
  let prevSyncType = $state<TSyncType>(prefs.value.syncType);

  let dismissTimeout: ReturnType<typeof setTimeout> | undefined;

  function dismiss() {
    saveState = "idle";
    saveMsg = "";
  }

  function showToast(state: SaveState, msg: string) {
    clearTimeout(dismissTimeout);
    saveState = state;
    saveMsg = msg;
    if (state === "success" || state === "error") {
      dismissTimeout = setTimeout(dismiss, 3000);
    }
  }

  async function handleChange() {
    showToast("saving", "Saving...");

    try {
      const updated = await api.preferences.update({
        syncType,
        proxyUrl: proxyUrl || undefined,
      });
      prefs.value = updated;
      await dbSavePrefs(updated);

      if (syncType !== prevSyncType) {
        prevSyncType = syncType;
        for (const project of projects.value) {
          if (project.status === "ready") {
            syncer
              .pull(project)
              .catch((err) =>
                console.error(
                  `[settings] auto-pull failed for ${project.id}:`,
                  err,
                ),
              );
          }
        }
      }

      showToast("success", "Saved");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to save");
      console.error("[settings] failed to update:", err);
    }
  }
</script>

<div class="max-w-lg flex flex-col gap-6">
  <span>
    Logged in as <span class="font-mono px-1"
      >{currentUser.value?.username}</span
    >
  </span>
  <div class="card max-w-lg flex flex-col gap-6">
    <label for="sync-type" class="text-[15px] font-semibold block"
      >Sync Type
      <p class="text-sm text-muted-foreground font-normal m-0 mb-3">
        Choose how posts are synced with Git repositories.
      </p>
      <select
        id="sync-type"
        bind:value={syncType}
        onchange={handleChange}
        disabled={saveState === "saving"}
        class="px-3 py-2 border border-input rounded-md text-[15px] font-inherit bg-background text-foreground w-full box-border"
      >
        <option value="git">Git (isomorphic via cors-proxy)</option>
        <option value="api">API (GitHub REST)</option>
      </select>
    </label>
    {#if syncType === "git"}
      <label for="proxy-url" class="text-[15px] font-semibold block">
        CORS Proxy URL
        <p class="text-sm text-muted-foreground font-normal m-0 mb-3">
          Custom CORS proxy URL for isomorphic-git (default:
          http://localhost:9999).
        </p>
        <input
          id="proxy-url"
          type="url"
          bind:value={proxyUrl}
          onchange={handleChange}
          disabled={saveState === "saving"}
          placeholder="http://localhost:9999"
          class="px-3 py-2 border border-input rounded-md text-[15px] font-inherit bg-background text-foreground w-full box-border"
        />
      </label>
    {/if}
  </div>

  <button class="btn-destructive text-base w-full" onclick={() => logout()}
    >Logout</button
  >
</div>

{#if saveState !== "idle"}
  <div
    role="status"
    transition:fly={{ x: 64, duration: 200, opacity: 1 }}
    class="fixed bottom-6 right-6 z-50 px-3 py-2 rounded-md shadow-lg text-sm border {saveState ===
    'saving'
      ? 'bg-muted text-muted-foreground'
      : saveState === 'success'
        ? 'bg-green-500/20 border-green-500 text-green-500'
        : 'bg-destructive/20 border-destructive text-destructive'}"
  >
    {saveMsg}
  </div>
{/if}
