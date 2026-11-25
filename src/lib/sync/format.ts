/**
 * Database records ↔ local items (PLAN 5.5, 5.6): sealing an item for upload, and opening and
 * checking a record that came down. Nothing here touches the network or IndexedDB.
 *
 * A record that fails any check is never applied (PLAN 5.6, I7): `decodeItem` throws, and the
 * engine marks the item unreadable and keeps the local copy.
 *
 * Talks to: `sync/crypto.ts` for seals; `store/schema.ts` for the local shapes.
 */

import type { ItemKind, ItemMeta, ItemRecord } from '../store/schema.ts';
import { AAD, deflateRaw, inflateRaw, open, seal } from './crypto.ts';

/** The value Firebase replaces with the server's time (PLAN 5.8, `SV`). */
export const SV = { '.sv': 'timestamp' } as const;

/** Size limits of PLAN 5.5, in bytes. */
export const LIMITS = {
  /** A note syncs while its text is at most this many bytes of UTF-8. */
  noteBytes: 4_000_000,
  /** Files are at most this big. */
  fileBytes: 7_000_000,
  /** The rules allow `meta` up to this many characters. */
  metaChars: 8192,
} as const;

/** One item as the database stores it (PLAN 5.5). `ts` is `SV` on the way up. */
export interface RemoteItem {
  rev: number;
  ts: number | typeof SV;
  kind: ItemKind;
  enc: 1;
  meta: string;
  body?: string;
  size?: number;
  deleted?: true;
}

/** The vault's `info` record (PLAN 5.5). */
export interface RemoteInfo {
  format: 1;
  salt: string;
  check: string;
  created: number | typeof SV;
}

/** A record that is not of format 1 or is malformed; distinct from a seal that does not open. */
export class FormatError extends Error {
  /**
   * @param reason - `newer-format` for an `enc` this version does not know (PLAN 5.6: shown as
   *   "needs a newer version of Tamanduá" and never overwritten), `invalid` otherwise.
   * @param detail - What was wrong, for the log.
   */
  constructor(
    readonly reason: 'newer-format' | 'invalid',
    detail: string,
  ) {
    super(`Record ${reason}: ${detail}`);
    this.name = 'FormatError';
  }
}

/** A record opened and checked. */
export type DecodedItem =
  | {
      readonly gone: false;
      readonly kind: ItemKind;
      readonly rev: number;
      readonly ts: number;
      readonly deleted: boolean;
      readonly meta: ItemMeta;
      /** The text of a note or of the settings item; null for folders and files. */
      readonly text: string | null;
      readonly size: number;
    }
  /** Deleted forever: a sealed `{"gone":true}` (PLAN 5.5). Applied from M3b. */
  | { readonly gone: true; readonly kind: ItemKind; readonly rev: number; readonly ts: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const KINDS: readonly ItemKind[] = ['note', 'folder', 'file', 'settings'];
/** Metadata fields this version reads; any other field is kept in `extra`. */
const KNOWN_META = new Set([
  'name',
  'parent',
  'created',
  'updated',
  'device',
  'deletedAt',
  'mime',
  'sha256',
]);

/**
 * Seals an item for upload at a revision (PLAN 6.3, "Push" step 2).
 *
 * @param key - The vault key.
 * @param item - The local record.
 * @param text - The text of a note or the settings item; ignored for other kinds.
 * @param rev - The revision being written.
 * @returns The record for the `PATCH`, with `ts` as the server-time placeholder.
 * @throws RangeError for a note over 4,000,000 bytes or metadata too large for the rules.
 */
export async function encodeItem(
  key: CryptoKey,
  item: ItemRecord,
  text: string | null,
  rev: number,
): Promise<RemoteItem> {
  const meta: Record<string, unknown> = {
    ...item.extra,
    name: item.name,
    parent: item.parent,
    created: item.created,
    updated: item.updated,
    device: item.device,
  };
  if (item.deleted && item.deletedAt !== null) meta.deletedAt = item.deletedAt;
  if (item.kind === 'file') {
    meta.mime = item.mime;
    meta.sha256 = item.sha256;
  }
  const sealedMeta = await seal(key, encoder.encode(JSON.stringify(meta)), AAD.meta(item.id, rev));
  if (sealedMeta.length > LIMITS.metaChars) throw new RangeError('metadata too large');
  const record: RemoteItem = {
    rev,
    ts: SV,
    kind: item.kind,
    enc: 1,
    meta: sealedMeta,
    size: item.size,
  };
  if (item.deleted) record.deleted = true;
  if (item.kind === 'note' || item.kind === 'settings') {
    const bytes = encoder.encode(text ?? '');
    if (bytes.length > LIMITS.noteBytes) throw new RangeError('note too large to sync');
    record.body = await seal(key, await deflateRaw(bytes), AAD.body(item.id, rev));
    record.size = bytes.length;
  }
  return record;
}

/**
 * Makes the tombstone of an item deleted forever (PLAN 5.5): no body, and a sealed `{"gone":true}`
 * bound to the item and its revision, so only a device with the passphrase can delete.
 *
 * @param key - The vault key.
 * @param id - The item.
 * @param kind - Its kind, which never changes.
 * @param rev - The revision being written.
 * @returns The tombstone record.
 */
export async function encodeTombstone(
  key: CryptoKey,
  id: string,
  kind: ItemKind,
  rev: number,
): Promise<RemoteItem> {
  const meta = await seal(key, encoder.encode('{"gone":true}'), AAD.meta(id, rev));
  return { rev, ts: SV, kind, enc: 1, meta, deleted: true };
}

/** Narrows an unknown to a plain object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Opens and checks a record from the database (PLAN 6.3, "Pull" step 2).
 *
 * @param key - The vault key.
 * @param id - The item's id (the record's key).
 * @param raw - The record as parsed from JSON.
 * @returns The item's metadata and text.
 * @throws FormatError for a malformed record or a newer format; OpenError for a seal that does not
 *   open (wrong key, copied from another item or revision, or damaged).
 */
export async function decodeItem(key: CryptoKey, id: string, raw: unknown): Promise<DecodedItem> {
  if (!isObject(raw)) throw new FormatError('invalid', 'not an object');
  const { rev, ts, kind, enc, meta, body, size, deleted } = raw;
  if (typeof enc === 'number' && enc !== 1)
    throw new FormatError('newer-format', `enc ${String(enc)}`);
  if (enc !== 1) throw new FormatError('invalid', 'enc');
  if (typeof rev !== 'number' || !Number.isInteger(rev) || rev < 1)
    throw new FormatError('invalid', 'rev');
  if (typeof ts !== 'number') throw new FormatError('invalid', 'ts');
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind))
    throw new FormatError('invalid', 'kind');
  if (typeof meta !== 'string') throw new FormatError('invalid', 'meta');
  if (deleted !== undefined && deleted !== true) throw new FormatError('invalid', 'deleted');
  const itemKind = kind as ItemKind;

  const metaJson = decoder.decode(await open(key, meta, AAD.meta(id, rev)));
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    throw new FormatError('invalid', 'meta is not JSON');
  }
  if (!isObject(parsed)) throw new FormatError('invalid', 'meta is not an object');
  if (parsed.gone === true) {
    // PLAN 5.5: a tombstone has no body and is marked deleted.
    if (deleted !== true || body !== undefined) throw new FormatError('invalid', 'tombstone');
    return { gone: true, kind: itemKind, rev, ts };
  }

  const { name, parent, created, updated, device } = parsed;
  if (typeof name !== 'string' || typeof parent !== 'string')
    throw new FormatError('invalid', 'name or parent');
  if (typeof created !== 'number' || typeof updated !== 'number')
    throw new FormatError('invalid', 'times');
  const extra = Object.fromEntries(Object.entries(parsed).filter(([k]) => !KNOWN_META.has(k)));
  const itemMeta: ItemMeta = {
    name,
    parent,
    created,
    updated,
    device: typeof device === 'string' ? device : '',
    deleted: deleted === true,
    deletedAt: deleted === true && typeof parsed.deletedAt === 'number' ? parsed.deletedAt : null,
    mime: itemKind === 'file' && typeof parsed.mime === 'string' ? parsed.mime : null,
    sha256: itemKind === 'file' && typeof parsed.sha256 === 'string' ? parsed.sha256 : null,
    extra,
  };

  let text: string | null = null;
  if (itemKind === 'note' || itemKind === 'settings') {
    if (typeof body !== 'string') throw new FormatError('invalid', 'body missing');
    text = decoder.decode(await inflateRaw(await open(key, body, AAD.body(id, rev))));
  }
  const byteSize =
    typeof size === 'number' ? size : text === null ? 0 : encoder.encode(text).length;
  return {
    gone: false,
    kind: itemKind,
    rev,
    ts,
    deleted: deleted === true,
    meta: itemMeta,
    text,
    size: byteSize,
  };
}

/**
 * Seals a file's bytes (PLAN 5.6: not compressed).
 *
 * @param key - The vault key.
 * @param id - The file's id.
 * @param bytes - At most 7,000,000 bytes.
 * @returns The sealed blob for `blobs/<id>`.
 * @throws RangeError for a file over the limit.
 */
export function sealBlob(
  key: CryptoKey,
  id: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  if (bytes.byteLength > LIMITS.fileBytes) throw new RangeError('file over 7 MB');
  return seal(key, bytes, AAD.blob(id));
}

/**
 * Opens a file's sealed bytes and checks them against the metadata's SHA-256 (PLAN 5.6).
 *
 * @param key - The vault key.
 * @param id - The file's id.
 * @param sealed - The sealed blob.
 * @param sha256 - The hex SHA-256 the metadata promises.
 * @returns The bytes.
 * @throws OpenError when the seal does not open; FormatError when the hash differs.
 */
export async function openBlob(
  key: CryptoKey,
  id: string,
  sealed: string,
  sha256: string | null,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await open(key, sealed, AAD.blob(id));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  if (sha256 !== null && hex !== sha256) throw new FormatError('invalid', 'blob hash');
  return bytes;
}
