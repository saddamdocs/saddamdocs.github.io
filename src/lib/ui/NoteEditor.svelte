<!--
  @component
  One open note: a CodeMirror editor in source mode (M4 adds live preview) and its saver (PLAN 6.2).
  Restores the tab's cursor and scroll position, reports edits, blur and Ctrl+S to the saver,
  updates the word count, and, when it closes, saves before letting go.

  The parent mounts one per tab and keys it by tab and note, so props never change under it.

  Talks to: `editor/setup.ts`, `autosave/controller.ts`, `app/session.svelte.ts`,
  `editor/words.ts`.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { EditorView } from '@codemirror/view';
  import type { Session } from '../app/session.svelte.ts';
  import { NoteSaver } from '../autosave/controller.ts';
  import { createEditor } from '../editor/setup.ts';
  import { countWords } from '../editor/words.ts';
  import { SNAPSHOT_IDLE_MS } from '../config.ts';
  import { logEvent } from '../store/log.ts';
  import { status as t } from '../strings.ts';
  import type { Tab } from '../workspace/model.ts';

  interface Props {
    /** The running session. */
    session: Session;
    /** The tab this editor shows. */
    tab: Tab;
  }
  let { session, tab }: Props = $props();
  let host: HTMLDivElement | undefined = $state();

  $effect(() => {
    const element = host;
    if (element === undefined) return;
    const { id: tabId, itemId, cursor, scroll } = untrack(() => tab);
    let view: EditorView | null = null;
    let saver: NoteSaver | null = null;
    let closed = false;
    let editedSinceSnapshot = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    /** Keeps a snapshot of the current text; the vault applies the 10-minute rule. */
    const snapshot = (reason: 'idle' | 'close'): void => {
      if (!editedSinceSnapshot || view === null) return;
      editedSinceSnapshot = false;
      session.vault
        .snapshot(itemId, view.state.doc.toString(), reason)
        .catch((error: unknown) =>
          logEvent(
            session.vault.db,
            'warn',
            'snapshot-failed',
            error instanceof Error ? error.name : '',
          ),
        );
    };

    void session.vault.readText(itemId).then(
      (text) => {
        if (closed) return;
        const current = (): string => view?.state.doc.toString() ?? text ?? '';
        const newSaver = new NoteSaver(itemId, session.vault, current, (state) => {
          session.saveState = state;
        });
        saver = newSaver;
        session.saves.add(newSaver);
        session.focusedSaver = newSaver;
        session.saveState = newSaver.current;
        view = createEditor(element, text ?? '', cursor, {
          onEdit: () => {
            newSaver.edit();
            session.wordCount = countWords(current());
            // PLAN 4.3: a note edited and then left alone for 5 minutes gets a snapshot.
            editedSinceSnapshot = true;
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => snapshot('idle'), SNAPSHOT_IDLE_MS);
          },
          onBlur: () => newSaver.flush(),
          // PLAN 4.4: Ctrl+S saves now and asks sync to upload now.
          onSaveNow: () => void session.saveAndSync(),
          onPosition: (c, s) => session.rememberPosition(tabId, c, s),
        });
        session.focusedEditor = { itemId, view };
        view.scrollDOM.scrollTop = scroll;
        session.wordCount = countWords(text ?? '');
        // A note just created has its name field focused in the tree; leave the focus there.
        if (session.renaming === null) view.focus();
      },
      (error: unknown) =>
        session.notify(t.openFailed + (error instanceof Error ? error.message : String(error))),
    );

    return () => {
      closed = true;
      clearTimeout(idleTimer);
      // PLAN 4.3: a snapshot when the tab closes.
      snapshot('close');
      if (session.focusedEditor?.view === view) session.focusedEditor = null;
      const s = saver;
      const v = view;
      if (s !== null) {
        // Save before letting go; the view's last state stays readable after destroy().
        if (session.focusedSaver === s) session.focusedSaver = null;
        void s.flushAndWait().finally(() => {
          s.dispose();
          session.saves.remove(s);
        });
      }
      v?.destroy();
    };
  });
</script>

<div class="editor" bind:this={host} data-testid="editor" data-item={tab.itemId}></div>

<style>
  .editor {
    height: 100%;
    min-height: 0;
  }
  .editor :global(.cm-editor) {
    height: 100%;
  }
</style>
