<script lang="ts">
  import { fly } from "svelte/transition";
  import { Lock } from "@lucide/svelte";
  import InfoTip from "$lib/components/InfoTip.svelte";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { deviceLock } from "$lib/stores/device.svelte";
  import { wipeLocalData } from "$lib/reset";
  import { PASSCODE_MIN_LENGTH } from "$lib/shared/constants";
  import { SECURITY_COPY } from "$lib/shared/copy";

  type SaveState = "idle" | "saving" | "success" | "error";

  let name = $state(prefs.name);
  let nameInfoOpen = $state(false);

  let saveState = $state<SaveState>("idle");
  let saveMsg = $state("");

  let changingPasscode = $state(false);
  let currentPasscode = $state("");
  let newPasscode = $state("");
  let confirmPasscode = $state("");
  let passcodeError = $state("");
  let passcodeBusy = $state(false);

  let confirmingReset = $state(false);

  let dismissTimeout: ReturnType<typeof setTimeout> | undefined;

  function dismiss() {
    saveState = "idle";
    saveMsg = "";
  }

  function showToast(state: SaveState, msg: string) {
    clearTimeout(dismissTimeout);
    saveState = state;
    saveMsg = msg;
    if (state === "success" || state === "error") {
      dismissTimeout = setTimeout(dismiss, 3000);
    }
  }

  function saveName() {
    showToast("saving", "Saving...");
    prefs.save({ name: name.trim() });
    name = prefs.name;
    showToast("success", "Saved");
  }

  function cancelChangePasscode() {
    changingPasscode = false;
    currentPasscode = "";
    newPasscode = "";
    confirmPasscode = "";
    passcodeError = "";
  }

  async function handleChangePasscode(e: Event) {
    e.preventDefault();
    passcodeError = "";

    if (newPasscode !== confirmPasscode) {
      passcodeError = "Passcodes do not match";
      return;
    }

    passcodeBusy = true;
    try {
      await deviceLock.changePasscode(currentPasscode, newPasscode);
      showToast("success", "Passcode updated");
      cancelChangePasscode();
    } catch (err) {
      passcodeError =
        err instanceof Error ? err.message : "Failed to update passcode";
    } finally {
      passcodeBusy = false;
    }
  }
</script>

<div class="flex flex-col items-center">
  <div class="w-full max-w-2xl flex flex-col gap-6">
    <section class="card flex flex-col gap-4">
      <h2 class="text-[15px] font-semibold m-0">Device</h2>

      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-1">
          <label
            for="device-name"
            class="text-xs text-muted-foreground font-medium"
          >
            Name
          </label>
          <InfoTip
            bind:open={nameInfoOpen}
            id="device-name-help"
            label="About the name"
            text="This name tags commits made from this device."
          />
        </div>
        <input
          id="device-name"
          type="text"
          bind:value={name}
          onchange={saveName}
          placeholder="unnamed"
          aria-describedby={nameInfoOpen ? "device-name-help" : undefined}
          class="px-3 py-2 border border-input rounded-md text-[15px] font-inherit bg-background text-foreground w-full box-border"
        />
      </div>
    </section>

    <section class="card flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-[15px] font-semibold m-0">Security</h2>
        <p class="text-sm text-muted-foreground font-normal m-0">
          {SECURITY_COPY.passcodePurpose}
        </p>
      </div>

      {#if changingPasscode}
        <div
          class="flex flex-col gap-3 rounded-md border border-input p-3 text-sm leading-relaxed"
        >
          <p class="m-0 text-muted-foreground">{SECURITY_COPY.noRecovery}</p>

          <form class="flex flex-col gap-3" onsubmit={handleChangePasscode}>
            {#if passcodeError}
              <p
                class="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2"
              >
                {passcodeError}
              </p>
            {/if}
            <label
              class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
            >
              <span>Current passcode</span>
              <input
                type="password"
                autocomplete="current-password"
                bind:value={currentPasscode}
                required
                disabled={passcodeBusy}
                class="px-3 py-2 border border-input rounded-md text-[15px] font-inherit bg-background text-foreground w-full box-border"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
            >
              <span>New passcode</span>
              <input
                type="password"
                autocomplete="new-password"
                bind:value={newPasscode}
                required
                minlength={PASSCODE_MIN_LENGTH}
                disabled={passcodeBusy}
                class="px-3 py-2 border border-input rounded-md text-[15px] font-inherit bg-background text-foreground w-full box-border"
              />
            </label>
            <label
              class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
            >
              <span>Confirm new passcode</span>
              <input
                type="password"
                autocomplete="new-password"
                bind:value={confirmPasscode}
                required
                minlength={PASSCODE_MIN_LENGTH}
                disabled={passcodeBusy}
                class="px-3 py-2 border border-input rounded-md text-[15px] font-inherit bg-background text-foreground w-full box-border"
              />
            </label>
            <div class="flex justify-between gap-2">
              <button
                class="btn-outline"
                type="button"
                onclick={cancelChangePasscode}
              >
                Cancel
              </button>
              <button class="btn-primary" type="submit" disabled={passcodeBusy}>
                {passcodeBusy ? "Updating..." : "Update passcode"}
              </button>
            </div>
          </form>
        </div>
      {:else}
        <div class="flex gap-2">
          <button
            class="btn-outline"
            type="button"
            onclick={() => (changingPasscode = true)}
          >
            Change passcode
          </button>
          <button
            class="btn-outline"
            type="button"
            onclick={() => deviceLock.lock()}
          >
            <Lock class="h-4 w-4 stroke-[1.5]" />
            Lock now
          </button>
        </div>
      {/if}
    </section>

    <section class="card flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <h2 class="text-[15px] font-semibold m-0">Data</h2>
        <p class="text-sm text-muted-foreground font-normal m-0">
          {SECURITY_COPY.dataIntro}
        </p>
      </div>

      {#if confirmingReset}
        <div
          class="text-sm text-foreground bg-destructive/10 border border-destructive/40 rounded-md p-3 leading-relaxed"
        >
          <p class="m-0 mb-3">Reset device? {SECURITY_COPY.resetWarning}</p>
          <div class="flex justify-between gap-2">
            <button
              class="btn-outline"
              type="button"
              onclick={() => (confirmingReset = false)}
            >
              Cancel
            </button>
            <button
              class="btn-destructive"
              type="button"
              onclick={wipeLocalData}
            >
              Reset device
            </button>
          </div>
        </div>
      {:else}
        <button
          class="btn-destructive self-start"
          type="button"
          onclick={() => (confirmingReset = true)}
        >
          Reset device
        </button>
      {/if}
    </section>
  </div>

  <footer class="text-xs text-muted-foreground/50 font-mono mt-8 text-center">
    <span>{import.meta.env.VITE_GIT_COMMIT}</span>
    &mdash;
    <span>{import.meta.env.VITE_BUILD_TIME}</span>
  </footer>
</div>

{#if saveState !== "idle"}
  <div
    role="status"
    transition:fly={{ x: 64, duration: 200, opacity: 1 }}
    class="fixed bottom-6 right-6 z-50 px-3 py-2 rounded-md shadow-lg text-sm border {saveState ===
    'saving'
      ? 'bg-muted text-muted-foreground'
      : saveState === 'success'
        ? 'bg-green-500/20 border-green-500 text-green-500'
        : 'bg-destructive/20 border-destructive text-destructive'}"
  >
    {saveMsg}
  </div>
{/if}
