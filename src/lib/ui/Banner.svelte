<!--
  @component
  A banner at the top of a pane, for a problem that needs a decision (PLAN 4.1): on `--panel` with a
  4 px left bar, gold for information and red for errors (PLAN 4.9), with up to two buttons.

  Talks to: nothing; the parent passes the text and the actions.
-->
<script lang="ts">
  interface Action {
    label: string;
    run: () => void;
  }
  interface Props {
    /** `error` draws the red bar and is announced at once; `info` draws the gold bar. */
    kind: 'info' | 'error';
    /** The message. */
    text: string;
    /** Buttons, in order. */
    actions?: readonly Action[];
    /** For tests. */
    testid?: string;
  }
  let { kind, text, actions = [], testid }: Props = $props();
</script>

<div class="banner {kind}" role={kind === 'error' ? 'alert' : 'status'} data-testid={testid}>
  <span class="text">{text}</span>
  {#each actions as action (action.label)}
    <button type="button" class="secondary" onclick={action.run}>{action.label}</button>
  {/each}
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--panel);
    border-left: 4px solid var(--accent);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 13px;
    user-select: none;
  }
  .banner.error {
    border-left-color: var(--danger);
  }
  .text {
    flex: 1;
  }
  button {
    padding: 3px 10px;
    font-size: 13px;
  }
</style>
