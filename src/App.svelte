<!--
  @component
  The M0 skeleton: one screen that shows the app's name, channel, version and connection state,
  the update prompt of PLAN 4.16, and, on the next channel only, a link to the spike B and D probe.
  M1 replaces this screen with the real shell (sidebar, panes, status bar).

  Talks to: `channel.ts` and `build.ts` for what it shows, `updates.ts` for the service worker,
  `strings.ts` for its texts, and `probe/Probe.svelte`, loaded on demand.
-->
<script lang="ts">
  import { channel, IS_NEXT_BUILD } from './lib/channel.ts';
  import { build } from './lib/build.ts';
  import { startUpdates } from './lib/updates.ts';
  import { skeleton as t, updates as u } from './lib/strings.ts';
  import { SNACKBAR_TIMEOUT_MS } from './lib/config.ts';

  /** A short notice at the bottom of the window, with an optional action (PLAN 4.1). */
  interface Snack {
    text: string;
    action?: { label: string; run: () => void };
  }

  let online = $state(navigator.onLine);
  let snack = $state<Snack | null>(null);
  // The probe exists only on the next channel. On stable this folds to `false` at build time, and
  // the probe's chunk is left out of the stable build.
  let showProbe = $state(IS_NEXT_BUILD && new URLSearchParams(location.search).has('probe'));

  let snackTimer: ReturnType<typeof setTimeout> | undefined;
  function notify(next: Snack): void {
    clearTimeout(snackTimer);
    snack = next;
    if (next.action === undefined) {
      snackTimer = setTimeout(() => (snack = null), SNACKBAR_TIMEOUT_MS);
    }
  }

  const reloadToUpdate = startUpdates({
    onNeedRefresh: () =>
      notify({
        text: u.ready,
        action: {
          label: u.reload,
          run: () => {
            snack = null;
            reloadToUpdate().catch((error: unknown) => console.error(error));
          },
        },
      }),
    onOfflineReady: () => notify({ text: u.offlineReady }),
    onError: (error) => notify({ text: u.registerFailed + String(error) }),
  });

  function openProbe(event: MouseEvent): void {
    event.preventDefault();
    history.pushState(null, '', '?probe');
    showProbe = true;
  }
  function closeProbe(): void {
    history.pushState(null, '', location.pathname);
    showProbe = false;
  }
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

{#if IS_NEXT_BUILD && showProbe}
  {#await import('./lib/probe/Probe.svelte') then probe}
    <probe.default onBack={closeProbe} />
  {/await}
{:else}
  <main class="skeleton">
    <img src="/icons/favicon.svg" width="96" height="96" alt="" />
    <h1>{channel.appName}</h1>
    <p>{t.tagline}</p>
    <dl>
      <dt>{t.version}</dt>
      <dd data-testid="version">{build.version}</dd>
      <dt>{t.channel}</dt>
      <dd data-testid="channel">{channel.name}</dd>
      <dt>{t.commit}</dt>
      <dd>{build.commit}</dd>
      <dt>{t.built}</dt>
      <dd>{build.date}</dd>
    </dl>
    <p class="status" class:offline={!online} data-testid="online">
      {online ? t.online : t.offline}
    </p>
    {#if IS_NEXT_BUILD}
      <p><a href="?probe" onclick={openProbe}>{t.probeLink}</a></p>
    {/if}
  </main>
{/if}

{#if snack}
  <div class="snackbar" role="status">
    <span>{snack.text}</span>
    {#if snack.action}
      <button type="button" onclick={snack.action.run}>{snack.action.label}</button>
    {/if}
  </div>
{/if}

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 64px 24px;
    text-align: center;
  }
  h1 {
    color: var(--heading);
    margin: 16px 0 8px;
  }
  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 4px 16px;
    margin: 24px 0;
    text-align: left;
  }
  dt {
    color: var(--text-muted);
  }
  dd {
    margin: 0;
    font-family: ui-monospace, monospace;
  }
  .status {
    padding: 4px 12px;
    border-radius: 4px;
    background: var(--panel);
  }
  .status.offline {
    border-left: 4px solid var(--accent);
  }
  .snackbar {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 10px 16px;
    border-radius: 6px;
    background: var(--dark);
    color: var(--on-dark);
  }
  .snackbar button {
    background: none;
    border: none;
    color: var(--accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
