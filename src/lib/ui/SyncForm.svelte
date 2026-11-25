<!--
  @component
  The two sync forms of PLAN 4.5. "start": device name and the passphrase twice, then creates the
  vault. "connect": the sync key, the passphrase and the device name; the passphrase is checked
  against `info` before anything else, then the vault downloads with a progress line.

  The fields carry `autocomplete` values, and the key sits in a username field, so a password
  manager can save the key and the passphrase together (PLAN 5.9 rule 5). Neither is ever logged.

  Talks to: the parent, which runs the flow (`app/boot.ts`); `sync/keys.ts` for reading the key;
  `device.ts` for the default name; `strings.ts`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { defaultDeviceName } from '../device.ts';
  import { MIN_PASSPHRASE, readSyncKey } from '../sync/keys.ts';
  import { syncText as t } from '../strings.ts';

  interface Props {
    /** Which form. */
    mode: 'start' | 'connect';
    /** Runs the flow; resolves to an error message, or null on success. */
    onSubmit: (values: {
      key: string;
      passphrase: string;
      deviceName: string;
    }) => Promise<string | null>;
    /** "Back". */
    onCancel?: () => void;
    /** A progress line while connecting, set by the parent. */
    progress?: string;
  }
  let { mode, onSubmit, onCancel, progress = '' }: Props = $props();

  let deviceName = $state('');
  let key = $state('');
  let passphrase = $state('');
  let again = $state('');
  let error = $state('');
  let busy = $state(false);

  onMount(() => {
    void defaultDeviceName().then((name) => {
      if (deviceName === '') deviceName = name;
    });
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = '';
    const readKey = mode === 'connect' ? readSyncKey(key) : '';
    if (readKey === null) {
      error = t.badKey;
      return;
    }
    if ([...passphrase].length < MIN_PASSPHRASE) {
      error = t.tooShort;
      return;
    }
    if (mode === 'start' && passphrase !== again) {
      error = t.mismatch;
      return;
    }
    busy = true;
    try {
      const problem = await onSubmit({
        key: readKey,
        passphrase,
        deviceName: deviceName.trim() || 'This device',
      });
      if (problem !== null) error = problem;
    } finally {
      busy = false;
    }
  }
</script>

<form class="sync-form" onsubmit={(e) => void submit(e)} data-testid="sync-form-{mode}">
  <h2>{mode === 'start' ? t.startTitle : t.connectTitle}</h2>
  {#if mode === 'connect'}
    <label>
      <span>{t.syncKey}</span>
      <input
        type="text"
        name="username"
        autocomplete="username"
        spellcheck="false"
        bind:value={key}
        data-testid="sync-key-input"
      />
      <small>{t.syncKeyHint}</small>
    </label>
  {/if}
  <label>
    <span>{t.passphrase}</span>
    <input
      type="password"
      name="password"
      autocomplete={mode === 'start' ? 'new-password' : 'current-password'}
      bind:value={passphrase}
      data-testid="passphrase"
    />
  </label>
  {#if mode === 'start'}
    <label>
      <span>{t.passphraseAgain}</span>
      <input
        type="password"
        autocomplete="new-password"
        bind:value={again}
        data-testid="passphrase-again"
      />
    </label>
  {/if}
  <p class="advice">{t.passphraseAdvice}</p>
  <label>
    <span>{t.deviceName}</span>
    <input type="text" autocomplete="off" bind:value={deviceName} data-testid="device-name" />
  </label>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if progress}<p class="progress" role="status">{progress}</p>{/if}
  <div class="buttons">
    {#if onCancel}
      <button type="button" class="secondary" disabled={busy} onclick={onCancel}>{t.cancel}</button>
    {/if}
    <button type="submit" class="primary" disabled={busy} data-testid="sync-submit">
      {busy ? t.working : mode === 'start' ? t.start : t.connect}
    </button>
  </div>
</form>

<style>
  .sync-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: min(420px, 100%);
    text-align: left;
    font-family: var(--font-ui);
  }
  h2 {
    margin: 0 0 4px;
    font-size: 17px;
    color: var(--heading);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label span {
    font-weight: 600;
    font-size: 13px;
  }
  input {
    padding: 6px 8px;
    border: 1.5px solid var(--text-muted);
    border-radius: 4px;
    background: var(--paper);
    color: var(--text);
    font: inherit;
  }
  small,
  .advice {
    color: var(--text-muted);
    font-size: 12px;
    margin: 0;
  }
  .error {
    margin: 0;
    color: var(--danger);
  }
  .progress {
    margin: 0;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
