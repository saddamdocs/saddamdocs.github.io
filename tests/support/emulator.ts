/**
 * Helpers for tests that talk to the Realtime Database emulator (PLAN 8, "The emulator").
 *
 * Every test file gets a namespace of its own (`?ns=`), and loads the rules into it with the
 * emulator's owner token, so files can run in parallel and never see each other's data. Requests
 * go only to the emulator's address; this module refuses any other host (PLAN 10, "Safety for the
 * databases").
 *
 * Talks to: the emulator started by `firebase emulators:exec`, over HTTP.
 */

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/** Host and port of the emulator, as `firebase emulators:exec` exports them. */
const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? '127.0.0.1:9000';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(HOST)) {
  throw new Error(`Refusing to run against a non-local database host: ${HOST}`);
}

/** Base URL of the emulator. */
export const EMULATOR_URL = `http://${HOST}`;

/** The value Firebase replaces with the server's time (PLAN 5.8, `SV`). */
export const SV = { '.sv': 'timestamp' } as const;

/** The rules of Appendix B, as committed. */
export const RULES = readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8');

/** Rules that refuse everything, like a database created in locked mode (PLAN 1.5). */
export const LOCKED_RULES = JSON.stringify({ rules: { '.read': false, '.write': false } });

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Makes a random string of letters and digits, the shape of a sync key (PLAN 4.5).
 *
 * @param length - Number of characters; 32 for a valid key.
 * @returns The string.
 */
export function randomKey(length = 32): string {
  return Array.from(randomBytes(length), (b) => ALPHANUMERIC[b % ALPHANUMERIC.length]).join('');
}

/**
 * Makes an item id of the plan's shape (PLAN 5.5): 20 characters of lowercase base 36.
 *
 * @returns The id.
 */
export function randomId(): string {
  const time = Date.now().toString(36).padStart(9, '0').slice(-9);
  const rest = Array.from(randomBytes(11), (b) => (b % 36).toString(36)).join('');
  return time + rest;
}

/**
 * Makes a namespace name for one test file.
 *
 * @param label - Short lowercase label, for reading the emulator's logs.
 * @returns A namespace name that no other file uses.
 */
export function namespace(label: string): string {
  return `${label}-${randomBytes(4).toString('hex')}`;
}

/** The answer of a REST request. */
export interface RestResponse {
  readonly status: number;
  /** Parsed JSON body, or null for an empty body. */
  readonly body: unknown;
}

/** Options for `rest()`. */
export interface RestOptions {
  /** The namespace to address. */
  readonly ns: string;
  /** Send the emulator's owner token, which bypasses the rules (for setup and damage tests). */
  readonly owner?: boolean;
  /** Extra query parameters, unencoded. */
  readonly query?: Readonly<Record<string, string>>;
}

/**
 * Sends one REST request to the emulator.
 *
 * @param method - HTTP method.
 * @param path - Database path without `.json`, starting with `/`.
 * @param body - JSON body, or undefined for none.
 * @param options - Namespace, owner token and query.
 * @returns The status and the parsed body.
 */
export async function rest(
  method: 'GET' | 'PUT' | 'PATCH' | 'POST' | 'DELETE',
  path: string,
  body: unknown,
  options: RestOptions,
): Promise<RestResponse> {
  const params = new URLSearchParams({ ns: options.ns, ...options.query });
  const response = await fetch(`${EMULATOR_URL}${path}.json?${params.toString()}`, {
    method,
    headers: options.owner === true ? { Authorization: 'Bearer owner' } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
}

/**
 * Loads rules into a namespace.
 *
 * @param ns - The namespace.
 * @param rules - The rules as JSON text; the rules of Appendix B by default.
 * @returns Resolves when the emulator accepted them.
 * @throws When the emulator refuses the rules (a syntax or expression error).
 */
export async function loadRules(ns: string, rules: string = RULES): Promise<void> {
  const response = await fetch(`${EMULATOR_URL}/.settings/rules.json?ns=${ns}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: rules,
  });
  if (!response.ok) {
    throw new Error(
      `Emulator refused the rules: ${String(response.status)} ${await response.text()}`,
    );
  }
}
