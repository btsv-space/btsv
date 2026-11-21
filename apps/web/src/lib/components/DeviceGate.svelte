<script lang="ts">
  import { FingerprintPattern, Lock, TriangleAlert } from "@lucide/svelte";
  import { PASSCODE_MIN_LENGTH } from "$lib/shared/constants";
  import { SECURITY_COPY } from "$lib/shared/copy";
  import { wipeLocalData } from "$lib/reset";
  import { deviceLock } from "$lib/stores/device.svelte";

  let passcode = $state("");
  let confirmPasscode = $state("");
  let error = $state("");
  let busy = $state(false);
  let confirmingReset = $state(false);

  const needsSetup = $derived(deviceLock.state === "unconfigured");

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    busy = true;

    try {
      if (needsSetup) {
        if (passcode !== confirmPasscode) {
          throw new Error("Passcodes do not match");
        }
        await deviceLock.setup(passcode);
      } else if (!(await deviceLock.unlock(passcode))) {
        throw new Error("Incorrect passcode");
      }
      passcode = "";
      confirmPasscode = "";
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong";
    } finally {
      busy = false;
    }
  }

  async function unlockWithPasskey() {
    error = "";
    busy = true;
    try {
      if (!(await deviceLock.unlockWithPasskey())) {
        error = "Passkey unlock failed — enter your passcode";
      }
    } finally {
      busy = false;
    }
  }

  async function handleReset() {
    confirmingReset = false;
    await wipeLocalData();
  }
</script>

<div class="min-h-[70vh] flex items-center justify-center">
  {#if confirmingReset}
    <div class="card w-full max-w-sm flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <TriangleAlert class="icon text-destructive" />
        <h1 class="text-lg font-semibold m-0 text-destructive">
          Reset device?
        </h1>
      </div>

      <p
        class="text-sm text-foreground bg-destructive/10 border border-destructive/40 rounded-md p-3 leading-relaxed m-0"
      >
        {SECURITY_COPY.resetWarning}
      </p>

      <div class="flex justify-between gap-2">
        <button
          class="btn-secondary"
          type="button"
          onclick={() => (confirmingReset = false)}
        >
          Cancel
        </button>
        <button class="btn-destructive" type="button" onclick={handleReset}>
          Reset device
        </button>
      </div>
    </div>
  {:else}
    <form
      class="card relative w-full max-w-sm flex flex-col gap-4"
      onsubmit={submit}
    >
      <div class="flex items-center gap-2">
        <Lock class="icon" />
        <h1 class="text-lg font-semibold m-0">
          {needsSetup ? "Protect this device" : "Unlock"}
        </h1>
      </div>

      {#if needsSetup}
        <p class="text-sm text-muted-foreground m-0">
          {SECURITY_COPY.setupIntro}
        </p>
        <p class="text-sm text-muted-foreground m-0">
          {SECURITY_COPY.noRecovery}
        </p>
      {:else}
        <p class="text-sm text-muted-foreground m-0">
          Enter your passcode to continue.
        </p>
      {/if}

      {#if error}
        <p
          class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2"
        >
          {error}
        </p>
      {/if}

      <label
        class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
      >
        <span>Passcode</span>
        <input
          type="password"
          autocomplete={needsSetup ? "new-password" : "current-password"}
          bind:value={passcode}
          required
          minlength={PASSCODE_MIN_LENGTH}
          disabled={busy}
          class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
        />
      </label>

      {#if needsSetup}
        <label
          class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
        >
          <span>Confirm passcode</span>
          <input
            type="password"
            autocomplete="new-password"
            bind:value={confirmPasscode}
            required
            minlength={PASSCODE_MIN_LENGTH}
            disabled={busy}
            class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
          />
        </label>
      {/if}

      <div class="flex items-center justify-between gap-2 mt-2">
        {#if !needsSetup}
          <button
            class="bg-none border-none text-primary cursor-pointer text-sm p-0"
            type="button"
            onclick={() => (confirmingReset = true)}
          >
            Forgot passcode?
          </button>
        {:else}
          <span></span>
        {/if}
        <button class="btn-primary" type="submit" disabled={busy}>
          {#if busy}
            {needsSetup ? "Setting up..." : "Unlocking..."}
          {:else}
            {needsSetup ? "Set passcode" : "Unlock"}
          {/if}
        </button>
      </div>
      {#if !needsSetup && deviceLock.hasPasskey}
        <button
          class="absolute left-1/2 top-full mt-6 -translate-x-1/2 size-12 border border-border bg-card text-card-foreground hover:bg-accent"
          type="button"
          aria-label="Unlock with passkey"
          title="Unlock with passkey"
          onclick={unlockWithPasskey}
          disabled={busy}
        >
          <FingerprintPattern class="icon" />
        </button>
      {/if}
    </form>
  {/if}
</div>
