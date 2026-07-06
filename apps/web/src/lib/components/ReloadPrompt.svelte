<script lang="ts">
  import { useRegisterSW } from "virtual:pwa-register/svelte";
  import Modal from "./Modal.svelte";

  const { needRefresh, updateServiceWorker } = useRegisterSW();
  let dismissed = $state(false);

  function handleReload() {
    dismissed = false;
    updateServiceWorker(true);
  }

  function handleDismiss() {
    dismissed = true;
  }
</script>

{#if $needRefresh && !dismissed}
  <Modal show={true} onclose={handleDismiss}>
    <div>
      <h2 class="text-lg font-semibold mb-2">New Version Available</h2>
      <p class="text-sm text-muted-foreground mb-4">
        A new version of the app is ready. Reload to get the latest updates.
      </p>
      <div class="flex justify-between gap-3">
        <button class="btn-secondary text-sm px-4 py-2" onclick={handleDismiss}>
          Dismiss
        </button>
        <button class="btn-primary text-sm px-4 py-2" onclick={handleReload}>
          Reload
        </button>
      </div>
    </div>
  </Modal>
{/if}
