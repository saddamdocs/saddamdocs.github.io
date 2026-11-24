/**
 * Zipping and unzipping with fflate's synchronous functions (PLAN 3, "Zip"). These run inside
 * `transfer/zip.worker.ts` in the app, and directly in unit tests.
 *
 * fflate's asynchronous functions start their own workers from `blob:` URLs, which the content
 * security policy forbids (`worker-src 'self'`, PLAN 5.9), so the app runs the synchronous ones in
 * a worker of its own instead.
 *
 * Talks to: fflate only.
 */

import { unzipSync, zipSync, type Zippable } from 'fflate';

/** Archive contents: paths to bytes. A path ending in `/` is a folder entry with no bytes. */
export type ZipEntries = Record<string, Uint8Array<ArrayBuffer>>;

/**
 * Builds a ZIP archive. File names are written as UTF-8 with the UTF-8 flag set, so accented names
 * unpack correctly on Windows (checked in M2, DECISIONS).
 *
 * @param entries - Paths to bytes; folder entries end in `/` and have no bytes.
 * @param mtime - Time stamp for every entry.
 * @returns The archive.
 */
export function zipEntries(entries: ZipEntries, mtime: Date = new Date()): Uint8Array<ArrayBuffer> {
  const zippable: Zippable = {};
  for (const [path, bytes] of Object.entries(entries)) {
    // Images are compressed already; deflating them again costs time for nothing.
    const stored = /\.(png|jpe?g|gif|webp)$/i.test(path);
    zippable[path] = [bytes, { level: stored ? 0 : 6, mtime }];
  }
  return zipSync(zippable);
}

/**
 * Reads a ZIP archive.
 *
 * @param archive - The archive's bytes.
 * @returns Paths to bytes, folder entries included.
 * @throws When the archive is damaged or uses a compression other than deflate.
 */
export function unzipEntries(archive: Uint8Array): ZipEntries {
  return unzipSync(archive);
}
