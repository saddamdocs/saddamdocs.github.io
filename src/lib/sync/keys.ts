/**
 * The sync key and the passphrase (PLAN 4.5): making a key, showing it, reading it back as typed,
 * creating a vault's `info`, and checking a passphrase against it.
 *
 * The passphrase is never stored: it derives the key once, and the derived key is kept
 * non-extractable (PLAN 5.4). Nothing here logs a key or a passphrase.
 *
 * Talks to: `sync/crypto.ts`, `sync/rest.ts`, `config.ts`.
 */

import { SYNC_KEY_LENGTH } from '../config.ts';
import { deriveKey, fromBase64, makeCheck, newSalt, toBase64, verifyCheck } from './crypto.ts';
import { SV } from './format.ts';
import type { Rest } from './rest.ts';

/** The characters of a sync key (PLAN 4.5): A–Z, a–z, 0–9. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Shortest passphrase accepted (PLAN 4.5). */
export const MIN_PASSPHRASE = 12;

/**
 * Makes a new sync key: 32 random letters and digits, drawn without modulo bias.
 *
 * @returns The key.
 */
export function newSyncKey(): string {
  let key = '';
  while (key.length < SYNC_KEY_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(64))) {
      // 248 = 4 × 62: bytes at or above it would favour the first characters.
      if (byte < 248 && key.length < SYNC_KEY_LENGTH) key += ALPHABET[byte % 62];
    }
  }
  return key;
}

/**
 * Reads a key as typed or pasted: spaces and dashes are ignored (PLAN 4.5).
 *
 * @param input - What the user typed.
 * @returns The key, or null when it is not 32 letters and digits.
 */
export function readSyncKey(input: string): string | null {
  const key = input.replace(/[\s-]/g, '');
  return new RegExp(`^[A-Za-z0-9]{${String(SYNC_KEY_LENGTH)}}$`).test(key) ? key : null;
}

/**
 * Shows a key in groups of four for reading (PLAN 4.5).
 *
 * @param key - The key.
 * @returns For example `AbCd EfGh …`.
 */
export function formatSyncKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, '$1 ');
}

/** A vault opened with its passphrase. */
export interface Unlocked {
  /** The derived key, non-extractable. */
  readonly key: CryptoKey;
  /** The vault's salt, base64, as in `info.salt`. */
  readonly salt: string;
}

/**
 * Creates a vault under a new key: writes `info` with a new salt and the passphrase check
 * (PLAN 4.5, "Start a new synced vault"). The rules refuse the write if `info` already exists.
 *
 * @param rest - The REST client of the new key.
 * @param passphrase - At least 12 characters.
 * @returns The derived key and the salt.
 * @throws RangeError for a passphrase too short; RestFailure when the write fails.
 */
export async function createVault(rest: Rest, passphrase: string): Promise<Unlocked> {
  if ([...passphrase].length < MIN_PASSPHRASE) throw new RangeError('passphrase too short');
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt);
  await rest.putInfo({ format: 1, salt: toBase64(salt), check: await makeCheck(key), created: SV });
  return { key, salt: toBase64(salt) };
}

/** Why opening a vault failed. */
export type UnlockProblem = 'no-vault' | 'newer-format' | 'wrong-passphrase' | 'damaged';

/**
 * Opens an existing vault (PLAN 4.5, "Connect to my vault"; PLAN 6.3, "Reconcile" step 1): reads
 * `info`, checks the format, and checks the passphrase against `info.check` before anything else.
 *
 * @param rest - The REST client of the key.
 * @param passphrase - As typed.
 * @returns The derived key and salt, or why it failed.
 * @throws RestFailure when `info` cannot be read.
 */
export async function unlockVault(
  rest: Rest,
  passphrase: string,
): Promise<Unlocked | { problem: UnlockProblem }> {
  const info = await rest.getInfo();
  if (info === null) return { problem: 'no-vault' };
  if (typeof info.format === 'number' && info.format !== 1) return { problem: 'newer-format' };
  if (typeof info.salt !== 'string' || typeof info.check !== 'string')
    return { problem: 'damaged' };
  const salt = fromBase64(info.salt);
  const key = await deriveKey(passphrase, salt);
  if (!(await verifyCheck(key, info.check))) return { problem: 'wrong-passphrase' };
  return { key, salt: info.salt };
}
