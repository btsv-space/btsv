<script lang="ts">
  import { syncStates, syncErrors } from "$lib/stores/syncer.svelte";
  import { posts } from "$lib/stores/posts.svelte";
  import { SyncState } from "$lib/shared/types";
  import { onMount } from "svelte";
  import { Save } from "@lucide/svelte";

  const { projectId, onSave } = $props<{
    projectId: string;
    onSave?: () => void;
  }>();

  let online = $state(navigator.onLine);

  onMount(() => {
    function onOnline() {
      online = true;
    }
    function onOffline() {
      online = false;
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  });

  const hasDirty = $derived(
    posts.value.some((p) => p.projectId === projectId && p.dirty),
  );

  const effectiveState = $derived(
    !online
      ? "offline"
      : syncStates.get(projectId) === SyncState.SYNCING
        ? SyncState.SYNCING
        : hasDirty
          ? SyncState.DIRTY
          : syncStates.get(projectId) === SyncState.ERROR
            ? SyncState.ERROR
            : SyncState.SYNCED,
  );

  let label = $derived(
    !online
      ? "Offline"
      : effectiveState === SyncState.SYNCED
        ? "Synced"
        : effectiveState === SyncState.DIRTY
          ? "Unsaved changes"
          : effectiveState === SyncState.SYNCING
            ? "Saving..."
            : "Sync failed",
  );

  let title = $derived(
    effectiveState === SyncState.ERROR
      ? `${label}: ${syncErrors.get(projectId) ?? ""}`
      : label,
  );
</script>

<span
  class="inline-flex items-center gap-1.5 text-sm"
  {title}
  role="status"
  aria-label={label}
>
  <span
    class="w-2 h-2 rounded-full shrink-0"
    class:border={effectiveState === "offline"}
    class:border-border={effectiveState === "offline"}
    class:bg-transparent={effectiveState === "offline"}
    class:bg-emerald-500={effectiveState === SyncState.SYNCED}
    class:bg-amber-500={effectiveState === SyncState.DIRTY}
    class:bg-lime-500={effectiveState === SyncState.SYNCING}
    class:animate-pulse-fast={effectiveState === SyncState.SYNCING}
    class:bg-destructive={effectiveState === SyncState.ERROR}
  ></span>
  {#if onSave && effectiveState === SyncState.DIRTY}
    <button class="btn-outline" onclick={onSave}>
      <Save class="icon text-secondary-foreground" />
    </button>
  {/if}
</span>
