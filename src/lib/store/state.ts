/**
 * Typed access to this device's `state` store (PLAN 5.3): values such as the last export time.
 *
 * Talks to: the `state` store through `store/db.ts`.
 */

import { writeTx, type VaultDb } from './db.ts';
import type { StateName } from './schema.ts';

/**
 * Reads a number from the state store.
 *
 * @param db - The open database.
 * @param name - The value's name.
 * @returns The number, or null when absent or not a number.
 */
export async function readNumber(db: VaultDb, name: StateName): Promise<number | null> {
  const value = (await db.get('state', name))?.value;
  return typeof value === 'number' ? value : null;
}

/**
 * Writes a value to the state store, with strict durability.
 *
 * @param db - The open database.
 * @param name - The value's name.
 * @param value - Any value IndexedDB can store.
 * @returns Resolves when written.
 */
export async function writeState(db: VaultDb, name: StateName, value: unknown): Promise<void> {
  const tx = writeTx(db, ['state']);
  await Promise.all([tx.objectStore('state').put({ name, value }), tx.done]);
}
