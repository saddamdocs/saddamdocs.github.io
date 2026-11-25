/**
 * Encryption, format 1 (PLAN 5.6). Every device must produce and read exactly this, so it never
 * changes in place: a new scheme gets `enc: 2` and readers keep format 1.
 *
 * - Key: PBKDF2-HMAC-SHA-256 over the passphrase (Unicode NFC, UTF-8), the vault's 16-byte salt and
 *   600,000 iterations, giving a non-extractable AES-GCM 256-bit key.
 * - Seal: a fresh 12-byte nonce, AES-GCM with an AAD string, stored as standard base64 (with
 *   padding) of nonce ‖ ciphertext ‖ 16-byte tag; 28 bytes longer than the plaintext.
 * - Bodies are compressed with `deflate-raw` before sealing.
 *
 * Talks to: Web Crypto and the Compression Streams API, both in browsers and in Node.js.
 */

/** PBKDF2 iterations (PLAN 5.6). Never change: old vaults would stop opening. */
export const PBKDF2_ITERATIONS = 600_000;
/** Salt length in bytes (PLAN 5.6). */
export const SALT_BYTES = 16;
/** Nonce length in bytes (PLAN 5.6). */
export const NONCE_BYTES = 12;
/** Bytes a seal adds to its plaintext: the nonce and the GCM tag. */
export const SEAL_OVERHEAD = NONCE_BYTES + 16;

/** The plaintext of `info.check` (PLAN 5.6). */
export const CHECK_PLAINTEXT = 'tamandua check v1';
/** The plaintext of `moved.check` (PLAN 5.6). */
export const MOVED_PLAINTEXT = 'tamandua moved v1';

/** The AAD strings of PLAN 5.6. The id and revision bind a record to its place. */
export const AAD = {
  meta: (id: string, rev: number): string => `tamandua:1:meta:${id}:${String(rev)}`,
  body: (id: string, rev: number): string => `tamandua:1:body:${id}:${String(rev)}`,
  blob: (id: string): string => `tamandua:1:blob:${id}`,
  check: 'tamandua:1:check',
  moved: 'tamandua:1:moved',
} as const;

/** A seal that would not open: wrong key, wrong AAD, or damaged data (PLAN 5.6, I7). */
export class OpenError extends Error {
  /** @param reason - Why, for the log (never the data). */
  constructor(reason: string) {
    super(`Could not open: ${reason}`);
    this.name = 'OpenError';
  }
}

const encoder = new TextEncoder();

/**
 * Encodes bytes as standard base64 with padding.
 *
 * @param bytes - Any bytes.
 * @returns The base64 text.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Decodes standard base64.
 *
 * @param text - Base64 text.
 * @returns The bytes.
 * @throws OpenError when the text is not base64.
 */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    throw new OpenError('not base64');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Makes a random salt for a new vault.
 *
 * @returns 16 random bytes.
 */
export function newSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

/**
 * Derives the vault key from a passphrase (PLAN 5.6).
 *
 * @param passphrase - As typed; normalised to NFC here.
 * @param salt - The vault's salt (`info.salt`, decoded).
 * @param extractable - Only for generating test vectors; the app always uses false.
 * @returns An AES-GCM key for encrypt and decrypt.
 */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  extractable = false,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Seals bytes (PLAN 5.6).
 *
 * @param key - The vault key.
 * @param plaintext - The bytes to seal.
 * @param aad - The AAD string for this field.
 * @param nonce - Only for test vectors; a fresh random nonce otherwise. Never reuse one.
 * @returns base64 of nonce ‖ ciphertext ‖ tag.
 */
export async function seal(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  aad: string,
  nonce: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(NONCE_BYTES)),
): Promise<string> {
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(aad) },
      key,
      plaintext,
    ),
  );
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce, 0);
  out.set(sealed, NONCE_BYTES);
  return toBase64(out);
}

/**
 * Opens a seal (PLAN 5.6). A seal opens only with the same key and the same AAD.
 *
 * @param key - The vault key.
 * @param sealed - base64 of nonce ‖ ciphertext ‖ tag.
 * @param aad - The AAD string the seal must carry.
 * @returns The plaintext.
 * @throws OpenError when the seal does not open.
 */
export async function open(
  key: CryptoKey,
  sealed: string,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = fromBase64(sealed);
  if (bytes.length < SEAL_OVERHEAD) throw new OpenError('too short');
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: bytes.subarray(0, NONCE_BYTES),
          additionalData: encoder.encode(aad),
        },
        key,
        bytes.subarray(NONCE_BYTES),
      ),
    );
  } catch {
    throw new OpenError('authentication failed');
  }
}

/** Runs bytes through a compression or decompression stream. */
async function transform(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/**
 * Compresses with `deflate-raw` (PLAN 5.6: bodies are compressed before sealing).
 *
 * @param bytes - The bytes.
 * @returns The compressed bytes.
 */
export function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return transform(bytes, new CompressionStream('deflate-raw'));
}

/**
 * Decompresses `deflate-raw`.
 *
 * @param bytes - The compressed bytes.
 * @returns The original bytes.
 * @throws OpenError when the data is not valid deflate.
 */
export async function inflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await transform(bytes, new DecompressionStream('deflate-raw'));
  } catch {
    throw new OpenError('not deflate data');
  }
}

/**
 * Makes `info.check` (PLAN 5.6): proves a passphrase without revealing anything.
 *
 * @param key - The vault key.
 * @returns The sealed check.
 */
export function makeCheck(key: CryptoKey): Promise<string> {
  return seal(key, encoder.encode(CHECK_PLAINTEXT), AAD.check);
}

/**
 * Checks a passphrase's key against `info.check` (PLAN 5.6, "Checking a passphrase").
 *
 * @param key - A key derived from the passphrase to check.
 * @param check - `info.check`.
 * @returns True when the passphrase is right.
 */
export async function verifyCheck(key: CryptoKey, check: string): Promise<boolean> {
  try {
    return new TextDecoder().decode(await open(key, check, AAD.check)) === CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}
