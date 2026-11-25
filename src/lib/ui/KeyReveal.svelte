<!--
  @component
  Shows a new sync key once it is made (PLAN 4.5): in groups of four, with Copy, and the advice
  to store the key and the passphrase in a password manager.

  Talks to: `sync/keys.ts` (`formatSyncKey`), the clipboard, `strings.ts`.
-->
<script lang="ts">
  import { formatSyncKey } from '../sync/keys.ts';
  import { syncText as t } from '../strings.ts';

  interface Props {
    /** The new key. */
    syncKey: string;
    /** "I stored them". */
    onDone: () => void;
  }
  let { syncKey, onDone }: Props = $props();
  let copied = $state(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(syncKey);
      copied = true;
    } catch {
      // The key stays on screen to copy by hand; the clipboard may be refused without focus.
      copied = false;
    }
  }
</script>

<div class="reveal" data-testid="key-reveal">
  <h2>{t.keyTitle}</h2>
  <code data-testid="sync-key">{formatSyncKey(syncKey)}</code>
  <p>{t.keyAdvice}</p>
  <div class="buttons">
    <button type="button" class="secondary" onclick={() => void copy()}>
      {copied ? t.copied : t.copy}
    </button>
    <button type="button" class="primary" onclick={onDone} data-testid="key-done">{t.done}</button>
  </div>
</div>

<style>
  .reveal {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(460px, 100%);
    font-family: var(--font-ui);
    text-align: left;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    color: var(--heading);
  }
  code {
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--panel);
    font-family: var(--font-mono);
    font-size: 17px;
    letter-spacing: 0.05em;
    text-align: center;
    user-select: all;
  }
  p {
    margin: 0;
    color: var(--text-muted);
    font-size: 13px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
