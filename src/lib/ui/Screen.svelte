<!--
  @component
  A full-window message with the app icon, a title, a sentence and an optional button: the
  welcome screen's frame (PLAN 4.9), "open in another window" (PLAN 5.10), "saved by a newer
  version" (PLAN 4.16), and storage errors.

  Talks to: nothing; the parent passes the texts and the button's action.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** The heading. */
    title: string;
    /** One or two sentences under it. */
    body?: string;
    /** A primary button, if any. */
    action?: { label: string; run: () => void; testid?: string };
    /** Extra content below, such as the welcome screen's choices. */
    children?: Snippet;
  }
  let { title, body = '', action, children }: Props = $props();
</script>

<main class="screen">
  <img src="/icons/favicon.svg" width="96" height="96" alt="" />
  <h1>{title}</h1>
  {#if body}<p>{body}</p>{/if}
  {#if action}
    <button type="button" class="primary" data-testid={action.testid} onclick={action.run}>
      {action.label}
    </button>
  {/if}
  {@render children?.()}
</main>

<style>
  .screen {
    min-height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    background: var(--paper);
    user-select: none;
  }
  h1 {
    margin: 12px 0 0;
    color: var(--heading);
    font-size: 26px;
  }
  p {
    margin: 0 0 12px;
    max-width: 460px;
    color: var(--text-muted);
  }
</style>
