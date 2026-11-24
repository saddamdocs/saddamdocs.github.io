<!--
  @component
  The simple image viewer a file opens in when "Show all files" is on (PLAN 4.3): the image from
  the vault, scaled to fit, with its name and size. Shows a notice when this device does not have
  the file's bytes.

  Talks to: `vault/operations.ts` (`readFile`), `strings.ts`.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Session } from '../app/session.svelte.ts';
  import { files as t } from '../strings.ts';

  interface Props {
    /** The running session. */
    session: Session;
    /** The file to show. */
    itemId: string;
  }
  let { session, itemId }: Props = $props();
  let url: string | null = $state(null);
  let missing = $state(false);

  $effect(() => {
    const id = untrack(() => itemId);
    let objectUrl: string | null = null;
    let closed = false;
    void session.vault.readFile(id).then((blob) => {
      if (closed) return;
      if (blob === null) {
        missing = true;
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      url = objectUrl;
    });
    return () => {
      closed = true;
      // PLAN 6.1: object URLs are revoked when the view goes.
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  });

  let item = $derived(session.index.get(itemId));
</script>

<div class="viewer" data-testid="image-viewer">
  {#if missing}
    <p class="missing">{t.notOnDevice}</p>
  {:else if url}
    <img src={url} alt={item?.name ?? ''} />
  {/if}
  {#if item}
    <p class="caption">{item.name} · {t.size(item.size)}</p>
  {/if}
</div>

<style>
  .viewer {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    padding: 24px;
    box-sizing: border-box;
    overflow: auto;
  }
  img {
    max-width: 100%;
    max-height: calc(100% - 40px);
    object-fit: contain;
    border: 1px solid var(--border);
    background: var(--paper);
  }
  .caption,
  .missing {
    color: var(--text-muted);
    font-family: var(--font-ui);
    font-size: 13px;
  }
</style>
