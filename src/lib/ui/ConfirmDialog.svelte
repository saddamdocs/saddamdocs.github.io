<!--
  @component
  The confirmation before Delete forever and Empty Trash (PLAN 4.3), as a modal `<dialog>`, so the
  browser keeps focus inside it and Escape cancels.

  Talks to: `app/session.svelte.ts` (`confirmation`).
-->
<script lang="ts">
  import type { Session } from '../app/session.svelte.ts';
  import { notices as t } from '../strings.ts';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();
  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (dialog === undefined) return;
    if (session.confirmation !== null && !dialog.open) dialog.showModal();
    if (session.confirmation === null && dialog.open) dialog.close();
  });
</script>

<dialog bind:this={dialog} onclose={() => (session.confirmation = null)} data-testid="confirm">
  {#if session.confirmation}
    <p>{session.confirmation.text}</p>
    <div class="buttons">
      <button type="button" class="secondary" onclick={() => (session.confirmation = null)}>
        {t.cancel}
      </button>
      <button type="button" class="danger" onclick={session.confirmation.run}>
        {session.confirmation.confirmLabel}
      </button>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 24px;
    max-width: 420px;
    background: var(--paper);
    color: var(--text);
    font-family: var(--font-ui);
  }
  dialog::backdrop {
    background: rgb(31 58 52 / 0.25);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .danger {
    background: var(--danger);
    border: 1px solid var(--danger);
    color: var(--paper);
  }
</style>
