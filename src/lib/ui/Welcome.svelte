<!--
  @component
  The welcome screen of a first launch (PLAN 4.1, 4.5, 4.9): the icon at 96 px, the name, and the
  three choices, the first one primary. "Start a new synced vault" and "Connect to my vault" open
  their forms in place; "Use only on this device for now" starts a vault without sync.

  Talks to: `SyncForm.svelte`, `strings.ts`; the parent runs each flow.
-->
<script lang="ts">
  import { screens as t } from '../strings.ts';
  import Screen from './Screen.svelte';
  import SyncForm from './SyncForm.svelte';

  /** What the sync forms hand over. */
  type Values = { key: string; passphrase: string; deviceName: string };

  interface Props {
    /** "Use only on this device for now". */
    onLocal: () => void;
    /** "Start a new synced vault"; resolves to an error message, or null. */
    onStart: (values: Values) => Promise<string | null>;
    /** "Connect to my vault"; resolves to an error message, or null. */
    onConnect: (values: Values) => Promise<string | null>;
    /** A progress line while connecting. */
    progress?: string;
  }
  let { onLocal, onStart, onConnect, progress = '' }: Props = $props();
  let view: 'choices' | 'start' | 'connect' = $state('choices');
  let busy = $state(false);
</script>

<Screen title={t.welcomeTitle} body={view === 'choices' ? t.welcomeIntro : ''}>
  {#if view === 'choices'}
    <div class="choices">
      <button type="button" class="primary" onclick={() => (view = 'start')}>
        {t.startSynced}
      </button>
      <button type="button" class="secondary" onclick={() => (view = 'connect')}>
        {t.connect}
      </button>
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
    </div>
  {:else if view === 'start'}
    <SyncForm mode="start" onSubmit={onStart} onCancel={() => (view = 'choices')} />
  {:else}
    <SyncForm mode="connect" onSubmit={onConnect} onCancel={() => (view = 'choices')} {progress} />
  {/if}
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
</style>
