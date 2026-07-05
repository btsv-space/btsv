<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getProject } from "$lib/stores/projects.svelte";
  import { getRecentProjectId } from "$lib/stores/recentProject";

  onMount(() => {
    const id = getRecentProjectId();
    const exists = id && getProject(id);
    goto(exists ? `/${id}` : "/projects", { replaceState: true });
  });
</script>
