/**
 * Persistent storage (PLAN 4.16): at every start, until it is granted, ask the browser not to evict
 * this site's storage. Chromium decides without a prompt, from how much the site is used and
 * whether it is installed, so a first refusal is normal and a later call succeeds.
 *
 * Talks to: `navigator.storage` and the diagnostic log.
 */

import type { VaultDb } from './db.ts';
import { logEvent } from './log.ts';

/** Whether this site's storage is persistent, as far as the browser says. */
export type PersistState = 'persistent' | 'not-yet' | 'unsupported';

/**
 * Asks for persistent storage if the site does not have it yet.
 *
 * @param db - For the log entry.
 * @returns The state after asking. It never throws.
 */
export async function requestPersistence(db: VaultDb): Promise<PersistState> {
  const storage = navigator.storage as StorageManager | undefined;
  if (storage?.persisted === undefined || storage.persist === undefined) return 'unsupported';
  try {
    if (await storage.persisted()) return 'persistent';
    const granted = await storage.persist();
    await logEvent(db, 'info', 'storage-persist', granted ? 'granted' : 'not-yet');
    return granted ? 'persistent' : 'not-yet';
  } catch (error) {
    await logEvent(db, 'warn', 'storage-persist-failed', error instanceof Error ? error.name : '');
    return 'not-yet';
  }
}
