/**
 * The shape of everything stored in IndexedDB (PLAN 5.3): the record types of each object store
 * and the typed schema `idb` uses.
 *
 * Owns the field names and their meaning. Every sync field of 5.3 exists from M1, although nothing
 * uploads until M3a (PLAN 7, "Build it right the first time"): every local change marks its item
 * dirty, so the first upload finds everything waiting.
 *
 * Talks to: nothing. Imported by `store/db.ts` and by every module that reads or writes records.
 */

import type { DBSchema } from 'idb';

/** The four kinds of item (PLAN 4.3, 5.5). The kind of an item never changes. */
export type ItemKind = 'note' | 'folder' | 'file' | 'settings';

/** The fixed id of the settings item (PLAN 5.5). */
export const SETTINGS_ID = 'settings000000000000';

/**
 * The metadata of an item: what the merge rules compare (PLAN 6.3) and what `base` keeps while an
 * item is dirty.
 */
export interface ItemMeta {
  /** The name shown in the tree; notes without `.md`. NFC-normalised. */
  name: string;
  /** Id of the parent folder, or `""` for the root. */
  parent: string;
  /** Device time of creation, in ms. For display only. */
  created: number;
  /** Device time of the last change, in ms. For display only. */
  updated: number;
  /** Name of the device that made the last change. */
  device: string;
  /** True while the item is in the Trash (marked itself, not through a folder). */
  deleted: boolean;
  /** Device time of the deletion, in ms, while deleted; null otherwise. For display only. */
  deletedAt: number | null;
  /** For files: the MIME type; null for other kinds. */
  mime: string | null;
  /** For files: hex SHA-256 of the bytes; null for other kinds. */
  sha256: string | null;
  /**
   * Metadata fields this version does not know, written by a newer version. Kept as they are and
   * written back with the item, so an older version never erases a newer one's data (PLAN 5.5).
   */
  extra: Record<string, unknown>;
}

/** One record of the `items` store (PLAN 5.3). */
export interface ItemRecord extends ItemMeta {
  /** Permanent random id (PLAN 5.5): 20 characters of lowercase base 36. */
  id: string;
  kind: ItemKind;
  /** Size in bytes: a note's UTF-8 text or a file's bytes. */
  size: number;
  /**
   * Deleted forever. Only kept as a local tombstone when the item was ever uploaded (`rev > 0`), so
   * the deletion can upload (PLAN 5.5); an item never uploaded is simply removed.
   */
  gone: boolean;
  /** Last revision known from the database; 0 if never uploaded. */
  rev: number;
  /** Database time of that revision, in ms; null if never uploaded. */
  ts: number | null;
  /** Changes not yet uploaded. */
  dirty: boolean;
  /** Device time of the oldest change not uploaded, in ms; orders the upload queue (PLAN 5.8). */
  dirtySince: number | null;
  /** Raised by every local change, so an upload can tell whether the item changed meanwhile. */
  seq: number;
  /** The metadata as of `rev`, kept while dirty, for merges. Null when clean or never uploaded. */
  base: ItemMeta | null;
  /** A remote version failed to open (PLAN 5.6); the local copy stays. */
  unreadable: boolean;
}

/** One record of the `texts` store: the text of a note or of the settings item. */
export interface TextRecord {
  id: string;
  /** The text, with `\n` line endings (PLAN 4.3). */
  text: string;
  /** The text as of `rev`, kept only while dirty and `rev > 0`, for merges. */
  baseText: string | null;
}

/** One record of the `files` store: a file's bytes. */
export interface FileRecord {
  id: string;
  blob: Blob;
}

/** One record of the `snapshots` store (PLAN 4.3, "Local snapshots"). */
export interface SnapshotRecord {
  id: string;
  /** Device time of the snapshot, in ms. With `id`, the key. */
  time: number;
  /** Why it was taken: idle, tab closed, before a remote change, before a merge, restore. */
  reason: 'idle' | 'close' | 'remote' | 'merge' | 'restore';
  text: string;
}

/** One record of the `state` store: a named value of this device. */
export interface StateRecord {
  name: StateName;
  value: unknown;
}

/** The names the `state` store holds (PLAN 5.3). */
export type StateName =
  | 'deviceId'
  | 'deviceName'
  | 'key'
  | 'salt'
  | 'cursor'
  | 'lastSync'
  | 'lastExport'
  | 'changedSinceExport'
  | 'exportSnoozedUntil'
  | 'schemaVersion'
  | 'vaultMode';

/** One record of the `keys` store: the derived AES key, non-extractable (PLAN 4.5). */
export interface KeyRecord {
  salt: string;
  key: CryptoKey;
}

/** One record of the `workspace` store; the value itself is defined by `workspace/model.ts`. */
export interface WorkspaceRecord {
  name: 'current';
  value: unknown;
}

/** One record of the `log` store: a diagnostic entry, never with note text, names or keys. */
export interface LogRecord {
  /** Assigned by IndexedDB. */
  seq?: number;
  time: number;
  level: 'info' | 'warn' | 'error';
  /** A short machine-readable code, for example `save-failed`. */
  code: string;
  /** Ids, counts and error names only. */
  detail: string;
}

/** The typed schema of the database, for `idb`. */
export interface VaultSchema extends DBSchema {
  items: { key: string; value: ItemRecord };
  texts: { key: string; value: TextRecord };
  files: { key: string; value: FileRecord };
  snapshots: { key: [string, number]; value: SnapshotRecord };
  state: { key: StateName; value: StateRecord };
  keys: { key: string; value: KeyRecord };
  workspace: { key: 'current'; value: WorkspaceRecord };
  log: { key: number; value: LogRecord };
}

/** The names of the object stores. */
export type StoreName =
  'items' | 'texts' | 'files' | 'snapshots' | 'state' | 'keys' | 'workspace' | 'log';
