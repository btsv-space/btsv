<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { projects } from "$lib/stores/projects.svelte";
  import { getRecentProjectId } from "$lib/stores/recentProject.svelte";

  onMount(() => {
    const id = getRecentProjectId();
    const exists = id && projects.value.some((p) => p.id === id);
    goto(exists ? `/${id}` : "/projects", { replaceState: true });
  });
</script>
