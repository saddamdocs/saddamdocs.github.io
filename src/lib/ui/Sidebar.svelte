<!--
  @component
  The sidebar (PLAN 4.1): the buttons new note, new folder, search, calendar, Trash and settings;
  below them the vault's name and its tree, or the Trash. Search (M7), calendar (M9) and settings
  (M8) are shown disabled until their milestones. Resizable from 180 to 480 px by its right edge.

  Talks to: `app/session.svelte.ts`, `FileTree.svelte`, `TrashView.svelte`, `strings.ts`,
  `workspace/model.ts` for the width limits.
-->
<script lang="ts">
  import type { Session } from '../app/session.svelte.ts';
  import { sidebar as t } from '../strings.ts';
  import { SIDEBAR_LIMITS } from '../workspace/model.ts';
  import FileTree from './FileTree.svelte';
  import Icon, { type IconName } from './Icon.svelte';
  import TrashView from './TrashView.svelte';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();

  interface Button {
    icon: IconName;
    label: string;
    run?: () => void;
    pressed?: boolean;
    testid: string;
  }

  let buttons: Button[] = $derived([
    { icon: 'note-plus', label: t.newNote, run: () => void session.newNote(), testid: 'new-note' },
    {
      icon: 'folder-plus',
      label: t.newFolder,
      run: () => void session.newFolder(),
      testid: 'new-folder',
    },
    { icon: 'search', label: t.search, testid: 'search' },
    { icon: 'calendar', label: t.calendar, testid: 'calendar' },
    {
      icon: 'trash',
      label: t.trash,
      run: () => (session.sidebarView = session.sidebarView === 'trash' ? 'tree' : 'trash'),
      pressed: session.sidebarView === 'trash',
      testid: 'trash-button',
    },
    { icon: 'settings', label: t.settings, testid: 'settings' },
  ]);

  /** Drags the sidebar's right edge. */
  function startResize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = session.workspace.sidebarWidth;
    const move = (e: PointerEvent): void => {
      const width = Math.round(
        Math.min(SIDEBAR_LIMITS[1], Math.max(SIDEBAR_LIMITS[0], startWidth + e.clientX - startX)),
      );
      session.setWorkspace({ ...session.workspace, sidebarWidth: width });
    };
    const up = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }

  function resizeKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
    if (step === 0) return;
    event.preventDefault();
    const width = Math.min(
      SIDEBAR_LIMITS[1],
      Math.max(SIDEBAR_LIMITS[0], session.workspace.sidebarWidth + step),
    );
    session.setWorkspace({ ...session.workspace, sidebarWidth: width });
  }
</script>

<aside class="sidebar" style:width="{session.workspace.sidebarWidth}px" data-testid="sidebar">
  <div class="buttons">
    {#each buttons as b (b.testid)}
      <button
        type="button"
        class="tool"
        class:pressed={b.pressed}
        title={b.label}
        aria-label={b.label}
        aria-pressed={b.pressed}
        disabled={b.run === undefined}
        onclick={b.run}
        data-testid={b.testid}
      >
        <Icon name={b.icon} />
      </button>
    {/each}
  </div>
  {#if session.sidebarView === 'trash'}
    <h2 class="title">{t.trashTitle}</h2>
    <TrashView {session} />
  {:else}
    <h2 class="title">{t.vaultName}</h2>
    <FileTree {session} />
  {/if}
  <!-- A focusable separator is the ARIA "window splitter" pattern: keyboard users resize with the
       arrow keys. Svelte's a11y lint treats every separator as non-interactive. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="resize"
    role="separator"
    aria-orientation="vertical"
    aria-label={t.resize}
    aria-valuemin={SIDEBAR_LIMITS[0]}
    aria-valuemax={SIDEBAR_LIMITS[1]}
    aria-valuenow={session.workspace.sidebarWidth}
    tabindex="0"
    onpointerdown={startResize}
    onkeydown={resizeKey}
  ></div>
</aside>

<style>
  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: none;
    min-height: 0;
    background: var(--sidebar);
    border-right: 1px solid var(--border);
    font-family: var(--font-ui);
    user-select: none;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
  }
  .tool {
    display: inline-flex;
    padding: 6px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--text);
  }
  .tool:hover:not(:disabled),
  .tool.pressed {
    background: var(--hover);
  }
  .tool:disabled {
    color: var(--text-muted);
    opacity: 0.45;
    cursor: default;
  }
  .title {
    margin: 10px 16px 2px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .resize {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 2;
  }
  .resize:hover,
  .resize:focus-visible {
    background: var(--border);
  }
</style>
