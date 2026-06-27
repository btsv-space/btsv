<script lang="ts">
  let { show = true }: { show?: boolean } = $props();
</script>

{#if show}
  <div class="absolute right-0 top-0 bottom-0 w-1 bg-primary"></div>
{/if}
