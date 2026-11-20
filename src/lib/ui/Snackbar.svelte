<!--
  @component
  The snackbar (PLAN 4.1, 4.9): `--dark` with `--on-dark` text, its action in gold, at the bottom
  of the window. Announced to screen readers as a status.

  Talks to: `app/notices.svelte.ts`.
-->
<script lang="ts">
  import type { Notices } from '../app/notices.svelte.ts';

  interface Props {
    /** The snackbar's state. */
    notices: Notices;
  }
  let { notices }: Props = $props();
</script>

<div class="region" role="status" aria-live="polite">
  {#if notices.current}
    {@const snack = notices.current}
    <div class="snackbar" data-testid="snackbar">
      <span>{snack.text}</span>
      {#if snack.action}
        <button type="button" onclick={snack.action.run}>{snack.action.label}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .region {
    position: fixed;
    left: 50%;
    bottom: 40px;
    transform: translateX(-50%);
    z-index: 50;
  }
  .snackbar {
    display: flex;
    gap: 16px;
    align-items: center;
    max-width: min(560px, 90vw);
    padding: 10px 16px;
    border-radius: 6px;
    background: var(--dark);
    color: var(--on-dark);
    font-family: var(--font-ui);
    font-size: 14px;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
    user-select: none;
  }
  button {
    background: none;
    border: none;
    padding: 2px 4px;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
  }
</style>
