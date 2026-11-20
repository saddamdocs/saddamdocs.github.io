/**
 * Item ids (PLAN 5.5): 20 characters of lowercase base 36, 9 for the creation time in ms and 11
 * random. Ids are permanent; names and paths are computed from them, never the other way round.
 *
 * Talks to: `crypto.getRandomValues`.
 */

/** Length of every item id. */
export const ID_LENGTH = 20;

/**
 * Makes a new item id.
 *
 * @param now - Creation time in ms; the current time by default.
 * @returns A 20-character id. Ids made later sort later when created in different milliseconds.
 */
export function newId(now: number = Date.now()): string {
  const time = Math.max(0, Math.floor(now)).toString(36).padStart(9, '0').slice(-9);
  const bytes = crypto.getRandomValues(new Uint8Array(11));
  // 256 is not a multiple of 36, so the digits are very slightly uneven; uniqueness is what
  // matters here, and 11 digits give about 2^56 values per millisecond.
  const random = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  return time + random;
}

/**
 * Checks the shape of an id.
 *
 * @param id - Any string.
 * @returns True for 20 characters of `0-9a-z`.
 */
export function isId(id: string): boolean {
  return /^[0-9a-z]{20}$/.test(id);
}
