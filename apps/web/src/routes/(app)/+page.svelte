<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { getProject } from "$lib/stores/projects.svelte";
  import { projectCommits } from "$lib/stores/projectCommits.svelte";

  onMount(() => {
    const id = projectCommits.mostRecentProjectId;
    const exists = id && getProject(id);
    goto(exists ? `/${id}` : "/projects", { replaceState: true });
  });
</script>
