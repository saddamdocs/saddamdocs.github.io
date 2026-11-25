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
  import { notices as noticeText, transfer as transferText } from '../strings.ts';
  import Banner from './Banner.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import ImportSummary from './ImportSummary.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
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
      {#if session.reminder}
        <!-- PLAN 4.15: the export reminder, with "Export now" and "Later" (a day). -->
        <Banner
          kind="info"
          testid="export-reminder"
          text={transferText.reminder(
            session.lastExport === null
              ? null
              : Math.floor((Date.now() - session.lastExport) / 86_400_000),
          )}
          actions={[
            { label: noticeText.exportNow, run: () => void session.exportZip() },
            { label: transferText.later, run: () => void session.snoozeReminder() },
          ]}
        />
      {/if}
      {#if pane}
        <TabBar {session} {pane} index={session.workspace.focused} />
        {#if session.saveState.status === 'failed'}
          <!-- PLAN 4.4: a failed save keeps the text, retries, and offers Retry and Export now. -->
          <Banner
            kind="error"
            text={noticeText.saveFailed}
            testid="save-failed"
            actions={[
              { label: noticeText.retry, run: () => session.focusedSaver?.flush() },
              { label: noticeText.exportNow, run: () => session.openSettings('data') },
            ]}
          />
        {/if}
        <div class="pane">
          {#if tab && note?.kind === 'file'}
            {#key tab.itemId}
              <ImageViewer {session} itemId={tab.itemId} />
            {/key}
          {:else if tab}
            <div class="note-row">
              <div class="note-editor">
                {#key `${tab.id}:${tab.itemId}:${String(session.textEpoch[tab.itemId] ?? 0)}`}
                  <NoteEditor {session} {tab} />
                {/key}
              </div>
              {#if session.historyTab === tab.id}
                {#key tab.itemId}
                  <HistoryPanel {session} itemId={tab.itemId} />
                {/key}
              {/if}
            </div>
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
<SettingsDialog {session} />
<ImportSummary {session} />

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
  .note-row {
    display: flex;
    height: 100%;
  }
  .note-editor {
    flex: 1;
    min-width: 0;
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
