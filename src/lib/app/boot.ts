/**
 * Start-up (PLAN 4.1, 4.16, 5.3): opens the database, decides between the welcome screen and the
 * vault, and builds the running session.
 *
 * Order: open IndexedDB (refusing data from a newer version), read this device's vault mode,
 * then load metadata, settings and the workspace (start-up never reads note texts other than those
 * of open tabs), apply the appearance, and purge Trash items past their time.
 *
 * Talks to: `store/db.ts`, `vault/operations.ts`, `settings/store.ts`, `settings/apply.ts`,
 * `workspace/store.ts`, `autosave/controller.ts`, `device.ts`, `store/log.ts`.
 */

import { SaveRegistry } from '../autosave/controller.ts';
import { PURGE_INTERVAL_MS } from '../config.ts';
import { defaultDeviceName } from '../device.ts';
import { applyAppearance } from '../settings/apply.ts';
import { SettingsStore } from '../settings/store.ts';
import { openVault, writeTx, type VaultDb } from '../store/db.ts';
import { logEvent } from '../store/log.ts';
import { requestPersistence } from '../store/persist.ts';
import { SCHEMA_VERSION } from '../config.ts';
import { newId } from '../vault/ids.ts';
import { Vault } from '../vault/operations.ts';
import { loadWorkspace, WorkspaceSaver } from '../workspace/store.ts';
import type { Notices } from './notices.svelte.ts';
import { Session } from './session.svelte.ts';

/** Where start-up ended. */
export type BootResult =
  | { readonly kind: 'welcome'; readonly db: VaultDb }
  | { readonly kind: 'ready'; readonly session: Session }
  | { readonly kind: 'newer' }
  | { readonly kind: 'unavailable'; readonly error: string };

/** How this device uses its vault (`state.vaultMode`). M3a adds `synced`. */
export type VaultMode = 'local';

/**
 * Opens the database and, if this device already has a vault, the session.
 *
 * @param notices - The snackbar.
 * @returns What to show.
 */
export async function boot(notices: Notices): Promise<BootResult> {
  const opened = await openVault();
  if (opened.kind === 'newer') return { kind: 'newer' };
  if (opened.kind === 'unavailable') return { kind: 'unavailable', error: opened.error };
  const db = opened.db;
  const mode = (await db.get('state', 'vaultMode'))?.value;
  if (mode === undefined) return { kind: 'welcome', db };
  return { kind: 'ready', session: await startSession(db, notices) };
}

/**
 * "Use only on this device for now" (PLAN 4.5): records this device's id, name and vault mode,
 * then starts the session.
 *
 * @param db - The open database.
 * @param notices - The snackbar.
 * @returns The running session.
 */
export async function startLocalVault(db: VaultDb, notices: Notices): Promise<Session> {
  const deviceName = await defaultDeviceName();
  const tx = writeTx(db, ['state']);
  const state = tx.objectStore('state');
  await Promise.all([
    state.put({ name: 'deviceId', value: newId() }),
    state.put({ name: 'deviceName', value: deviceName }),
    state.put({ name: 'schemaVersion', value: SCHEMA_VERSION }),
    state.put({ name: 'vaultMode', value: 'local' satisfies VaultMode }),
    tx.done,
  ]);
  await logEvent(db, 'info', 'vault-created', 'local');
  return startSession(db, notices);
}

/**
 * Loads the vault, the settings and the workspace, and applies the appearance.
 *
 * @param db - The open database.
 * @param notices - The snackbar.
 * @returns The running session.
 */
async function startSession(db: VaultDb, notices: Notices): Promise<Session> {
  const stored = (await db.get('state', 'deviceName'))?.value;
  const deviceName =
    typeof stored === 'string' && stored !== '' ? stored : await defaultDeviceName();
  const vault = await Vault.load(db, () => deviceName);
  const settings = await SettingsStore.load(vault);
  applyAppearance(settings.current, document.documentElement);
  settings.subscribe((s) => applyAppearance(s, document.documentElement));
  const session = new Session(
    vault,
    settings,
    new WorkspaceSaver(db),
    new SaveRegistry(),
    await loadWorkspace(db),
    notices,
  );
  // PLAN 4.3, 6.3: purge at start and once a day while open. With sync off, by the device clock.
  const purge = (): void => {
    vault.purgeExpired(settings.current.trashDays).catch((error: unknown) => {
      void logEvent(db, 'error', 'purge-failed', error instanceof Error ? error.name : '');
    });
  };
  purge();
  setInterval(purge, PURGE_INTERVAL_MS);
  await session.loadExportState();
  // PLAN 4.16: at every start until granted. Never awaited: start-up does not wait for it.
  void requestPersistence(db).then((state) => (session.persistState = state));
  return session;
}
