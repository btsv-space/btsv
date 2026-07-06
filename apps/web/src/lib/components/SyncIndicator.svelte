<script lang="ts">
  import { syncStatus } from "$lib/stores/syncStatus.svelte";
  import { ESyncState } from "$lib/shared/types";
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
      : status?.state === ESyncState.SYNCING_PUSH
        ? ESyncState.SYNCING_PUSH
        : status?.state === ESyncState.SYNCING_PULL
          ? ESyncState.SYNCING_PULL
          : status?.state === ESyncState.CONFLICT
            ? ESyncState.CONFLICT
            : status?.dirty
              ? ESyncState.DIRTY
              : status?.state === ESyncState.ERROR
                ? ESyncState.ERROR
                : ESyncState.SYNCED,
  );

  let label = $derived(
    !online
      ? "Offline"
      : effectiveState === ESyncState.SYNCED
        ? "Synced"
        : effectiveState === ESyncState.DIRTY
          ? "Unsaved changes"
          : effectiveState === ESyncState.SYNCING_PUSH
            ? "Saving..."
            : effectiveState === ESyncState.SYNCING_PULL
              ? "Loading..."
              : effectiveState === ESyncState.CONFLICT
                ? "Needs resolution"
                : "Sync failed",
  );

  let title = $derived(
    effectiveState === ESyncState.ERROR
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
    class:bg-green-500={effectiveState === ESyncState.SYNCED}
    class:bg-amber-500={effectiveState === ESyncState.DIRTY}
    class:bg-lime-500={effectiveState === ESyncState.SYNCING_PUSH}
    class:bg-cyan-500={effectiveState === ESyncState.SYNCING_PULL}
    class:animate-pulse-fast={effectiveState === ESyncState.SYNCING_PUSH ||
      effectiveState === ESyncState.SYNCING_PULL}
    class:bg-fuchsia-500={effectiveState === ESyncState.CONFLICT}
    class:bg-destructive={effectiveState === ESyncState.ERROR}
  ></span>
  {#if onSave && effectiveState === ESyncState.DIRTY}
    <button class="btn-outline" onclick={onSave}>
      <Save class="icon text-secondary-foreground" />
    </button>
  {/if}
</span>
