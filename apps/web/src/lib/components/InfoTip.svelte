<script lang="ts">
  import { Info } from "@lucide/svelte";

  let {
    text,
    label = "More information",
    id,
    open = $bindable(false),
  }: {
    text: string;
    label?: string;
    id?: string;
    open?: boolean;
  } = $props();

  let wrapper = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!open) return;

    const onDocClick = (e: MouseEvent) => {
      if (wrapper && !wrapper.contains(e.target as Node)) {
        open = false;
      }
    };

    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  });
</script>

<span class="relative inline-flex" bind:this={wrapper}>
  <button
    type="button"
    class="bg-none border-none p-0 text-muted-foreground hover:text-foreground cursor-pointer leading-none"
    aria-label={label}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Info class="h-3.5 w-3.5" />
  </button>

  {#if open}
    <span
      {id}
      role="tooltip"
      class="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-input bg-card p-2 text-[11px] leading-snug font-normal text-foreground shadow-md"
    >
      {text}
    </span>
  {/if}
</span>
