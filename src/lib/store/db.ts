/**
 * Opening the vault's IndexedDB database, its migrations, and the rule that every write of user
 * data uses strict durability (PLAN 4.4, 5.3).
 *
 * Owns the database name (the channel prefix), the schema version and the migration list. A
 * migration never deletes user data. An app that finds a database written by a newer version of
 * itself opens nothing and writes nothing (PLAN 4.16).
 *
 * Talks to: IndexedDB through `idb`; `channel.ts` for the name and `config.ts` for the version.
 */

import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { storageName } from '../channel.ts';
import { SCHEMA_VERSION } from '../config.ts';
import type { StoreName, VaultSchema } from './schema.ts';

/** An open vault database. */
export type VaultDb = IDBPDatabase<VaultSchema>;

/** The result of opening the database. */
export type OpenResult =
  | { readonly kind: 'ok'; readonly db: VaultDb }
  /** The data was written by a newer version of the app (PLAN 4.16). Nothing was touched. */
  | { readonly kind: 'newer'; readonly found: number }
  /** The browser refused IndexedDB (storage disabled, private mode with no storage). */
  | { readonly kind: 'unavailable'; readonly error: string };

/**
 * One migration: changes the schema from `version - 1` to `version`. It must never delete user
 * data, and each one is tested on a fixture database of the previous version (PLAN 5.3).
 */
type Migration = (
  db: VaultDb,
  tx: IDBPTransaction<VaultSchema, StoreName[], 'versionchange'>,
) => void;

/** Every migration, by the version it produces. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (db) => {
    db.createObjectStore('items', { keyPath: 'id' });
    db.createObjectStore('texts', { keyPath: 'id' });
    db.createObjectStore('files', { keyPath: 'id' });
    db.createObjectStore('snapshots', { keyPath: ['id', 'time'] });
    db.createObjectStore('state', { keyPath: 'name' });
    db.createObjectStore('keys', { keyPath: 'salt' });
    db.createObjectStore('workspace', { keyPath: 'name' });
    db.createObjectStore('log', { keyPath: 'seq', autoIncrement: true });
  },
};

/** The database's name: the channel prefix (PLAN 5.3), so stable and next can never collide. */
export const DB_NAME = storageName();

/**
 * Opens the vault database, creating or migrating it as needed.
 *
 * @param name - Database name; the channel's by default. Tests pass their own.
 * @param version - Schema version to open; `SCHEMA_VERSION` by default. Tests of migrations pass
 *   an older one.
 * @returns The open database, or why it could not be opened. It never throws.
 */
export async function openVault(name = DB_NAME, version = SCHEMA_VERSION): Promise<OpenResult> {
  try {
    const db = await openDB<VaultSchema>(name, version, {
      upgrade(database, oldVersion, newVersion, transaction) {
        const target = newVersion ?? version;
        for (let v = oldVersion + 1; v <= target; v += 1) {
          const migrate = MIGRATIONS[v];
          if (migrate === undefined) throw new Error(`No migration to schema version ${String(v)}`);
          migrate(database, transaction);
        }
      },
      blocking() {
        // Another page wants a newer version. Close so it is not blocked; this page then needs a
        // reload, which the one-window lock (PLAN 5.10) makes rare.
        db.close();
      },
    });
    return { kind: 'ok', db };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'VersionError') {
      return { kind: 'newer', found: await existingVersion(name) };
    }
    return { kind: 'unavailable', error: error instanceof Error ? error.message : String(error) };
  }
}

/** Reads the version of an existing database without upgrading it. */
async function existingVersion(name: string): Promise<number> {
  const list = await indexedDB.databases();
  return list.find((d) => d.name === name)?.version ?? 0;
}

/**
 * Starts a transaction that writes user data. Every such transaction asks for strict durability,
 * so "Saved" means the data has been handed to the disk, not only to the operating system's
 * buffer (PLAN 4.4; relaxed has been Chromium's default since version 121).
 *
 * @param db - The open database.
 * @param stores - The stores the transaction writes or reads.
 * @returns The transaction. Await its `done` to know it committed.
 */
export function writeTx<const Names extends StoreName[]>(
  db: VaultDb,
  stores: Names,
): IDBPTransaction<VaultSchema, Names, 'readwrite'> {
  return db.transaction(stores, 'readwrite', { durability: 'strict' });
}
