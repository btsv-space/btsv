<script lang="ts">
  import { Lock } from "@lucide/svelte";
  import { PASSCODE_MIN_LENGTH } from "$lib/shared/constants";
  import { wipeLocalData } from "$lib/reset";
  import { deviceLock } from "$lib/stores/device.svelte";

  let passcode = $state("");
  let confirmPasscode = $state("");
  let error = $state("");
  let busy = $state(false);
  let confirmingReset = $state(false);

  const isSetup = $derived(deviceLock.state === "unconfigured");

  async function submit(e: Event) {
    e.preventDefault();
    error = "";
    busy = true;

    try {
      if (isSetup) {
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

  async function handleReset() {
    confirmingReset = false;
    await wipeLocalData();
  }
</script>

<div class="min-h-[70vh] flex items-center justify-center">
  <form class="card w-full max-w-sm flex flex-col gap-4" onsubmit={submit}>
    <div class="flex items-center gap-2">
      <Lock class="icon" />
      <h1 class="text-lg font-semibold m-0">
        {isSetup ? "Protect this device" : "Unlock"}
      </h1>
    </div>

    {#if isSetup}
      <p class="text-sm text-muted-foreground m-0">
        Posts live on this device and sync straight to GitHub. Set a passcode so
        your GitHub tokens are encrypted at rest.
      </p>
      <p class="text-sm text-muted-foreground m-0">
        There is no recovery: if you forget it, you reset the device and
        re-enter your tokens. Posts are unaffected.
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
        autocomplete={isSetup ? "new-password" : "current-password"}
        bind:value={passcode}
        required
        minlength={PASSCODE_MIN_LENGTH}
        disabled={busy || confirmingReset}
        class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
      />
    </label>

    {#if isSetup}
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
          disabled={busy || confirmingReset}
          class="px-3 py-2 border border-input rounded-md text-sm font-inherit bg-background text-foreground"
        />
      </label>
    {/if}

    {#if confirmingReset}
      <div
        class="text-sm text-foreground bg-muted/40 border border-border rounded-md p-3 leading-relaxed"
      >
        <p class="m-0 mb-3">
          Reset the device? All local data is wiped — projects, posts, tokens,
          and the passcode. Posts already pushed to GitHub can be re-cloned;
          unpushed changes are lost.
        </p>
        <div class="flex gap-2">
          <button class="btn-secondary" type="button" onclick={handleReset}>
            Reset device
          </button>
          <button
            class="btn-secondary"
            type="button"
            onclick={() => (confirmingReset = false)}
          >
            Cancel
          </button>
        </div>
      </div>
    {:else}
      <div class="flex items-center justify-between gap-2 mt-2">
        {#if !isSetup}
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
            {isSetup ? "Setting up..." : "Unlocking..."}
          {:else}
            {isSetup ? "Set passcode" : "Unlock"}
          {/if}
        </button>
      </div>
    {/if}
  </form>
</div>
