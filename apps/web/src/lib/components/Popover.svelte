<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    open,
    onclose,
    trigger,
    children,
  }: {
    open: boolean;
    onclose: () => void;
    /** The anchor element (parent owns its onclick toggle + aria attrs). */
    trigger: Snippet;
    /** Panel content. */
    children: Snippet;
  } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && open && onclose()} />

<span class="relative inline-flex">
  {@render trigger()}
  {#if open}
    <!-- transparent backdrop: outside-tap close (Modal pattern, no dimming/scroll-lock) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="fixed inset-0 z-20" onclick={onclose}></div>
    <div
      role="dialog"
      class="absolute right-0 top-full mt-1 z-30 card shadow-lg p-3 w-max max-w-[calc(100vw-1rem)] min-w-48 max-h-[70vh] overflow-y-auto"
    >
      {@render children()}
    </div>
  {/if}
</span>
