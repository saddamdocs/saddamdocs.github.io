<!--
  @component
  The sync chip in the status bar (PLAN 4.5, 4.9): "Synced", "Syncing…", "Offline · 3 waiting",
  "Paused · passphrase needed", or "Sync problem" in red. Clicking it opens the details: what waits
  for a merge, what could not be read, what is too large, the last error, and the last sync.

  Talks to: `app/session.svelte.ts` (`chip`, `syncDetails`), `strings.ts`.
-->
<script lang="ts">
  import type { Session } from '../app/session.svelte.ts';
  import { syncText as t } from '../strings.ts';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();
  let open = $state(false);

  const timeFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  let label = $derived.by(() => {
    const chip = session.chip;
    switch (chip.kind) {
      case 'synced':
        return t.chip.synced;
      case 'syncing':
        return t.chip.syncing;
      case 'offline':
        return t.chip.offline(chip.waiting);
      case 'paused':
        return t.chip.paused;
      case 'problem':
        return t.chip.problem;
      default:
        return '';
    }
  });

  /** Names of items, for the details. */
  function names(ids: readonly string[]): string[] {
    return ids.map((id) => session.index.path(id) || id);
  }
</script>

{#if session.chip.kind !== 'off'}
  <span class="wrap">
    <button
      type="button"
      class="chip {session.chip.kind}"
      title={session.chip.kind === 'syncing' ? t.pending(session.chip.count) : undefined}
      onclick={() => (open = !open)}
      data-testid="sync-chip"
    >
      {label}
    </button>
    {#if open && session.syncDetails}
      {@const d = session.syncDetails}
      <div class="details" role="dialog" aria-label={t.detailsTitle} data-testid="sync-details">
        {#if session.chip.kind === 'problem'}<p class="problem">{session.chip.message}</p>{/if}
        <p>{t.lastSync(d.lastSync === null ? null : timeFormat.format(d.lastSync))}</p>
        {#if d.waitingForMerge.length > 0}
          <p>{t.waitingForMerge}</p>
          <ul>
            {#each names(d.waitingForMerge) as n (n)}<li>{n}</li>{/each}
          </ul>
        {/if}
        {#if d.unreadable.length > 0}
          <p>{t.unreadable}</p>
          <ul>
            {#each names(d.unreadable) as n (n)}<li>{n}</li>{/each}
          </ul>
        {/if}
        {#if d.tooLarge.length > 0}
          <p>{t.tooLarge}</p>
          <ul>
            {#each names(d.tooLarge) as n (n)}<li>{n}</li>{/each}
          </ul>
        {/if}
        {#if d.lastError}<p>{t.lastError} <code>{d.lastError}</code></p>{/if}
        {#if d.streamCheck}<p>{t.streamCheck} <code>{d.streamCheck}</code></p>{/if}
      </div>
    {/if}
  </span>
{/if}

<style>
  .wrap {
    position: relative;
  }
  .chip {
    padding: 0 6px;
    border: none;
    border-radius: 3px;
    background: none;
    color: var(--text-muted);
    font: inherit;
  }
  .chip:hover {
    background: var(--hover);
  }
  .chip.paused {
    color: var(--text);
  }
  .chip.problem {
    color: var(--danger);
    font-weight: 600;
  }
  .details {
    position: absolute;
    right: 0;
    bottom: 24px;
    z-index: 30;
    width: 340px;
    max-height: 50vh;
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--paper);
    color: var(--text);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.14);
    font-size: 12px;
    user-select: text;
  }
  .details p {
    margin: 0 0 6px;
  }
  .problem {
    color: var(--danger);
    font-weight: 600;
  }
  ul {
    margin: 0 0 8px;
    padding-left: 16px;
  }
  code {
    font-family: var(--font-mono);
  }
</style>
