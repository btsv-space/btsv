<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    show,
    onclose,
    children,
  }: { show: boolean; onclose: () => void; children: Snippet } = $props();

  $effect(() => {
    if (show) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && show && onclose()} />

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={onclose}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="card max-w-lg w-[90%] max-h-[85vh] overflow-y-auto shadow-xl"
      onclick={(e) => e.stopPropagation()}
    >
      {@render children()}
    </div>
  </div>
{/if}
