<!--
  @component
  The app window (PLAN 4.1): the sidebar, the editor area with one pane and its tab bar (M6 adds
  the second pane), and the status bar. Also owns the window title (PLAN 5.10:
  "<note name> — Tamanduá") and the page-level hardening of PLAN 5.10: files dropped anywhere
  outside a drop target never open in the page, and the page never navigates away.

  Talks to: `app/session.svelte.ts`, `channel.ts`, and the child components.
-->
<script lang="ts">
  import type { Session } from '../app/session.svelte.ts';
  import { channel } from '../channel.ts';
  import { status as t } from '../strings.ts';
  import { activeTab } from '../workspace/model.ts';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import NoteEditor from './NoteEditor.svelte';
  import Sidebar from './Sidebar.svelte';
  import StatusBar from './StatusBar.svelte';
  import TabBar from './TabBar.svelte';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();

  let pane = $derived(
    session.workspace.panes[session.workspace.focused] ?? session.workspace.panes[0],
  );
  let tab = $derived(activeTab(session.workspace));
  let note = $derived(tab === null ? undefined : session.index.get(tab.itemId));

  // PLAN 5.10: the window title names the note.
  $effect(() => {
    document.title = note === undefined ? channel.appName : `${note.name} — ${channel.appName}`;
  });

  // Saving every open note when the page is hidden or closed (PLAN 4.4), and the workspace with
  // it, so open tabs and expanded folders are restored exactly (PLAN 4.6).
  $effect(() => session.saves.watch(window));
  $effect(() => {
    const flush = (): void => void session.flushWorkspace();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  });

  // PLAN 5.10, "Drag and drop": a file dropped outside a drop target must not open in the page.
  // Drop targets (the tree) stop the event themselves; whatever reaches the document is refused.
  function refuseDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'none';
  }
</script>

<svelte:document ondragover={refuseDrop} ondrop={refuseDrop} />

<div class="shell" data-testid="shell">
  <div class="main">
    {#if session.workspace.sidebarVisible}
      <Sidebar {session} />
    {/if}
    <section class="editor-area">
      {#if pane}
        <TabBar {session} {pane} index={session.workspace.focused} />
        <div class="pane">
          {#if tab}
            {#key `${tab.id}:${tab.itemId}`}
              <NoteEditor {session} {tab} />
            {/key}
          {:else}
            <p class="empty">{t.emptyPane}</p>
          {/if}
        </div>
      {/if}
    </section>
  </div>
  <StatusBar {session} />
</div>

<ConfirmDialog {session} />

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .main {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .editor-area {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    background: var(--paper);
  }
  .pane {
    flex: 1;
    min-height: 0;
  }
  .empty {
    margin: 64px auto;
    max-width: 360px;
    color: var(--text-muted);
    font-family: var(--font-ui);
    text-align: center;
    user-select: none;
  }
</style>
