<script lang="ts">
  import { syncStatus } from "$lib/stores/syncStatus.svelte";
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

  const status = $derived(syncStatus.get(projectId));

  const effectiveState = $derived(
    !online
      ? "offline"
      : status?.state === SyncState.SYNCING_PUSH
        ? SyncState.SYNCING_PUSH
        : status?.state === SyncState.SYNCING_PULL
          ? SyncState.SYNCING_PULL
          : status?.state === SyncState.CONFLICT
            ? SyncState.CONFLICT
            : status?.dirty
              ? SyncState.DIRTY
              : status?.state === SyncState.ERROR
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
          : effectiveState === SyncState.SYNCING_PUSH
            ? "Saving..."
            : effectiveState === SyncState.SYNCING_PULL
              ? "Loading..."
              : effectiveState === SyncState.CONFLICT
                ? "Needs resolution"
                : "Sync failed",
  );

  let title = $derived(
    effectiveState === SyncState.ERROR
      ? `${label}: ${status?.errorMsg ?? ""}`
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
    class:bg-green-500={effectiveState === SyncState.SYNCED}
    class:bg-amber-500={effectiveState === SyncState.DIRTY}
    class:bg-lime-500={effectiveState === SyncState.SYNCING_PUSH}
    class:bg-cyan-500={effectiveState === SyncState.SYNCING_PULL}
    class:animate-pulse-fast={effectiveState === SyncState.SYNCING_PUSH ||
      effectiveState === SyncState.SYNCING_PULL}
    class:bg-fuchsia-500={effectiveState === SyncState.CONFLICT}
    class:bg-destructive={effectiveState === SyncState.ERROR}
  ></span>
  {#if onSave && effectiveState === SyncState.DIRTY}
    <button class="btn-outline" onclick={onSave}>
      <Save class="icon text-secondary-foreground" />
    </button>
  {/if}
</span>
