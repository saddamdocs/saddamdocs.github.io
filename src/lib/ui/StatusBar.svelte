<!--
  @component
  The status bar (PLAN 4.1, 4.9) on `--panel` in muted text: the focused note's path, its save
  state on this device ("Saving", "Saved"), and its word count. M3a adds the sync chip, M9 the
  week chip.

  Talks to: `app/session.svelte.ts`, `workspace/model.ts`, `strings.ts`.
-->
<script lang="ts">
  import type { Session } from '../app/session.svelte.ts';
  import { status as t } from '../strings.ts';
  import { activeTab } from '../workspace/model.ts';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();

  let tab = $derived(activeTab(session.workspace));
  let saveText = $derived(
    session.saveState.status === 'clean'
      ? t.saved
      : session.saveState.status === 'failed'
        ? t.notSaved
        : t.saving,
  );
</script>

<footer class="status" data-testid="statusbar">
  {#if tab}
    <span class="path" data-testid="status-path">{session.index.path(tab.itemId)}</span>
    <span class="spacer"></span>
    <span class:failed={session.saveState.status === 'failed'} data-testid="save-state">
      {saveText}
    </span>
    {#if session.index.get(tab.itemId)?.kind === 'note'}
      <span class="dot">·</span>
      <span data-testid="word-count">{t.words(session.wordCount)}</span>
    {/if}
  {:else}
    <span class="spacer"></span>
  {/if}
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 26px;
    padding: 0 12px;
    background: var(--panel);
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-family: var(--font-ui);
    font-size: 12px;
    user-select: none;
  }
  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .failed {
    color: var(--danger);
    font-weight: 600;
  }
</style>
