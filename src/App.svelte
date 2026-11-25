<!--
  @component
  The root of the app: takes the one-window lock (PLAN 5.10), starts up (PLAN 4.1, 4.16), and shows
  the screen that fits: the welcome screen, the shell, "open in another window", "saved by a newer
  version", or a storage error. Also owns the update prompt (PLAN 4.16) and, on the next channel
  only, the spike B and D probe at `?probe`.

  Talks to: `instance/lock.ts`, `app/boot.ts`, `app/notices.svelte.ts`, `updates.ts`,
  `channel.ts`, `strings.ts`, and the screens in `lib/ui/`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { boot, connectVault, startLocalVault, startSyncedVault } from './lib/app/boot.ts';
  import { RestFailure } from './lib/sync/rest.ts';
  import KeyReveal from './lib/ui/KeyReveal.svelte';
  import { Notices } from './lib/app/notices.svelte.ts';
  import type { Session } from './lib/app/session.svelte.ts';
  import { IS_NEXT_BUILD } from './lib/channel.ts';
  import { InstanceLock } from './lib/instance/lock.ts';
  import type { VaultDb } from './lib/store/db.ts';
  import { logEvent } from './lib/store/log.ts';
  import { screens as t, screens, syncText, updates as u } from './lib/strings.ts';
  import { startUpdates } from './lib/updates.ts';
  import Screen from './lib/ui/Screen.svelte';
  import Shell from './lib/ui/Shell.svelte';
  import Snackbar from './lib/ui/Snackbar.svelte';
  import Welcome from './lib/ui/Welcome.svelte';

  type Phase =
    | { kind: 'loading' }
    | { kind: 'elsewhere'; heldBefore: boolean }
    | { kind: 'welcome'; db: VaultDb }
    | { kind: 'ready'; session: Session }
    | { kind: 'key'; session: Session; key: string }
    | { kind: 'newer' }
    | { kind: 'unavailable'; error: string };

  const notices = new Notices();
  const lock = new InstanceLock();
  let phase: Phase = $state({ kind: 'loading' });
  // The probe exists only on the next channel; on stable this folds to false at build time.
  let showProbe = $state(IS_NEXT_BUILD && new URLSearchParams(location.search).has('probe'));

  const handlers = {
    onYield: async (): Promise<void> => {
      // PLAN 5.10: save everything before stepping aside.
      if (phase.kind === 'ready') await phase.session.saves.flushAll();
    },
    onLost: (): void => {
      phase = { kind: 'elsewhere', heldBefore: true };
    },
  };

  async function start(): Promise<void> {
    const result = await boot(notices);
    phase = result;
  }

  async function useHere(): Promise<void> {
    const heldBefore = phase.kind === 'elsewhere' && phase.heldBefore;
    await lock.takeOver(handlers);
    // A page that held the lock before has stale state in memory: start afresh from storage.
    if (heldBefore) location.reload();
    else await start();
  }

  /** What the sync forms hand over. */
  type SyncValues = { key: string; passphrase: string; deviceName: string };

  let connectProgress = $state('');

  /** A failure of a sync flow, as a sentence for the form. */
  function flowError(error: unknown): string {
    if (error instanceof RestFailure) return syncText.unreachable + error.message;
    return error instanceof Error ? error.message : String(error);
  }

  /** "Start a new synced vault" from the welcome screen (PLAN 4.5). */
  async function chooseStart(
    db: VaultDb,
    values: { passphrase: string; deviceName: string },
  ): Promise<string | null> {
    try {
      const { session, key } = await startSyncedVault(db, notices, values);
      phase = { kind: 'key', session, key };
      return null;
    } catch (error) {
      return flowError(error);
    }
  }

  /** "Connect to my vault" from the welcome screen (PLAN 4.5). */
  async function chooseConnect(
    db: VaultDb,
    values: { key: string; passphrase: string; deviceName: string },
  ): Promise<string | null> {
    try {
      const result = await connectVault(db, notices, values.key, values, (done) => {
        connectProgress = syncText.downloading(`${(done / 1024).toFixed(0)} KB`);
      });
      if ('problem' in result) return syncText.problems[result.problem];
      phase = { kind: 'ready', session: result };
      return null;
    } catch (error) {
      return flowError(error);
    } finally {
      connectProgress = '';
    }
  }

  async function chooseLocal(db: VaultDb): Promise<void> {
    try {
      phase = { kind: 'ready', session: await startLocalVault(db, notices) };
    } catch (error) {
      await logEvent(db, 'error', 'vault-create-failed', error instanceof Error ? error.name : '');
      phase = {
        kind: 'unavailable',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const reloadToUpdate = startUpdates({
    onNeedRefresh: () =>
      notices.notify(
        u.ready,
        {
          label: u.reload,
          run: () => {
            notices.dismiss();
            // PLAN 4.16: Reload saves everything first.
            const save =
              phase.kind === 'ready' ? phase.session.saves.flushAll() : Promise.resolve();
            void save.then(() => reloadToUpdate()).catch((error: unknown) => console.error(error));
          },
        },
        'sticky',
      ),
    onOfflineReady: () => notices.notify(u.offlineReady),
    onError: (error) => notices.notify(u.registerFailed + String(error)),
  });

  onMount(() => {
    if (showProbe) return;
    void lock.acquire(handlers).then(async (held) => {
      if (held) await start();
      else phase = { kind: 'elsewhere', heldBefore: false };
    });
  });
</script>

{#if IS_NEXT_BUILD && showProbe}
  {#await import('./lib/probe/Probe.svelte') then probe}
    <probe.default
      onBack={() => {
        history.pushState(null, '', location.pathname);
        showProbe = false;
        location.reload();
      }}
    />
  {/await}
{:else if phase.kind === 'loading'}
  <Screen title={t.loading} />
{:else if phase.kind === 'elsewhere'}
  <Screen
    title={t.elsewhereTitle}
    body={t.elsewhereBody}
    action={{ label: t.useHere, run: () => void useHere(), testid: 'use-here' }}
  />
{:else if phase.kind === 'welcome'}
  {@const db = phase.db}
  <Welcome
    onLocal={() => void chooseLocal(db)}
    onStart={(values: SyncValues) => chooseStart(db, values)}
    onConnect={(values: SyncValues) => chooseConnect(db, values)}
    progress={connectProgress}
  />
{:else if phase.kind === 'key'}
  {@const ready = phase.session}
  <Screen title={screens.welcomeTitle}>
    <KeyReveal syncKey={phase.key} onDone={() => (phase = { kind: 'ready', session: ready })} />
  </Screen>
{:else if phase.kind === 'ready'}
  <Shell session={phase.session} />
{:else if phase.kind === 'newer'}
  <Screen
    title={t.newerTitle}
    body={t.newerBody}
    action={{ label: t.reload, run: () => location.reload() }}
  />
{:else}
  <Screen title={t.unavailableTitle} body={t.unavailableBody}>
    <p class="detail">{phase.error}</p>
  </Screen>
{/if}

<Snackbar {notices} />

<style>
  .detail {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
  }
</style>
