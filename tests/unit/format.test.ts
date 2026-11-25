/**
 * Unit tests for database records ↔ local items (`src/lib/sync/format.ts`, PLAN 5.5, 5.6):
 * round trips for every kind, unknown metadata kept, tombstones, limits, and the records that must
 * never be applied (I7).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { ItemKind, ItemRecord } from '../../src/lib/store/schema.ts';
import { OpenError, deriveKey, newSalt } from '../../src/lib/sync/crypto.ts';
import {
  FormatError,
  decodeItem,
  encodeItem,
  encodeTombstone,
  openBlob,
  sealBlob,
  type RemoteItem,
} from '../../src/lib/sync/format.ts';

let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey('a test passphrase of some length', newSalt());
});

function rec(kind: ItemKind, extra: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: 'mi0abcde0000000000aa',
    kind,
    name: 'Ação',
    parent: 'mi0abcde0000000000pp',
    created: 10,
    updated: 20,
    device: 'Linux · Brave',
    deleted: false,
    deletedAt: null,
    mime: null,
    sha256: null,
    extra: {},
    size: 0,
    gone: false,
    rev: 0,
    ts: null,
    dirty: true,
    dirtySince: 1,
    seq: 1,
    base: null,
    unreadable: false,
    ...extra,
  };
}

/** What the database hands back: the record with a server time in place of `SV`. */
const stored = (r: RemoteItem): Record<string, unknown> => ({ ...r, ts: 1_800_000_000_000 });

describe('round trips (PLAN 5.5)', () => {
  it('a note: name, parent, times, device and text', async () => {
    const r = await encodeItem(key, rec('note', { size: 9 }), 'olá ação', 1);
    expect(r).toMatchObject({ rev: 1, kind: 'note', enc: 1, size: 11 });
    expect(r.deleted).toBeUndefined();
    const d = await decodeItem(key, 'mi0abcde0000000000aa', stored(r));
    if (d.gone) throw new Error('gone');
    expect(d.text).toBe('olá ação');
    expect(d.meta).toMatchObject({
      name: 'Ação',
      parent: 'mi0abcde0000000000pp',
      created: 10,
      updated: 20,
      device: 'Linux · Brave',
      deleted: false,
    });
    expect(d.ts).toBe(1_800_000_000_000);
  });

  it('a deleted folder keeps deletedAt; a file keeps its type and hash; settings keep their text', async () => {
    const folder = await decodeItem(
      key,
      'mi0abcde0000000000aa',
      stored(await encodeItem(key, rec('folder', { deleted: true, deletedAt: 30 }), null, 2)),
    );
    expect(folder).toMatchObject({ deleted: true, text: null, meta: { deletedAt: 30 } });
    const file = await decodeItem(
      key,
      'mi0abcde0000000000aa',
      stored(
        await encodeItem(key, rec('file', { mime: 'image/png', sha256: 'ab', size: 3 }), null, 1),
      ),
    );
    expect(file).toMatchObject({ meta: { mime: 'image/png', sha256: 'ab' }, size: 3 });
    const settings = await decodeItem(
      key,
      'mi0abcde0000000000aa',
      stored(await encodeItem(key, rec('settings'), '{"fontSize":18}', 4)),
    );
    expect(settings).toMatchObject({ text: '{"fontSize":18}' });
  });

  it('keeps metadata fields from a newer version (PLAN 5.5)', async () => {
    const r = await encodeItem(key, rec('note', { extra: { colour: 'gold' } }), '', 1);
    const d = await decodeItem(key, 'mi0abcde0000000000aa', stored(r));
    expect(!d.gone && d.meta.extra).toEqual({ colour: 'gold' });
  });

  it('a tombstone has no body and opens as gone', async () => {
    const t = await encodeTombstone(key, 'mi0abcde0000000000aa', 'note', 5);
    expect(t.body).toBeUndefined();
    expect(t.deleted).toBe(true);
    expect(await decodeItem(key, 'mi0abcde0000000000aa', stored(t))).toEqual({
      gone: true,
      kind: 'note',
      rev: 5,
      ts: 1_800_000_000_000,
    });
  });
});

describe('never applied (PLAN 5.6, I7)', () => {
  it('a record copied to another item, or replayed at another revision, does not open', async () => {
    const r = await encodeItem(key, rec('note'), 'secret', 3);
    await expect(decodeItem(key, 'mi0abcde0000000000zz', stored(r))).rejects.toBeInstanceOf(
      OpenError,
    );
    await expect(
      decodeItem(key, 'mi0abcde0000000000aa', { ...stored(r), rev: 4 }),
    ).rejects.toBeInstanceOf(OpenError);
  });

  it('a tombstone sealed for another revision does not delete', async () => {
    const t = await encodeTombstone(key, 'mi0abcde0000000000aa', 'note', 5);
    await expect(
      decodeItem(key, 'mi0abcde0000000000aa', { ...stored(t), rev: 6 }),
    ).rejects.toBeInstanceOf(OpenError);
  });

  it('a record sealed with another key does not open', async () => {
    const other = await deriveKey('another passphrase entirely', newSalt());
    const r = await encodeItem(other, rec('note'), 'x', 1);
    await expect(decodeItem(key, 'mi0abcde0000000000aa', stored(r))).rejects.toBeInstanceOf(
      OpenError,
    );
  });

  it('a newer format is reported as such, and malformed records as invalid', async () => {
    const r = stored(await encodeItem(key, rec('note'), 'x', 1));
    await expect(decodeItem(key, 'mi0abcde0000000000aa', { ...r, enc: 2 })).rejects.toMatchObject({
      reason: 'newer-format',
    });
    for (const bad of [
      null,
      'x',
      { ...r, rev: 0 },
      { ...r, kind: 'image' },
      { ...r, ts: 'now' },
      { ...r, body: undefined },
    ]) {
      await expect(decodeItem(key, 'mi0abcde0000000000aa', bad)).rejects.toBeInstanceOf(
        FormatError,
      );
    }
  });
});

describe('limits and blobs (PLAN 5.5, 5.6)', () => {
  it('refuses a note over 4,000,000 bytes', async () => {
    await expect(encodeItem(key, rec('note'), 'a'.repeat(4_000_001), 1)).rejects.toBeInstanceOf(
      RangeError,
    );
  });

  it('blobs open only for their file and must match the hash', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
    const sealed = await sealBlob(key, 'mi0abcde0000000000aa', bytes);
    expect(await openBlob(key, 'mi0abcde0000000000aa', sealed, hash)).toEqual(bytes);
    await expect(openBlob(key, 'mi0abcde0000000000bb', sealed, hash)).rejects.toBeInstanceOf(
      OpenError,
    );
    await expect(openBlob(key, 'mi0abcde0000000000aa', sealed, 'ff')).rejects.toBeInstanceOf(
      FormatError,
    );
    expect(() => sealBlob(key, 'x', new Uint8Array(7_000_001))).toThrow(RangeError);
  });
});
