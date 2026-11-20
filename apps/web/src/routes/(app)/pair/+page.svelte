<script lang="ts">
  import { goto, replaceState } from "$app/navigation";
  import {
    PAIRING_CODE_LENGTH,
    isPairingBlob,
    normalizePairingCode,
    openPairing,
    readPairingBlobFromUrl,
    type IPairingPayload,
  } from "$lib/pairing";
  import NewProjectForm from "$lib/components/NewProjectForm.svelte";

  const blob = readPairingBlobFromUrl(location.href);
  const usable = blob != null && isPairingBlob(blob);

  let invite = $state<IPairingPayload | null>(null);
  let code = $state("");
  let error = $state("");
  let busy = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!blob) return;

    error = "";
    busy = true;
    try {
      const payload = await openPairing(code, blob);
      if (!payload) {
        error = "That code didn't match — check the other device.";
        return;
      }

      invite = payload;
      replaceState("/pair", {}); // the fragment has done its job
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col items-center">
  <div class="card w-full max-w-md flex flex-col gap-4 mt-8">
    {#if invite}
      <h1 class="text-lg font-semibold m-0">Link this device</h1>
      <p class="text-sm text-muted-foreground m-0">
        Review the repository and token, then add it to this device.
      </p>

      <NewProjectForm
        initial={{
          name: invite.name,
          repoUrl: invite.repoUrl,
          pat: invite.pat,
        }}
        oncreated={(id) => goto(`/${id}`)}
        oncancel={() => goto("/projects")}
      />
    {:else if usable}
      <h1 class="text-lg font-semibold m-0">Link this device</h1>
      <p class="text-sm text-muted-foreground m-0">
        Enter the {PAIRING_CODE_LENGTH}-character code shown on the other
        device. It decrypts the project and token carried by this link.
      </p>

      <form class="flex flex-col gap-3" onsubmit={submit}>
        <input
          class="px-3 py-2 border border-input rounded-md text-center font-mono text-xl tracking-[0.3em] uppercase bg-background text-foreground"
          value={code}
          oninput={(e) => {
            code = normalizePairingCode(e.currentTarget.value).slice(
              0,
              PAIRING_CODE_LENGTH,
            );
          }}
          autocomplete="off"
          autocapitalize="characters"
          spellcheck={false}
          placeholder="ABC 234"
          aria-label="Pairing code"
          disabled={busy}
        />

        {#if error}
          <p
            class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2 m-0"
          >
            {error}
          </p>
        {/if}

        <div class="flex justify-between gap-2">
          <button
            class="btn-secondary"
            type="button"
            onclick={() => goto("/projects")}
          >
            Cancel
          </button>
          <button
            class="btn-primary"
            type="submit"
            disabled={busy || code.length < PAIRING_CODE_LENGTH}
          >
            {busy ? "Checking..." : "Link device"}
          </button>
        </div>
      </form>
    {:else}
      <h1 class="text-lg font-semibold m-0">Pairing link</h1>
      <p class="text-sm text-muted-foreground m-0">
        This pairing link is incomplete. Show a new code on the other device.
      </p>
      <button
        class="btn-secondary self-start"
        type="button"
        onclick={() => goto("/projects")}
      >
        Go to projects
      </button>
    {/if}
  </div>
</div>
