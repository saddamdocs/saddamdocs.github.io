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
import { readNumber, writeState } from '../store/state.ts';
import { SyncEngine } from '../sync/engine.ts';
import {
  createVault,
  newSyncKey,
  unlockVault,
  type Unlocked,
  type UnlockProblem,
} from '../sync/keys.ts';
import { Rest, channelEndpoint } from '../sync/rest.ts';
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

/** How this device uses its vault (`state.vaultMode`, PLAN 4.5). */
export type VaultMode = 'local' | 'synced';

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
  if ((await db.get('state', 'vaultMode'))?.value === 'synced') await attachSync(session, db, true);
  // PLAN 4.16: at every start until granted. Never awaited: start-up does not wait for it.
  void requestPersistence(db).then((state) => (session.persistState = state));
  return session;
}

/**
 * Starts the sync engine of a synced vault (PLAN 6.3): reads the key, the salt, the derived key
 * and the cursor of this device, and connects the engine to the session.
 *
 * @param session - The running session.
 * @param db - The open database.
 * @param start - Start at once (catch up and upload); false when the caller downloads first.
 * @returns The engine, or null when this device has no derived key (the passphrase was forgotten
 *   on this device, PLAN 4.5: sync pauses until it is typed again, from M3c).
 */
export async function attachSync(
  session: Session,
  db: VaultDb,
  start: boolean,
): Promise<SyncEngine | null> {
  const key = (await db.get('state', 'key'))?.value;
  const salt = (await db.get('state', 'salt'))?.value;
  if (typeof key !== 'string' || typeof salt !== 'string') return null;
  const stored = await db.get('keys', salt);
  if (stored === undefined) {
    session.chip = { kind: 'paused' };
    return null;
  }
  const cursor = await readNumber(db, 'cursor');
  const engine = new SyncEngine(
    session.vault,
    new Rest(channelEndpoint(key)),
    stored.key,
    {
      isOpen: (id) => session.isOpenInEditor(id),
      applyToEditor: (id, text) => session.applyRemoteText(id, text),
      saveCursor: (value) => writeState(db, 'cursor', value),
    },
    cursor ?? 0,
  );
  session.attachSync(engine, key);
  if (start) engine.start();
  return engine;
}

/** Stores what a synced device keeps (PLAN 5.3, 5.4): key, salt, derived key, mode, name. */
async function storeSyncState(
  db: VaultDb,
  key: string,
  unlocked: Unlocked,
  deviceName: string,
): Promise<void> {
  const tx = writeTx(db, ['state', 'keys']);
  const state = tx.objectStore('state');
  const existingId = await state.get('deviceId');
  await Promise.all([
    existingId === undefined ? state.put({ name: 'deviceId', value: newId() }) : Promise.resolve(),
    state.put({ name: 'deviceName', value: deviceName }),
    state.put({ name: 'schemaVersion', value: SCHEMA_VERSION }),
    state.put({ name: 'key', value: key }),
    state.put({ name: 'salt', value: unlocked.salt }),
    state.put({ name: 'cursor', value: 0 }),
    state.put({ name: 'vaultMode', value: 'synced' satisfies VaultMode }),
    tx.objectStore('keys').put({ salt: unlocked.salt, key: unlocked.key }),
    tx.done,
  ]);
}

/** The choices of the sync forms. */
export interface SyncChoice {
  readonly deviceName: string;
  readonly passphrase: string;
}

/**
 * "Start a new synced vault" (PLAN 4.5): makes a key, writes `info`, and uploads every note
 * already on this device. Works from the welcome screen (no session yet) and from Settings → Sync
 * (a local vault already open).
 *
 * @param db - The open database.
 * @param notices - The snackbar.
 * @param choice - Device name and passphrase.
 * @param session - The running session, when starting from Settings.
 * @returns The session and the new key, to show with Copy.
 * @throws RangeError for a short passphrase; RestFailure when the database cannot be reached.
 */
export async function startSyncedVault(
  db: VaultDb,
  notices: Notices,
  choice: SyncChoice,
  session?: Session,
): Promise<{ session: Session; key: string }> {
  const key = newSyncKey();
  const unlocked = await createVault(new Rest(channelEndpoint(key)), choice.passphrase);
  await storeSyncState(db, key, unlocked, choice.deviceName);
  await logEvent(db, 'info', 'vault-created', 'synced');
  if (session !== undefined) {
    await attachSync(session, db, true);
    return { session, key };
  }
  // startSession attaches and starts the engine, because the mode is now `synced`.
  return { session: await startSession(db, notices), key };
}

/**
 * "Connect to my vault" for a device with no notes of its own (PLAN 4.5; M3c adds devices that
 * have notes): checks the passphrase against `info` first, then downloads the vault with progress.
 *
 * @param db - The open database.
 * @param notices - The snackbar.
 * @param key - The sync key, as read by `readSyncKey`.
 * @param choice - Device name and passphrase.
 * @param progress - Bytes downloaded so far, and the total when known.
 * @returns The running session, or why the vault could not be opened.
 * @throws RestFailure when the database cannot be reached.
 */
export async function connectVault(
  db: VaultDb,
  notices: Notices,
  key: string,
  choice: SyncChoice,
  progress: (done: number, total: number | null) => void,
): Promise<Session | { problem: UnlockProblem }> {
  const unlocked = await unlockVault(new Rest(channelEndpoint(key)), choice.passphrase);
  if ('problem' in unlocked) return unlocked;
  await storeSyncState(db, key, unlocked, choice.deviceName);
  await writeState(db, 'vaultMode', 'local' satisfies VaultMode);
  const session = await startSession(db, notices);
  await writeState(db, 'vaultMode', 'synced' satisfies VaultMode);
  const engine = await attachSync(session, db, false);
  await engine?.downloadAll(progress);
  engine?.start();
  return session;
}
