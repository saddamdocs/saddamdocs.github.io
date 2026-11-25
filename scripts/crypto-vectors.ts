/**
 * Generates the format-1 test vectors (PLAN 5.6, "Test vectors") into
 * `tests/unit/crypto-vectors.json`, with a fixed passphrase, salt, nonce and plaintexts. Run once;
 * the committed file then guards every later version against breaking old data unnoticed.
 *
 * The vectors pin the derived key, and the seal of fixed bytes for every AAD of PLAN 5.6. Bodies
 * are compressed before sealing, and compressors may differ in their output, so the body vector
 * pins the seal of one compressed form and checks that it opens and inflates back to the text.
 *
 * Usage: `node scripts/crypto-vectors.ts`. Never rerun to make a failing test pass.
 *
 * Talks to: `src/lib/sync/crypto.ts` and the file system.
 */

import { writeFileSync } from 'node:fs';
import {
  AAD,
  CHECK_PLAINTEXT,
  MOVED_PLAINTEXT,
  deflateRaw,
  deriveKey,
  seal,
  toBase64,
} from '../src/lib/sync/crypto.ts';

const passphrase = 'tamanduá-bandeira come formigas à noite';
const salt = new Uint8Array(Array.from({ length: 16 }, (_, i) => i));
const nonce = new Uint8Array(Array.from({ length: 12 }, (_, i) => 0xa0 + i));
const id = 'mi0abcde00000000test';
const rev = 7;
const encoder = new TextEncoder();

const key = await deriveKey(passphrase, salt, true);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
const meta = JSON.stringify({
  name: 'Ação',
  parent: '',
  created: 1,
  updated: 2,
  device: 'Linux · Brave',
});
const text = '# Olá\n\nTexto com acentos: ação, coração.\n';
const compressed = await deflateRaw(encoder.encode(text));
const blobBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 255]);

const vectors = {
  passphrase,
  salt: toBase64(salt),
  iterations: 600_000,
  key: toBase64(raw),
  nonce: toBase64(nonce),
  id,
  rev,
  cases: [
    {
      field: 'meta',
      aad: AAD.meta(id, rev),
      plaintext: toBase64(encoder.encode(meta)),
      sealed: await seal(key, encoder.encode(meta), AAD.meta(id, rev), nonce),
    },
    {
      field: 'body',
      aad: AAD.body(id, rev),
      plaintext: toBase64(compressed),
      text,
      sealed: await seal(key, compressed, AAD.body(id, rev), nonce),
    },
    {
      field: 'blob',
      aad: AAD.blob(id),
      plaintext: toBase64(blobBytes),
      sealed: await seal(key, blobBytes, AAD.blob(id), nonce),
    },
    {
      field: 'check',
      aad: AAD.check,
      plaintext: toBase64(encoder.encode(CHECK_PLAINTEXT)),
      sealed: await seal(key, encoder.encode(CHECK_PLAINTEXT), AAD.check, nonce),
    },
    {
      field: 'tombstone',
      aad: AAD.meta(id, rev),
      plaintext: toBase64(encoder.encode('{"gone":true}')),
      sealed: await seal(key, encoder.encode('{"gone":true}'), AAD.meta(id, rev), nonce),
    },
    {
      field: 'moved',
      aad: AAD.moved,
      plaintext: toBase64(encoder.encode(MOVED_PLAINTEXT)),
      sealed: await seal(key, encoder.encode(MOVED_PLAINTEXT), AAD.moved, nonce),
    },
  ],
};
writeFileSync(
  new URL('../tests/unit/crypto-vectors.json', import.meta.url),
  `${JSON.stringify(vectors, null, 2)}\n`,
);
console.log('wrote tests/unit/crypto-vectors.json');
