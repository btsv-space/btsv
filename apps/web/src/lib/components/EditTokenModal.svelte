<script lang="ts">
  import Modal from "$lib/components/Modal.svelte";
  import GitTokenField from "$lib/components/GitTokenField.svelte";
  import { api } from "$lib/api";
  import { encryptToken, bytesToApi } from "$lib/crypto";
  import { getDEK, gitTokenCache } from "$lib/stores/auth.svelte";
  import { Check } from "@lucide/svelte";

  let {
    projectId,
    show,
    onclose,
    onsaved,
  }: {
    projectId: string;
    show: boolean;
    onclose: () => void;
    onsaved?: () => void;
  } = $props();

  let gitToken = $state("");
  let formError = $state("");
  let formSubmitting = $state(false);
  let saved = $state(false);

  $effect(() => {
    if (!show) {
      gitToken = "";
      formError = "";
      formSubmitting = false;
      saved = false;
    }
  });

  async function handleSave(e: Event) {
    e.preventDefault();
    formError = "";
    formSubmitting = true;

    try {
      const dek = getDEK();
      const { ciphertext, iv } = await encryptToken(gitToken, dek);
      await api.projects.setSecret(projectId, {
        ciphertext: bytesToApi(ciphertext),
        iv: bytesToApi(iv),
      });
      gitTokenCache.set(projectId, gitToken);
      saved = true;
      formSubmitting = false;
      onsaved?.();
      setTimeout(() => {
        onclose();
      }, 600);
    } catch (err) {
      formError = err instanceof Error ? err.message : "Failed to save token";
      formSubmitting = false;
    }
  }
</script>

<Modal {show} {onclose}>
  <form class="flex flex-col gap-4" onsubmit={handleSave}>
    <h2 class="text-lg font-semibold m-0">Edit Git Token</h2>

    {#if formError}
      <p
        class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2"
      >
        {formError}
      </p>
    {/if}

    <GitTokenField id="edit-token" bind:value={gitToken} />

    <div class="flex gap-2 justify-between mt-2">
      <button type="button" class="btn-secondary" onclick={onclose}>
        Cancel
      </button>
      <button
        type="submit"
        class="btn-primary flex items-center gap-1"
        class:bg-green-600={saved}
        disabled={formSubmitting || saved}
      >
        {#if saved}
          <Check class="w-4 h-4" /> Saved
        {:else if formSubmitting}
          Saving...
        {:else}
          Save
        {/if}
      </button>
    </div>
  </form>
</Modal>
