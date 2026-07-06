<script lang="ts">
  const {
    onConfirm,
    onCancel,
    onDiscard,
    message = "You have unsaved changes. What would you like to do?",
    confirmText = onDiscard ? "Save &amp; close" : "Confirm",
    title,
    cancelText = "Cancel",
    danger = false,
  } = $props<{
    onConfirm: () => void;
    onCancel?: () => void;
    onDiscard?: () => void;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  }>();
</script>

<div
  class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
  role="dialog"
  aria-modal="true"
>
  <div class="card max-w-100 w-[90%] shadow-xl">
    {#if title}
      <h2 class="text-base font-semibold mb-3" class:text-destructive={danger}>
        {title}
      </h2>
    {/if}
    <p class="text-[15px] mb-4 text-foreground">{message}</p>
    <div class="flex gap-2 justify-end flex-wrap">
      {#if onCancel}
        <button class="btn-outline" onclick={onCancel}>
          {cancelText}
        </button>
      {/if}
      <button
        class={danger ? "btn-destructive" : "btn-primary"}
        onclick={onConfirm}
      >
        {confirmText}
      </button>
      {#if onDiscard}
        <button class="btn-outline" onclick={onDiscard}>
          Discard changes
        </button>
      {/if}
    </div>
  </div>
</div>
