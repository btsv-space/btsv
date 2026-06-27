<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import favicon from "$lib/assets/favicon.svg";
  import { isAuthenticated, ensureInit } from "$lib/stores/auth.svelte";
  import { Bolt } from "@lucide/svelte";
  import { goto } from "$app/navigation";
  import ProjectNav from "$lib/components/ProjectNav.svelte";

  let { children } = $props();

  $effect(() => {
    ensureInit();
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
</svelte:head>

<header
  class="flex items-center justify-between px-4 py-3 bg-card max-w-240 mx-auto"
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

<main class="max-w-240 mx-auto p-4">
  {@render children()}
</main>
