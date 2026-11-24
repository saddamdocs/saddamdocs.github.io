<!--
  @component
  A note's history (PLAN 4.3, "Local snapshots"): the snapshots this device kept, newest first, with
  their times; the chosen one shows read-only beside the current text. "Restore" puts its text into
  the note as one ordinary edit, which Ctrl+Z undoes.

  Talks to: `app/session.svelte.ts` (`vault.listSnapshots`, `restoreSnapshot`, `closeHistory`),
  `editor/setup.ts` for the read-only view, `strings.ts`.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView } from '@codemirror/view';
  import type { Session } from '../app/session.svelte.ts';
  import { readOnlyExtensions } from '../editor/setup.ts';
  import type { SnapshotRecord } from '../store/schema.ts';
  import { history as t } from '../strings.ts';

  interface Props {
    /** The running session. */
    session: Session;
    /** The note whose history this is. */
    itemId: string;
  }
  let { session, itemId }: Props = $props();
  let snapshots: SnapshotRecord[] = $state([]);
  let chosen: SnapshotRecord | null = $state(null);
  let host: HTMLDivElement | undefined = $state();

  const timeFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  $effect(() => {
    const id = untrack(() => itemId);
    void session.vault.listSnapshots(id).then((list) => {
      snapshots = list;
      chosen = list[0] ?? null;
    });
  });

  $effect(() => {
    const element = host;
    const snapshot = chosen;
    if (element === undefined || snapshot === null) return;
    const view = new EditorView({
      parent: element,
      state: EditorState.create({ doc: snapshot.text, extensions: readOnlyExtensions() }),
    });
    return () => view.destroy();
  });
</script>

<aside class="history" data-testid="history">
  <header>
    <h2>{t.title}</h2>
    <button type="button" class="secondary small" onclick={() => session.closeHistory()}>
      {t.close}
    </button>
  </header>
  {#if snapshots.length === 0}
    <p class="empty">{t.empty}</p>
  {:else}
    <ul>
      {#each snapshots as snapshot (snapshot.time)}
        <li>
          <button
            type="button"
            class="entry"
            class:chosen={chosen?.time === snapshot.time}
            onclick={() => (chosen = snapshot)}
          >
            <span>{timeFormat.format(snapshot.time)}</span>
            <span class="reason">{t.reasons[snapshot.reason]}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if chosen}
      {@const snapshot = chosen}
      <div class="preview" bind:this={host}></div>
      <button
        type="button"
        class="primary"
        data-testid="history-restore"
        onclick={() => void session.restoreSnapshot(itemId, snapshot.text, snapshot.time)}
      >
        {t.restore}
      </button>
    {/if}
  {/if}
</aside>

<style>
  .history {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 340px;
    flex: none;
    padding: 10px 12px;
    border-left: 1px solid var(--border);
    background: var(--sidebar);
    font-family: var(--font-ui);
    font-size: 13px;
    min-height: 0;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 14px;
    color: var(--heading);
  }
  .small {
    padding: 2px 10px;
    font-size: 12px;
  }
  .empty {
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 30%;
    overflow: auto;
  }
  .entry {
    display: flex;
    justify-content: space-between;
    width: 100%;
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--text);
    text-align: left;
    font-size: 13px;
  }
  .entry:hover,
  .entry.chosen {
    background: var(--hover);
  }
  .reason {
    color: var(--text-muted);
  }
  .preview {
    flex: 1;
    min-height: 120px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--paper);
  }
</style>
