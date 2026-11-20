/**
 * Building and changing item records with the sync bookkeeping of PLAN 5.3, in one place.
 *
 * Every local change to an item goes through `changed()`: it raises `seq`, marks the item dirty,
 * keeps the oldest unsent time in `dirtySince`, and keeps `base` (the metadata as of `rev`) while
 * the item is dirty, so the merges of M3b have a common ancestor. Nothing else may set these
 * fields for a local change.
 *
 * Talks to: nothing. Pure functions used by `vault/operations.ts` and `settings/store.ts`.
 */

import type { ItemKind, ItemMeta, ItemRecord } from '../store/schema.ts';

/**
 * Extracts the metadata part of a record (PLAN 5.5).
 *
 * @param item - A record.
 * @returns A copy of its metadata.
 */
export function metaOf(item: ItemRecord): ItemMeta {
  return {
    name: item.name,
    parent: item.parent,
    created: item.created,
    updated: item.updated,
    device: item.device,
    deleted: item.deleted,
    deletedAt: item.deletedAt,
    mime: item.mime,
    sha256: item.sha256,
    extra: { ...item.extra },
  };
}

/** What a new item needs. */
export interface NewItem {
  id: string;
  kind: ItemKind;
  name: string;
  parent: string;
  size?: number;
  mime?: string | null;
  sha256?: string | null;
}

/**
 * Makes the record of a new item: never uploaded (`rev` 0), dirty, `seq` 1.
 *
 * @param item - Id, kind, name, parent and, for files, size, type and hash.
 * @param now - Device time in ms.
 * @param device - This device's name.
 * @returns The record.
 */
export function newRecord(item: NewItem, now: number, device: string): ItemRecord {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    parent: item.parent,
    created: now,
    updated: now,
    device,
    deleted: false,
    deletedAt: null,
    mime: item.mime ?? null,
    sha256: item.sha256 ?? null,
    extra: {},
    size: item.size ?? 0,
    gone: false,
    rev: 0,
    ts: null,
    dirty: true,
    dirtySince: now,
    seq: 1,
    base: null,
    unreadable: false,
  };
}

/** The fields a local change may set. Sync fields are set by `changed()` itself. */
export type ItemPatch = Partial<
  Pick<
    ItemRecord,
    'name' | 'parent' | 'deleted' | 'deletedAt' | 'size' | 'mime' | 'sha256' | 'gone'
  >
>;

/**
 * Applies a local change to a record (PLAN 5.3, 6.3).
 *
 * @param old - The record before the change.
 * @param patch - The fields that change.
 * @param now - Device time in ms; becomes `updated`, and `dirtySince` if the item was clean.
 * @param device - This device's name, recorded as the last to change it.
 * @returns The new record. The old one is not modified.
 */
export function changed(
  old: ItemRecord,
  patch: ItemPatch,
  now: number,
  device: string,
): ItemRecord {
  // `base` is the metadata as of `rev`. It is captured on the first change after a sync and kept
  // until the next upload; an item never uploaded has no base.
  const base = old.dirty ? old.base : old.rev > 0 ? metaOf(old) : null;
  return {
    ...old,
    ...patch,
    updated: now,
    device,
    dirty: true,
    dirtySince: old.dirty ? (old.dirtySince ?? now) : now,
    seq: old.seq + 1,
    base,
  };
}

/**
 * Size of a text in bytes of UTF-8, as stored in `size` (PLAN 5.5).
 *
 * @param text - Any text.
 * @returns The byte count.
 */
export function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}
