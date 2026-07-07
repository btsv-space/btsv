<script lang="ts">
  import type { Component } from "svelte";

  let {
    checked = false,
    onCheckedChange,
    onIcon: OnIcon,
    offIcon: OffIcon,
    onBg = "bg-primary",
    offBg = "bg-muted",
    onForeground = "text-primary",
    offForeground = "text-primary",
    radius = "full",
    disabled = false,
    size = 6,
    lengthMultiple = 1.6,
    class: className,
  } = $props<{
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    onIcon?: Component;
    offIcon?: Component;
    onBg?: string;
    offBg?: string;
    onForeground?: string;
    offForeground?: string;
    radius?: "full" | "lg" | "md" | "sm" | "square";
    disabled?: boolean;
    size?: number;
    lengthMultiple?: number;
    class?: string;
  }>();

  let trackH = $derived(size * 4);
  let knobSize = $derived((size - 1) * 4);
  let trackW = $derived(Math.round(size * lengthMultiple * 4));
  let iconSize = $derived(Math.round(knobSize * 0.65));
  let pad = $derived((trackH - knobSize) / 2);
  let travel = $derived(trackW - knobSize - pad * 2);

  let trackRadius = $derived(
    (() => {
      switch (radius) {
        case "full":
          return "rounded-full";
        case "lg":
          return "rounded-xl";
        case "md":
          return "rounded-lg";
        case "sm":
          return "rounded-md";
        case "square":
          return "rounded-none";
        default:
          return "rounded-full";
      }
    })(),
  );

  let knobRadius = $derived(
    (() => {
      switch (radius) {
        case "full":
          return "rounded-full";
        case "lg":
          return "rounded-lg";
        case "md":
          return "rounded-md";
        case "sm":
          return "rounded-sm";
        case "square":
          return "rounded-none";
        default:
          return "rounded-full";
      }
    })(),
  );

  function toggle() {
    if (disabled) return;
    onCheckedChange?.(!checked);
  }
</script>

<button
  role="switch"
  aria-checked={checked}
  {disabled}
  aria-label="Toggle"
  onclick={toggle}
  class="relative inline-flex items-center shrink-0 cursor-pointer transition-colors duration-200 {trackRadius} {checked
    ? onBg
    : offBg} {disabled ? 'opacity-50 cursor-not-allowed' : ''} {className}"
  style="height:{trackH}px;width:{trackW}px"
>
  <span
    class="absolute z-10 flex items-center justify-center bg-background shadow-sm transition-transform duration-200 {knobRadius}"
    style="height:{knobSize}px;width:{knobSize}px;left:{pad}px;transform:{checked
      ? `translateX(${travel}px)`
      : 'translateX(0)'}"
  >
    {#if checked && OnIcon}
      <OnIcon
        style="height:{iconSize}px;width:{iconSize}px"
        class="icon {onForeground}"
      />
    {:else if !checked && OffIcon}
      <OffIcon
        style="height:{iconSize}px;width:{iconSize}px"
        class="icon {offForeground}"
      />
    {/if}
  </span>
</button>
