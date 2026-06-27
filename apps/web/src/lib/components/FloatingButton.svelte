<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    onclick,
    class: className = "",
    children,
  }: { onclick: () => void; class?: string; children: Snippet } = $props();
</script>

<button
  class="fixed bottom-6 right-4 z-20 btn-secondary shadow-md rounded-full px-4 py-2 flex items-center gap-2 cursor-pointer {className}"
  {onclick}
>
  {@render children()}
</button>
