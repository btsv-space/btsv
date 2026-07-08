<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { dev } from "$app/environment";
  import favicon from "$lib/assets/favicon.svg";
  import { isAuthenticated, ensureInit } from "$lib/stores/auth.svelte";
  import { Bolt } from "@lucide/svelte";
  import { goto, preloadCode } from "$app/navigation";
  import ProjectNav from "$lib/components/ProjectNav.svelte";
  import ReloadPrompt from "$lib/components/ReloadPrompt.svelte";

  let { children } = $props();
  let preloaded = false;

  $effect(() => {
    ensureInit();
  });

  $effect(() => {
    if (isAuthenticated.value && !preloaded) {
      preloaded = true;
      preloadCode("/");
      preloadCode("/projects");
      preloadCode("/settings");
      preloadCode("/__preload_project");
      preloadCode("/__preload_project/__preload_post");
    }
  });

  onMount(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.classList.toggle("dark", m.matches);
    m.addEventListener("change", update);

    return () => m.removeEventListener("change", update);
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  {#if !dev}
    <link rel="manifest" href="/manifest.webmanifest" />
  {/if}
</svelte:head>

<header
  class="sticky top-0 z-10 bg-background flex items-center justify-between px-4 py-4 max-w-240 mx-auto"
>
  <ProjectNav />
  <nav class="flex items-center gap-3 text-sm">
    {#if isAuthenticated.value}
      <button class="p-0" onclick={() => goto("/settings")}>
        <Bolt class="icon h-7 w-7" />
      </button>
    {/if}
  </nav>
</header>

<ReloadPrompt />

<main class="max-w-240 mx-auto p-4">
  {@render children()}
</main>
