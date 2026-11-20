<script lang="ts">
  import { onDestroy } from "svelte";
  import qrcode from "qrcode-generator";
  import Modal from "$lib/components/Modal.svelte";
  import { createPairing, formatPairingCode, pairingUrl } from "$lib/pairing";
  import { ensureGitToken } from "$lib/secrets";
  import type { TProjectEntry } from "$lib/shared/types";

  const TTL_SECONDS = 120;

  let {
    project,
    show,
    onclose,
  }: {
    project: TProjectEntry | null;
    show: boolean;
    onclose: () => void;
  } = $props();

  let image = $state<string | null>(null);
  let code = $state("");
  let showingCode = $state(false);
  let error = $state("");
  let secondsLeft = $state(TTL_SECONDS);
  let timer: ReturnType<typeof setInterval> | undefined;

  function stopTimer() {
    clearInterval(timer);
    timer = undefined;
  }

  function reset() {
    stopTimer();
    image = null;
    code = "";
    showingCode = false;
    error = "";
    secondsLeft = TTL_SECONDS;
  }

  async function generate() {
    if (!project) return;
    reset();

    const pat = await ensureGitToken(project.id);
    if (!pat) {
      error = "Token unavailable — re-enter it for this project first.";
      return;
    }

    const invite = await createPairing({
      v: 1,
      name: project.name,
      repoUrl: project.repoUrl,
      pat,
    });

    const qr = qrcode(0, "M");
    qr.addData(pairingUrl(invite.blob));
    qr.make();

    image = qr.createDataURL(6, 8);
    code = invite.code;
    secondsLeft = TTL_SECONDS;

    timer = setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft <= 0) reset();
    }, 1000);
  }

  // Fresh code + fresh QR every time the modal opens; nothing survives close.
  $effect(() => {
    if (!show) {
      reset();
      return;
    }
    void generate();
  });

  onDestroy(stopTimer);
</script>

<Modal {show} {onclose}>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold m-0">Link another device</h2>

    <p class="text-sm text-muted-foreground m-0">
      Scan this with the camera app on the other device, then enter the pairing
      code it asks for. Please be careful, these are like passwords.
    </p>

    {#if error}
      <p
        class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2"
      >
        {error}
      </p>
      <button class="btn-secondary self-start" type="button" onclick={generate}>
        Try again
      </button>
    {:else}
      <div class="aspect-square w-full self-center max-w-72">
        {#if image && secondsLeft > 0}
          <button
            type="button"
            class="h-full w-full flex items-center justify-center rounded-md border border-border bg-card p-2"
            onclick={() => (showingCode = !showingCode)}
            aria-label={showingCode
              ? "Show the QR code"
              : "Show the pairing code"}
            title={showingCode ? "Show the QR code" : "Show the pairing code"}
          >
            {#if showingCode}
              <span
                class="font-mono text-3xl tracking-[0.15em] text-foreground"
              >
                {formatPairingCode(code)}
              </span>
            {:else}
              <img src={image} alt="" class="h-full w-full object-contain" />
            {/if}
          </button>
        {:else}
          <div
            class="h-full w-full flex flex-col items-center justify-center gap-2 rounded-md border border-input bg-card p-3 text-center"
          >
            <p class="text-sm text-muted-foreground m-0">
              This code has expired.
            </p>
            <button class="btn-secondary" type="button" onclick={generate}>
              New code
            </button>
          </div>
        {/if}
      </div>

      <p class="text-xs text-muted-foreground m-0 text-center">
        {#if image && secondsLeft > 0}
          {showingCode ? "Tap for the QR" : "Tap for the pairing code"}
          · expires in {secondsLeft}s
        {:else}
          Codes last {TTL_SECONDS}s.
        {/if}
      </p>
    {/if}

    <button class="btn-outline self-end" type="button" onclick={onclose}>
      Done
    </button>
  </div>
</Modal>
