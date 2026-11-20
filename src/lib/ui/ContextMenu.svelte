<!--
  @component
  The app's own right-click menu (PLAN 5.10, "Context menus"), used on the tree, the tabs and the
  Trash. The editor keeps the browser's menu. Opens at the pointer, stays inside the window, and
  works from the keyboard: Up and Down move, Enter runs, Escape closes.

  Talks to: nothing; the parent passes the entries and closes it.
-->
<script lang="ts" module>
  /** One entry of a menu; `null` draws a separator. */
  export type MenuEntry = {
    readonly label: string;
    readonly run: () => void;
    readonly danger?: boolean;
    readonly disabled?: boolean;
  } | null;
</script>

<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    /** The entries, in order. */
    entries: readonly MenuEntry[];
    /** Where the menu opens, in viewport px. */
    x: number;
    y: number;
    /** Closes the menu (after an entry ran, on Escape, or on a click elsewhere). */
    onClose: () => void;
  }
  let { entries, x, y, onClose }: Props = $props();
  let menu: HTMLDivElement | undefined = $state();
  let left = $state(0);
  let top = $state(0);

  $effect(() => {
    left = x;
    top = y;
    void tick().then(() => {
      if (menu === undefined) return;
      // Keep the whole menu inside the window.
      const rect = menu.getBoundingClientRect();
      left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
      top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
      menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    });
  });

  function buttons(): HTMLButtonElement[] {
    return menu === undefined
      ? []
      : [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  }

  /** A press outside the menu closes it. */
  function onPointerDown(event: PointerEvent): void {
    if (menu !== undefined && !menu.contains(event.target as Node)) onClose();
  }

  function onKeydown(event: KeyboardEvent): void {
    const list = buttons();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown') list[(at + 1) % list.length]?.focus();
    else if (event.key === 'ArrowUp') list[(at - 1 + list.length) % list.length]?.focus();
    else if (event.key === 'Tab') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  }
</script>

<svelte:window onpointerdown={onPointerDown} onblur={onClose} />

<div
  class="menu"
  role="menu"
  tabindex="-1"
  bind:this={menu}
  style:left="{left}px"
  style:top="{top}px"
  onkeydown={onKeydown}
  oncontextmenu={(e) => e.preventDefault()}
  data-testid="context-menu"
>
  {#each entries as entry, i (i)}
    {#if entry === null}
      <hr />
    {:else}
      <button
        type="button"
        role="menuitem"
        class:danger={entry.danger}
        disabled={entry.disabled}
        onclick={() => {
          onClose();
          entry.run();
        }}
      >
        {entry.label}
      </button>
    {/if}
  {/each}
</div>

<style>
  .menu {
    position: fixed;
    z-index: 40;
    min-width: 180px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--paper);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.14);
    font-family: var(--font-ui);
    font-size: 14px;
    user-select: none;
  }
  button {
    display: block;
    width: 100%;
    padding: 5px 10px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--text);
    text-align: left;
  }
  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--hover);
  }
  button:disabled {
    color: var(--text-muted);
    cursor: default;
  }
  .danger {
    color: var(--danger);
  }
  hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 2px;
  }
</style>
