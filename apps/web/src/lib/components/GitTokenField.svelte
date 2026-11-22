<script lang="ts">
  import { CircleHelp, ExternalLink } from "@lucide/svelte";
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

<div class="flex flex-col gap-1">
  <div class="flex items-center gap-1">
    <label for={id} class="text-xs text-muted-foreground font-medium">
      Git Token {#if required}<span class="text-destructive">*</span>{/if}
    </label>
    <button
      type="button"
      class="bg-none border-none p-0 text-muted-foreground hover:text-foreground cursor-pointer leading-none"
      aria-label="How to create a token"
      aria-expanded={showTokenHelp}
      onclick={() => (showTokenHelp = !showTokenHelp)}
    >
      <CircleHelp class="h-3.5 w-3.5" />
    </button>
  </div>

  <input
    {id}
    type="password"
    autocomplete="new-password"
    bind:value
    {required}
    placeholder="github_pat_..."
    class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
  />

  {#if showTokenHelp}
    <div
      class="mt-1 flex flex-col gap-3 rounded-md border border-input p-3 text-sm leading-relaxed text-muted-foreground"
    >
      <p class="m-0 font-medium text-foreground">Create a fine-grained token</p>

      <ol class="m-0 flex list-outside list-decimal flex-col gap-2 pl-5">
        <li>
          GitHub → Settings → Developer settings → Fine-grained tokens →
          Generate new token
        </li>
        <li>Repository access: Only select repositories → your blog repo</li>
        <li>
          Permissions:
          <code
            class="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
            >Contents → Read &amp; Write</code
          >, nothing else
        </li>
        <li>
          Copy the token — it starts with
          <code
            class="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
            >github_pat_</code
          >
        </li>
      </ol>

      <a
        href={GITHUB_TOKEN_URL}
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-1 self-start text-sm font-medium hover:underline"
      >
        Open GitHub token page
        <ExternalLink class="h-3.5 w-3.5" />
      </a>
    </div>
  {/if}
</div>
