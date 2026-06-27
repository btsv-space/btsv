<script lang="ts">
  import { onDestroy } from "svelte";
  import { posts } from "$lib/stores/posts.svelte";

  let { children } = $props();

  onDestroy(() => {
    console.log(`[/:projectId/:layout] onDestroy: clearing posts`);
    posts.value = [];
  });
</script>

{@render children()}
