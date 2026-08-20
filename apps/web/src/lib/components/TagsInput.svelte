<script lang="ts">
  import { tick } from "svelte";
  import {
    getActiveSegment,
    replaceSegment,
    filterTags,
  } from "$lib/tagsAutocomplete";

  let {
    value = $bindable(""),
    allTags,
    placeholder = "",
  }: {
    value: string;
    allTags: string[];
    placeholder?: string;
  } = $props();

  const listboxId = $props.id();

  let inputEl: HTMLInputElement | undefined = $state();
  let open = $state(false);
  let activeIndex = $state(0);
  let segment = $state("");

  const suggestions = $derived(filterTags(allTags, segment, value));
  const showCreate = $derived(
    segment !== "" &&
      !allTags.some((t) => t.toLowerCase() === segment.toLowerCase()),
  );
  const optionCount = $derived(suggestions.length + (showCreate ? 1 : 0));
  const expanded = $derived(open && optionCount > 0);

  function refreshSegment() {
    const next = getActiveSegment(
      value,
      inputEl?.selectionStart ?? value.length,
    );
    if (next !== segment) {
      segment = next;
      activeIndex = 0;
    }
  }

  async function accept(tag: string) {
    const caret = inputEl?.selectionStart ?? value.length;
    const r = replaceSegment(value, caret, tag);
    value = r.value;
    activeIndex = 0;
    await tick();
    inputEl?.setSelectionRange(r.caret, r.caret);
    refreshSegment();
  }

  function activeLabel(): string {
    return activeIndex < suggestions.length
      ? suggestions[activeIndex]
      : segment; // create row
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        refreshSegment();
        open = true;
      } else if (optionCount > 0) {
        const dir = e.key === "ArrowDown" ? 1 : -1;
        activeIndex = (activeIndex + dir + optionCount) % optionCount;
      }
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (expanded) {
        e.preventDefault();
        void accept(activeLabel());
      }
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  $effect(() => {
    if (!expanded) return;
    document
      .getElementById(`${listboxId}-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  });
</script>

<div class="relative">
  <input
    bind:this={inputEl}
    bind:value
    type="text"
    role="combobox"
    aria-expanded={expanded}
    aria-controls={listboxId}
    aria-activedescendant={expanded ? `${listboxId}-${activeIndex}` : undefined}
    aria-autocomplete="list"
    {placeholder}
    autocapitalize="off"
    autocorrect="off"
    spellcheck={false}
    class="px-3 py-2 border border-input rounded-md text-sm font-inherit text-foreground w-full"
    onfocus={() => {
      refreshSegment();
      open = true;
    }}
    oninput={() => {
      refreshSegment();
      open = true;
    }}
    {onkeydown}
    onkeyup={refreshSegment}
    onclick={refreshSegment}
    onblur={() => (open = false)}
  />
  {#if expanded}
    <ul
      role="listbox"
      id={listboxId}
      class="absolute left-0 right-0 top-full mt-1 z-30 card shadow-lg p-1 max-h-40 overflow-y-auto"
    >
      {#each suggestions as tag, i (tag)}
        <!-- mousedown preventDefault holds input focus (iOS fires it as a
             compatibility event on tap); click accepts. No pointerdown/
             touchstart cancelation — on iOS Safari that kills list scroll
             and fails to hold focus. -->
        <!-- svelte-ignore a11y_click_events_have_key_events (combobox: keyboard lives on the input, options are never focused) -->
        <li
          role="option"
          id={`${listboxId}-${i}`}
          aria-selected={i === activeIndex}
          class="px-2 py-1.5 text-sm rounded cursor-pointer {i === activeIndex
            ? 'bg-accent text-accent-foreground'
            : ''}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => void accept(tag)}
          onmousemove={() => (activeIndex = i)}
        >
          {tag}
        </li>
      {/each}
      {#if showCreate}
        <!-- svelte-ignore a11y_click_events_have_key_events (combobox: keyboard lives on the input, options are never focused) -->
        <li
          role="option"
          id={`${listboxId}-${suggestions.length}`}
          aria-selected={activeIndex === suggestions.length}
          class="px-2 py-1.5 text-sm rounded cursor-pointer text-muted-foreground {activeIndex ===
          suggestions.length
            ? 'bg-accent'
            : ''}"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => void accept(segment)}
          onmousemove={() => (activeIndex = suggestions.length)}
        >
          Create "{segment}"
        </li>
      {/if}
    </ul>
  {/if}
</div>
