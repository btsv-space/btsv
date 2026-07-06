<script lang="ts">
  import { X } from "@lucide/svelte";
  import { GITHUB_TOKEN_URL } from "$lib/shared/constants";

  let {
    id,
    value = $bindable(""),
    required = true,
  }: {
    id: string;
    value?: string;
    required?: boolean;
  } = $props();

  let showTokenHelp = $state(false);
</script>

<label class="flex flex-col gap-1 text-xs text-muted-foreground font-medium">
  <span class="flex items-center gap-2">
    Git Token {#if required}<span class="text-destructive">*</span>{/if}
    <button
      type="button"
      class="bg-none border-none text-primary cursor-pointer text-xs p-0"
      onclick={() => (showTokenHelp = !showTokenHelp)}
    >
      {showTokenHelp ? "Hide help" : "(?)"}
    </button>
  </span>
  <input
    {id}
    type="password"
    autocomplete="new-password"
    bind:value
    {required}
    placeholder="github_pat_..."
    class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
  />
</label>

{#if showTokenHelp}
  <div
    class="relative text-sm text-foreground bg-muted/40 border border-border rounded-md p-3 leading-relaxed"
  >
    <button
      type="button"
      class="absolute top-2 right-2 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
      onclick={() => (showTokenHelp = false)}
      aria-label="Close help"
    >
      <X class="w-4 h-4" />
    </button>
    <ol class="list-decimal list-inside space-y-2 m-0 pt-2">
      <li>
        Open GitHub → Settings → Developer settings → Fine-grained tokens →
        Generate new token
      </li>
      <li>
        <strong>Repository access:</strong> Only select repositories → choose your
        blog repo
      </li>
      <li>
        <strong>Permissions</strong> (only one needed):
        <code
          class="text-xs bg-background px-1.5 py-0.5 rounded-sm border border-border"
          >Contents → Read &amp; Write</code
        >
      </li>
      <li>
        Copy the token. It starts with <code
          class="text-xs bg-background px-1.5 py-0.5 rounded-sm border border-border"
          >github_pat_</code
        >
      </li>
    </ol>
    <a
      href={GITHUB_TOKEN_URL}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 mt-3 text-sm font-medium text-primary hover:underline"
    >
      Open GitHub token page
      <svg class="w-3 h-3" viewBox="0 0 12 12" fill="none"
        ><path
          d="M1 11L11 1M11 1H4M11 1V8"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        /></svg
      >
    </a>
  </div>
{/if}
