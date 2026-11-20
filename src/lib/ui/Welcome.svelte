<!--
  @component
  The welcome screen of a first launch (PLAN 4.1, 4.9): the icon at 96 px, the name, and the three
  choices, the first one primary. Until sync exists (M3a), only "Use only on this device for now"
  is enabled.

  Talks to: `strings.ts`; the parent starts the local vault.
-->
<script lang="ts">
  import { screens as t } from '../strings.ts';
  import Screen from './Screen.svelte';

  interface Props {
    /** "Use only on this device for now". */
    onLocal: () => void;
  }
  let { onLocal }: Props = $props();
  let busy = $state(false);
</script>

<Screen title={t.welcomeTitle} body={t.welcomeIntro}>
  <div class="choices">
    <button type="button" class="primary" disabled>{t.startSynced}</button>
    <button type="button" class="secondary" disabled>{t.connect}</button>
    <button
      type="button"
      class="secondary"
      disabled={busy}
      onclick={() => {
        busy = true;
        onLocal();
      }}
    >
      {t.localOnly}
    </button>
    <p class="note">{t.syncLater}</p>
  </div>
</Screen>

<style>
  .choices {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(340px, 100%);
  }
  .choices button {
    padding: 10px 16px;
  }
  .note {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--text-muted);
  }
</style>
