/**
 * Rules tests (PLAN 8, "Rules"): every rule of Appendix B, allowed and refused, against the
 * Realtime Database emulator. A refused write or read is HTTP 401 (PLAN 5.8).
 *
 * M0 covers each rule once; M3a extends these with the remaining edge cases.
 * Run with `npm run test:rules`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { SV, loadRules, namespace, randomId, randomKey, rest } from '../support/emulator.ts';

const ns = namespace('rules');
const key = randomKey();
const base = `/tamandua/${key}`;

/** A sealed field stand-in: the rules only see strings. */
const SEALED = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/** A valid item record at a revision. */
function item(rev: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { rev, ts: SV, kind: 'note', enc: 1, meta: SEALED, body: SEALED, size: 10, ...extra };
}

beforeAll(async () => {
  await loadRules(ns);
});

const as = { ns };

describe('nothing outside /tamandua', () => {
  it('refuses reads and writes at the root and elsewhere', async () => {
    expect((await rest('GET', '/', undefined, as)).status).toBe(401);
    expect((await rest('GET', '/other', undefined, as)).status).toBe(401);
    expect((await rest('PUT', '/other', { a: 1 }, as)).status).toBe(401);
  });

  it('does not allow listing the vault keys', async () => {
    expect((await rest('GET', '/tamandua', undefined, as)).status).toBe(401);
    expect((await rest('PUT', '/tamandua', { x: 1 }, as)).status).toBe(401);
  });
});

describe('keys of 32 or more characters', () => {
  const short = `/tamandua/${randomKey(31)}`;

  it('refuses a key of 31 characters for every node', async () => {
    expect((await rest('GET', `${short}/info`, undefined, as)).status).toBe(401);
    expect((await rest('GET', `${short}/head`, undefined, as)).status).toBe(401);
    expect((await rest('GET', `${short}/items`, undefined, as)).status).toBe(401);
    const info = { format: 1, salt: 'c2FsdA==', check: SEALED, created: SV };
    expect((await rest('PUT', `${short}/info`, info, as)).status).toBe(401);
    expect((await rest('PUT', `${short}/items/${randomId()}`, item(1), as)).status).toBe(401);
  });

  it('allows reading a vault that does not exist yet (null)', async () => {
    const res = await rest('GET', `/tamandua/${randomKey()}/head`, undefined, as);
    expect(res).toEqual({ status: 200, body: null });
  });

  it('refuses writing the vault branch as a whole', async () => {
    expect((await rest('PUT', base, { info: null }, as)).status).toBe(401);
  });
});

describe('info: written once, never changed', () => {
  const info = { format: 1, salt: 'c2FsdHNhbHRzYWx0c2FsdA==', check: SEALED, created: SV };

  it('refuses a malformed info', async () => {
    const vault = `/tamandua/${randomKey()}`;
    expect((await rest('PUT', `${vault}/info`, { ...info, format: 2 }, as)).status).toBe(401);
    expect((await rest('PUT', `${vault}/info`, { ...info, created: 5 }, as)).status).toBe(401);
    expect((await rest('PUT', `${vault}/info`, { ...info, extra: 1 }, as)).status).toBe(401);
    const { check: _check, ...noCheck } = info;
    expect((await rest('PUT', `${vault}/info`, noCheck, as)).status).toBe(401);
  });

  it('accepts the first write, then refuses changes and deletion', async () => {
    expect((await rest('PUT', `${base}/info`, info, as)).status).toBe(200);
    expect((await rest('PUT', `${base}/info`, info, as)).status).toBe(401);
    expect((await rest('PUT', `${base}/info/salt`, 'b3RoZXI=', as)).status).toBe(401);
    expect((await rest('DELETE', `${base}/info`, undefined, as)).status).toBe(401);
    const read = await rest('GET', `${base}/info`, undefined, as);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ format: 1, check: SEALED });
  });
});

describe('moved: written once, never changed', () => {
  it('accepts one valid marker and refuses everything after it', async () => {
    const vault = `/tamandua/${randomKey()}`;
    expect((await rest('PUT', `${vault}/moved`, { ts: 1, check: SEALED }, as)).status).toBe(401);
    expect((await rest('PUT', `${vault}/moved`, { ts: SV, check: SEALED }, as)).status).toBe(200);
    expect((await rest('PUT', `${vault}/moved`, { ts: SV, check: SEALED }, as)).status).toBe(401);
    expect((await rest('DELETE', `${vault}/moved`, undefined, as)).status).toBe(401);
  });
});

describe('head', () => {
  it('accepts the server time, an id and a revision, and may be rewritten', async () => {
    const head = { ts: SV, id: randomId(), rev: 1 };
    expect((await rest('PUT', `${base}/head`, head, as)).status).toBe(200);
    expect((await rest('PUT', `${base}/head`, { ...head, rev: 2 }, as)).status).toBe(200);
  });

  it('refuses a client time, a missing field, an extra field and deletion', async () => {
    const id = randomId();
    expect((await rest('PUT', `${base}/head`, { ts: 1, id, rev: 1 }, as)).status).toBe(401);
    expect((await rest('PUT', `${base}/head`, { ts: SV, id }, as)).status).toBe(401);
    expect((await rest('PUT', `${base}/head`, { ts: SV, id, rev: 1, x: 1 }, as)).status).toBe(401);
    expect((await rest('DELETE', `${base}/head`, undefined, as)).status).toBe(401);
  });
});

describe('items: revisions, kinds, fields', () => {
  it('a new item must start at revision 1', async () => {
    expect((await rest('PUT', `${base}/items/${randomId()}`, item(2), as)).status).toBe(401);
    expect((await rest('PUT', `${base}/items/${randomId()}`, item(1), as)).status).toBe(200);
  });

  it('each upload must raise the revision by exactly one', async () => {
    const path = `${base}/items/${randomId()}`;
    expect((await rest('PUT', path, item(1), as)).status).toBe(200);
    expect((await rest('PUT', path, item(1), as)).status).toBe(401); // stale writer
    expect((await rest('PUT', path, item(3), as)).status).toBe(401); // skipped one
    expect((await rest('PUT', path, item(2), as)).status).toBe(200);
    expect((await rest('PUT', path, item(2), as)).status).toBe(401); // second device, same base
  });

  it('kind never changes and must be one of four', async () => {
    const path = `${base}/items/${randomId()}`;
    expect((await rest('PUT', path, item(1, { kind: 'image' }), as)).status).toBe(401);
    expect((await rest('PUT', path, item(1), as)).status).toBe(200);
    expect((await rest('PUT', path, item(2, { kind: 'folder' }), as)).status).toBe(401);
  });

  it('meta is always required; unknown fields and a client time are refused', async () => {
    const path = `${base}/items/${randomId()}`;
    const { meta: _meta, ...noMeta } = item(1);
    expect((await rest('PUT', path, noMeta, as)).status).toBe(401);
    expect((await rest('PUT', path, item(1, { extra: 1 }), as)).status).toBe(401);
    expect((await rest('PUT', path, item(1, { ts: 1 }), as)).status).toBe(401);
    expect((await rest('PUT', path, item(1, { enc: 2 }), as)).status).toBe(401);
    expect((await rest('PUT', path, item(1, { deleted: false }), as)).status).toBe(401);
  });

  it('a record can be tombstoned but never deleted', async () => {
    const path = `${base}/items/${randomId()}`;
    expect((await rest('PUT', path, item(1), as)).status).toBe(200);
    expect((await rest('DELETE', path, undefined, as)).status).toBe(401);
    const tombstone = { rev: 2, ts: SV, kind: 'note', enc: 1, meta: SEALED, deleted: true };
    expect((await rest('PUT', path, tombstone, as)).status).toBe(200);
    const read = await rest('GET', path, undefined, as);
    expect(read.body).toMatchObject({ rev: 2, deleted: true });
    expect(read.body).not.toHaveProperty('body');
  });

  it('refuses ids shorter than 16 or longer than 40 characters', async () => {
    expect((await rest('PUT', `${base}/items/short`, item(1), as)).status).toBe(401);
    expect((await rest('PUT', `${base}/items/${'a'.repeat(41)}`, item(1), as)).status).toBe(401);
  });

  it('the ts index allows the catch-up query (PLAN 5.8)', async () => {
    const res = await rest('GET', `${base}/items`, undefined, {
      ns,
      query: { orderBy: '"ts"', startAt: '0' },
    });
    expect(res.status).toBe(200);
  });
});

describe('multi-path upload (PLAN 5.8)', () => {
  it('writes an item and head together', async () => {
    const id = randomId();
    const update = { [`items/${id}`]: item(1), head: { ts: SV, id, rev: 1 } };
    expect((await rest('PATCH', base, update, as)).status).toBe(200);
  });

  it('is atomic: a refused item leaves head unchanged', async () => {
    const before = await rest('GET', `${base}/head`, undefined, as);
    const id = randomId();
    const update = { [`items/${id}`]: item(5), head: { ts: SV, id, rev: 5 } };
    expect((await rest('PATCH', base, update, as)).status).toBe(401);
    expect((await rest('GET', `${base}/head`, undefined, as)).body).toEqual(before.body);
    expect((await rest('GET', `${base}/items/${id}`, undefined, as)).body).toBeNull();
  });
});

describe('blobs: created and removed, never overwritten', () => {
  it('follows the life of a file', async () => {
    const path = `${base}/blobs/${randomId()}`;
    expect((await rest('PUT', path, SEALED, as)).status).toBe(200);
    expect((await rest('GET', path, undefined, as)).body).toBe(SEALED);
    expect((await rest('PUT', path, `${SEALED}x`, as)).status).toBe(401);
    expect((await rest('DELETE', path, undefined, as)).status).toBe(200);
    expect((await rest('GET', path, undefined, as)).body).toBeNull();
  });

  it('refuses a blob that is not a string', async () => {
    expect((await rest('PUT', `${base}/blobs/${randomId()}`, { a: 1 }, as)).status).toBe(401);
  });
});

describe('limits and types of every field (Appendix B)', () => {
  it('info: salt at most 64, check at most 512 characters', async () => {
    const vault = `/tamandua/${randomKey()}`;
    const info = { format: 1, salt: 'c2FsdA==', check: SEALED, created: SV };
    expect((await rest('PUT', `${vault}/info`, { ...info, salt: 's'.repeat(65) }, as)).status).toBe(
      401,
    );
    expect(
      (await rest('PUT', `${vault}/info`, { ...info, check: 'c'.repeat(513) }, as)).status,
    ).toBe(401);
    expect(
      (
        await rest(
          'PUT',
          `${vault}/info`,
          { ...info, salt: 's'.repeat(64), check: 'c'.repeat(512) },
          as,
        )
      ).status,
    ).toBe(200);
  });

  it('moved: check at most 512 characters, no other field', async () => {
    const vault = `/tamandua/${randomKey()}`;
    expect(
      (await rest('PUT', `${vault}/moved`, { ts: SV, check: 'c'.repeat(513) }, as)).status,
    ).toBe(401);
    expect((await rest('PUT', `${vault}/moved`, { ts: SV, check: SEALED, x: 1 }, as)).status).toBe(
      401,
    );
    expect((await rest('GET', `/tamandua/${randomKey(31)}/moved`, undefined, as)).status).toBe(401);
  });

  it('head: id a string of at most 40, rev a number', async () => {
    expect(
      (await rest('PUT', `${base}/head`, { ts: SV, id: 'i'.repeat(41), rev: 1 }, as)).status,
    ).toBe(401);
    expect((await rest('PUT', `${base}/head`, { ts: SV, id: 5, rev: 1 }, as)).status).toBe(401);
    expect(
      (await rest('PUT', `${base}/head`, { ts: SV, id: randomId(), rev: '1' }, as)).status,
    ).toBe(401);
  });

  it('items: meta at most 8,192, body at most 7,000,000, size 0 to 7,000,000', async () => {
    const path = (): string => `${base}/items/${randomId()}`;
    expect((await rest('PUT', path(), item(1, { meta: 'm'.repeat(8193) }), as)).status).toBe(401);
    expect((await rest('PUT', path(), item(1, { meta: 'm'.repeat(8192) }), as)).status).toBe(200);
    expect((await rest('PUT', path(), item(1, { size: -1 }), as)).status).toBe(401);
    expect((await rest('PUT', path(), item(1, { size: 7_000_001 }), as)).status).toBe(401);
    expect((await rest('PUT', path(), item(1, { size: 'big' }), as)).status).toBe(401);
    expect((await rest('PUT', path(), item(1, { body: 'b'.repeat(7_000_001) }), as)).status).toBe(
      401,
    );
    expect((await rest('PUT', path(), item(1, { meta: 5 }), as)).status).toBe(401);
  });

  it('items: a 16-character id is the shortest allowed', async () => {
    expect((await rest('PUT', `${base}/items/${'a'.repeat(15)}`, item(1), as)).status).toBe(401);
    expect((await rest('PUT', `${base}/items/${'a'.repeat(16)}`, item(1), as)).status).toBe(200);
  });

  it('blobs: at most 9,500,000 characters, readable only under a long key', async () => {
    expect(
      (await rest('PUT', `${base}/blobs/${randomId()}`, 'b'.repeat(9_500_001), as)).status,
    ).toBe(401);
    const id = randomId();
    expect((await rest('PUT', `${base}/blobs/${id}`, SEALED, as)).status).toBe(200);
    expect(
      (await rest('GET', `/tamandua/${randomKey(31)}/blobs/${id}`, undefined, as)).status,
    ).toBe(401);
    expect(
      (await rest('PUT', `/tamandua/${randomKey(31)}/blobs/${randomId()}`, SEALED, as)).status,
    ).toBe(401);
  });
});
