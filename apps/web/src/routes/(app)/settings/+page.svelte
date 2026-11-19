<script lang="ts">
  import { fly } from "svelte/transition";
  import { prefs } from "$lib/stores/prefs.svelte";
  import { deviceLock } from "$lib/stores/device.svelte";
  import { dbSavePrefs } from "$lib/db";
  import { wipeLocalData } from "$lib/reset";
  import { PASSCODE_MIN_LENGTH } from "$lib/shared/constants";
  import { SECURITY_COPY } from "$lib/shared/copy";

  type SaveState = "idle" | "saving" | "success" | "error";

  let name = $state(prefs.value.name);
  let saveState = $state<SaveState>("idle");
  let saveMsg = $state("");

  let currentPasscode = $state("");
  let newPasscode = $state("");
  let confirmPasscode = $state("");
  let passcodeError = $state("");
  let passcodeBusy = $state(false);

  let confirmingWipe = $state(false);

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

  async function saveName() {
    showToast("saving", "Saving...");
    try {
      const next = { ...prefs.value, name: name.trim() };
      prefs.value = next;
      await dbSavePrefs(next);
      name = next.name;
      showToast("success", "Saved");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to save");
      console.error("[settings] failed to save name:", err);
    }
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
      currentPasscode = "";
      newPasscode = "";
      confirmPasscode = "";
      showToast("success", "Passcode updated");
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
      <div>
        <h2 class="text-[15px] font-semibold m-0">Device</h2>
        <p class="text-sm text-muted-foreground font-normal m-0 mb-3">
          This name tags commits made from this device.
        </p>
      </div>
      <label
        class="flex flex-col gap-1 text-xs text-muted-foreground font-medium"
      >
        <span>Name</span>
        <input
          type="text"
          bind:value={name}
          onchange={saveName}
          placeholder="unnamed"
          class="px-3 py-2 border border-input rounded-md text-[15px] font-inherit bg-background text-foreground w-full box-border"
        />
      </label>
    </section>

    <section class="card flex flex-col gap-4">
      <div>
        <h2 class="text-[15px] font-semibold m-0">Security</h2>
        <p class="text-sm text-muted-foreground font-normal m-0 mb-3">
          {SECURITY_COPY.passcodePurpose}
          {SECURITY_COPY.noRecovery}
        </p>
      </div>

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
            class="btn-secondary"
            type="button"
            onclick={() => deviceLock.lock()}
          >
            Lock now
          </button>
          <button class="btn-primary" type="submit" disabled={passcodeBusy}>
            {passcodeBusy ? "Updating..." : "Change passcode"}
          </button>
        </div>
      </form>
    </section>

    <section class="card flex flex-col gap-4">
      <div>
        <h2 class="text-[15px] font-semibold m-0">Data</h2>
        <p class="text-sm text-muted-foreground font-normal m-0 mb-3">
          {SECURITY_COPY.wipeWarning}
        </p>
      </div>

      {#if confirmingWipe}
        <div
          class="text-sm text-foreground bg-destructive/10 border border-destructive/40 rounded-md p-3 leading-relaxed"
        >
          <p class="m-0 mb-3">
            {SECURITY_COPY.deleteAllConfirm}
          </p>
          <div class="flex justify-between gap-2">
            <button
              class="btn-destructive"
              type="button"
              onclick={wipeLocalData}
            >
              Delete everything
            </button>
            <button
              class="btn-secondary"
              type="button"
              onclick={() => (confirmingWipe = false)}
            >
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <button
          class="btn-destructive self-start"
          type="button"
          onclick={() => (confirmingWipe = true)}
        >
          Delete all local data
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
