/**
 * Unit tests for encryption format 1 (`src/lib/sync/crypto.ts`, PLAN 5.6) against the committed
 * test vectors, so a later change cannot break old data unnoticed. The vectors' key was also checked
 * against Python's hashlib (DECISIONS, M3a).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  AAD,
  OpenError,
  deriveKey,
  fromBase64,
  inflateRaw,
  makeCheck,
  newSalt,
  open,
  seal,
  toBase64,
  verifyCheck,
} from '../../src/lib/sync/crypto.ts';
import vectors from './crypto-vectors.json';

let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey(vectors.passphrase, fromBase64(vectors.salt));
});

describe('format 1 vectors (PLAN 5.6)', () => {
  it('derives the same key from the passphrase and salt', async () => {
    const extractable = await deriveKey(vectors.passphrase, fromBase64(vectors.salt), true);
    expect(toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', extractable)))).toBe(
      vectors.key,
    );
  });

  it('normalises the passphrase to NFC', async () => {
    const decomposed = vectors.passphrase.normalize('NFD');
    expect(decomposed).not.toBe(vectors.passphrase);
    const k = await deriveKey(decomposed, fromBase64(vectors.salt), true);
    expect(toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', k)))).toBe(vectors.key);
  });

  it.each(vectors.cases.map((c) => [c.field, c] as const))(
    '%s: seals to the vector and opens back',
    async (_f, c) => {
      expect(await seal(key, fromBase64(c.plaintext), c.aad, fromBase64(vectors.nonce))).toBe(
        c.sealed,
      );
      expect(toBase64(await open(key, c.sealed, c.aad))).toBe(c.plaintext);
    },
  );

  it('a body opens and inflates to its text', async () => {
    const body = vectors.cases.find((c) => c.field === 'body')!;
    const text = new TextDecoder().decode(await inflateRaw(await open(key, body.sealed, body.aad)));
    expect(text).toBe(body.text);
  });

  it('the AAD strings are exactly those of the plan', () => {
    expect(AAD.meta('abc', 3)).toBe('tamandua:1:meta:abc:3');
    expect(AAD.body('abc', 3)).toBe('tamandua:1:body:abc:3');
    expect(AAD.blob('abc')).toBe('tamandua:1:blob:abc');
    expect(AAD.check).toBe('tamandua:1:check');
    expect(AAD.moved).toBe('tamandua:1:moved');
  });
});

describe('what may not open (PLAN 5.6, I7)', () => {
  const meta = vectors.cases.find((c) => c.field === 'meta')!;

  it('another revision, another item or another field does not open', async () => {
    await expect(
      open(key, meta.sealed, AAD.meta(vectors.id, vectors.rev + 1)),
    ).rejects.toBeInstanceOf(OpenError);
    await expect(
      open(key, meta.sealed, AAD.meta('otheritem00000000000', vectors.rev)),
    ).rejects.toBeInstanceOf(OpenError);
    await expect(open(key, meta.sealed, AAD.body(vectors.id, vectors.rev))).rejects.toBeInstanceOf(
      OpenError,
    );
  });

  it('another key does not open, and garbage does not open', async () => {
    const other = await deriveKey('a different passphrase entirely', fromBase64(vectors.salt));
    await expect(open(other, meta.sealed, meta.aad)).rejects.toBeInstanceOf(OpenError);
    await expect(open(key, 'not base64 at all!', meta.aad)).rejects.toBeInstanceOf(OpenError);
    await expect(open(key, toBase64(new Uint8Array(40)), meta.aad)).rejects.toBeInstanceOf(
      OpenError,
    );
    await expect(open(key, toBase64(new Uint8Array(10)), meta.aad)).rejects.toBeInstanceOf(
      OpenError,
    );
  });

  it('a flipped bit is caught', async () => {
    const bytes = fromBase64(meta.sealed);
    bytes[20] = (bytes[20] ?? 0) ^ 1;
    await expect(open(key, toBase64(bytes), meta.aad)).rejects.toBeInstanceOf(OpenError);
  });
});

describe('passphrase check and fresh seals', () => {
  it('the check verifies the right passphrase only', async () => {
    const check = await makeCheck(key);
    expect(await verifyCheck(key, check)).toBe(true);
    expect(await verifyCheck(await deriveKey('wrong', fromBase64(vectors.salt)), check)).toBe(
      false,
    );
  });

  it('every seal uses a fresh nonce', async () => {
    const a = await seal(key, new Uint8Array([1]), AAD.check);
    const b = await seal(key, new Uint8Array([1]), AAD.check);
    expect(a).not.toBe(b);
    expect(newSalt()).toHaveLength(16);
  });
});
