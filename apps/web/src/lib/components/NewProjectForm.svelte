<script lang="ts">
  import { untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { Check, QrCode, X } from "@lucide/svelte";
  import GitTokenField from "$lib/components/GitTokenField.svelte";
  import QrScanner from "$lib/components/QrScanner.svelte";
  import { createProjectFromRepo } from "$lib/createProject";
  import { readPairingBlobFromUrl } from "$lib/pairing";

  let {
    initial,
    title,
    allowScan = false,
    oncreated,
    oncancel,
  }: {
    initial?: { name: string; repoUrl: string; pat: string };
    title?: string;
    allowScan?: boolean;
    oncreated: (id: string) => void;
    oncancel: () => void;
  } = $props();

  // Seeded once when the form is created; edits afterwards are local.
  let name = $state(untrack(() => initial?.name ?? ""));
  let repoUrl = $state(untrack(() => initial?.repoUrl ?? ""));
  let gitToken = $state(untrack(() => initial?.pat ?? ""));

  let formError = $state("");
  let submitting = $state(false);
  let saved = $state(false);

  let scanning = $state(false);
  let scanError = $state("");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    formError = "";
    submitting = true;

    const result = await createProjectFromRepo({
      name,
      repoUrl,
      pat: gitToken,
    });

    submitting = false;

    if (!result.ok) {
      formError = result.error;
      return;
    }

    saved = true;
    setTimeout(() => oncreated(result.id), 600);
  }

  function handleScan(text: string) {
    const blob = readPairingBlobFromUrl(text);
    if (!blob) {
      scanError = "That QR code isn't a btsv pairing link.";
      return;
    }

    scanning = false;
    scanError = "";
    goto(`/pair#pair=${blob}`);
  }
</script>

<div class="flex flex-col gap-4">
  {#if title || allowScan}
    <div class="flex items-start justify-between gap-2">
      {#if title}
        <h2 class="text-lg font-semibold m-0">
          {scanning ? "Scan a pairing code" : title}
        </h2>
      {/if}

      {#if allowScan}
        <button
          type="button"
          class="btn-outline p-2 shrink-0"
          aria-label={scanning ? "Back to the form" : "Scan a pairing QR code"}
          onclick={() => {
            scanning = !scanning;
            scanError = "";
          }}
        >
          {#if scanning}
            <X class="h-4 w-4" />
          {:else}
            <QrCode class="h-4 w-4" />
          {/if}
        </button>
      {/if}
    </div>
  {/if}

  {#if scanning}
    <QrScanner onresult={handleScan} />
    <p class="text-xs text-muted-foreground m-0 text-center">
      Point the camera at the QR code shown on the other device.
    </p>
    {#if scanError}
      <p
        class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2 m-0"
      >
        {scanError}
      </p>
    {/if}
  {:else}
    <form class="flex flex-col gap-4" onsubmit={submit}>
      {#if formError}
        <p
          class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2"
        >
          {formError}
        </p>
      {/if}

      <label
        class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
      >
        <span class="flex items-center gap-2">
          Repo URL <span class="text-destructive">*</span>
        </span>
        <input
          type="url"
          bind:value={repoUrl}
          required
          placeholder="https://github.com/you/your-blog"
          class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
        />
      </label>

      <label
        class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
      >
        <span class="flex items-center gap-2">Name</span>
        <input
          type="text"
          bind:value={name}
          placeholder="Defaults to repo name"
          class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
        />
      </label>

      <GitTokenField id="new-project-token" bind:value={gitToken} />

      <div class="flex gap-2 justify-between mt-2">
        <button
          type="button"
          class="btn-secondary"
          onclick={oncancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn-primary flex items-center gap-1"
          class:bg-green-600={saved}
          disabled={submitting || saved}
        >
          {#if saved}
            <Check class="w-4 h-4" /> Saved
          {:else if submitting}
            Creating & cloning...
          {:else}
            Create & Clone
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>
