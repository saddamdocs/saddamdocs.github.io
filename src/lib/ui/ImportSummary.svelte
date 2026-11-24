<!--
  @component
  The summary after an import (PLAN 4.15): what was imported, what was renamed and what was
  skipped, with reasons, and "Undo import", which moves everything the import created to the Trash.

  Talks to: `app/session.svelte.ts` (`importResult`, `undoImport`), `strings.ts`.
-->
<script lang="ts">
  import type { Session } from '../app/session.svelte.ts';
  import { transfer as t } from '../strings.ts';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (dialog === undefined) return;
    if (session.importResult !== null && !dialog.open) dialog.showModal();
    if (session.importResult === null && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  onclose={() => (session.importResult = null)}
  data-testid="import-summary"
>
  {#if session.importResult}
    {@const { report, undone } = session.importResult}
    <h2>{t.summaryTitle}</h2>
    <p data-testid="import-counts">{t.summaryCounts(report.notes, report.files, report.folders)}</p>
    {#if report.renamed.length > 0}
      <h3>{t.renamedTitle}</h3>
      <ul>
        {#each report.renamed as r (r.from)}<li>
            <code>{r.from}</code> → <code>{r.to}</code>
          </li>{/each}
      </ul>
    {/if}
    {#if report.skipped.length > 0}
      <h3>{t.skippedTitle}</h3>
      <ul>
        {#each report.skipped as s (s.path)}<li>
            <code>{s.path}</code>: {t.reasons[s.reason]}
          </li>{/each}
      </ul>
    {/if}
    {#if undone}<p class="undone">{t.undone}</p>{/if}
    <div class="buttons">
      <button
        type="button"
        class="secondary"
        disabled={undone}
        onclick={() => void session.undoImport()}
      >
        {t.undoImport}
      </button>
      <button type="button" class="primary" onclick={() => (session.importResult = null)}>
        {t.close}
      </button>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(560px, 92vw);
    max-height: 80vh;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 20px;
    background: var(--paper);
    color: var(--text);
    font-family: var(--font-ui);
    font-size: 14px;
  }
  dialog::backdrop {
    background: rgb(31 58 52 / 0.25);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 16px;
    color: var(--heading);
  }
  h3 {
    margin: 12px 0 4px;
    font-size: 14px;
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  code {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .undone {
    color: var(--text-muted);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
</style>
