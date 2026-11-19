/**
 * Every request to the database goes through this module (PLAN 5.2, 5.8); nothing else calls
 * `fetch` on a database address.
 *
 * M0 holds only the read-only probe of spike D. M3a replaces it with the full request layer:
 * retries, timeouts, concurrency and response handling.
 *
 * Talks to: the channel's database, through `fetch`. Reads `channel.ts` for the address.
 */

import { channel } from '../channel.ts';
import { SMALL_REQUEST_TIMEOUT_MS, SYNC_KEY_LENGTH } from '../config.ts';

/** The outcome of the spike D probe. */
export type ProbeResult =
  | { readonly kind: 'status'; readonly status: number }
  | { readonly kind: 'network'; readonly message: string };

/**
 * Generates a random key of the sync key's shape (letters and digits), for the probe only.
 * It names a vault that does not exist, so the request can read nothing.
 *
 * @returns A string of `SYNC_KEY_LENGTH` characters.
 */
function randomProbeKey(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(SYNC_KEY_LENGTH));
  // The modulo bias is irrelevant for a throw-away key that only has to look like one.
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/**
 * Spike D (PLAN 7, M0): sends one `GET` for `/tamandua/<random key>/head.json` to this channel's
 * database. While the database is locked, a 401 proves that Brave's Shields and the content
 * security policy let the request through. It never writes anything.
 *
 * @returns The HTTP status, or the error message when the request did not complete (blocked by
 *   the browser, offline, or timed out).
 */
export async function probeLockedDatabase(): Promise<ProbeResult> {
  const ns = channel.emulatorNamespace === null ? '' : `?ns=${channel.emulatorNamespace}`;
  const url = `${channel.databaseUrl}/tamandua/${randomProbeKey()}/head.json${ns}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(SMALL_REQUEST_TIMEOUT_MS),
    });
    return { kind: 'status', status: response.status };
  } catch (error) {
    return { kind: 'network', message: error instanceof Error ? error.message : String(error) };
  }
}
