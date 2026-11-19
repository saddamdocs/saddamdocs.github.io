/**
 * The size budgets of PLAN 8 that a build can check by itself:
 * - JavaScript needed for the first screen, gzipped: 300 KB or less;
 * - everything precached: 5 MB or less.
 *
 * "First screen" means the scripts `dist/index.html` loads directly (module scripts and
 * modulepreload links). Chunks loaded on demand are not counted. "Precached" means every file the
 * service worker lists in its precache manifest. Run after a build: `npm run check:size`.
 *
 * Talks to: the file system only.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** PLAN 8: JavaScript for the first screen, gzipped, in bytes. */
const FIRST_SCREEN_BUDGET = 300 * 1024;
/** PLAN 8: everything precached, in bytes. */
const PRECACHE_BUDGET = 5 * 1024 * 1024;

/**
 * Measures the build and compares it with the budgets.
 *
 * @param dir - The build directory.
 * @returns True when both budgets hold.
 */
function check(dir: string): boolean {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  const scripts = [
    ...html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g),
    ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g),
  ].map((m) => m[1] ?? '');
  const firstScreen = scripts.reduce(
    (sum, file) => sum + gzipSync(readFileSync(join(dir, file))).length,
    0,
  );

  // The generated service worker lists its precache entries as {url:"...",revision:...}.
  const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
  const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1] ?? '');
  const precache = urls.reduce((sum, url) => sum + statSync(join(dir, url)).size, 0);

  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
  console.log(`First-screen JS (gzip): ${kb(firstScreen)} of ${kb(FIRST_SCREEN_BUDGET)}`);
  console.log(`Precache (${String(urls.length)} files): ${kb(precache)} of ${kb(PRECACHE_BUDGET)}`);
  const ok = firstScreen <= FIRST_SCREEN_BUDGET && precache <= PRECACHE_BUDGET;
  console.log(ok ? 'check-size: within budget' : 'check-size: OVER BUDGET');
  return ok;
}

process.exitCode = check(process.argv[2] ?? 'dist') ? 0 : 1;
