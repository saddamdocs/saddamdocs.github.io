/**
 * PLAN 5.9 rule 4: fails when the built app references any origin other than its own and its
 * channel's database. Run after a build: `npm run check:origins -- next` (or `stable`).
 *
 * It scans every text file in `dist/` for `http://`, `https://`, `ws://` and `wss://` URLs. A small
 * allowlist covers strings that are never fetched: XML namespaces and the documentation links
 * inside library error messages. Each entry says why it is safe. Anything else fails the build.
 *
 * Talks to: the file system, and `src/lib/channel.ts` for the channel's database address.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { channelDefinition, isChannelName } from '../src/lib/channel.ts';

/** URL prefixes that appear in the build but are never requested, with the reason. */
const ALLOWED: readonly { readonly prefix: string; readonly why: string }[] = [
  { prefix: 'http://www.w3.org/', why: 'XML namespace identifiers (SVG, XHTML); never fetched' },
  { prefix: 'https://svelte.dev/e/', why: 'documentation links inside Svelte error messages' },
  {
    prefix: 'https://bit.ly/wb-precache',
    why: 'documentation link inside a Workbox error message',
  },
  {
    prefix: 'https://*.firebasedatabase.app',
    why: 'the connect-src wildcard of the content security policy (PLAN 5.9 rule 1)',
  },
];

/** File types that can carry a URL the browser might use. Images are binary and skipped. */
const TEXT_TYPES = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg']);

/** Lists every file under a directory, recursively. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/**
 * Scans the build and reports every disallowed URL.
 *
 * @param channelArg - `next` or `stable`, the channel the build in `dist/` was made for.
 * @param dir - The build directory.
 * @returns The number of problems found; 0 means the build passes.
 */
function check(channelArg: string | undefined, dir: string): number {
  if (!isChannelName(channelArg)) {
    console.error('Usage: npm run check:origins -- <next|stable> [dir]');
    return 1;
  }
  const database = channelDefinition(channelArg).databaseUrl;
  const urlPattern = /\b(?:https?|wss?):\/\/[^\s"'`)<>\\]+/g;
  let problems = 0;
  let seen = 0;
  for (const file of walk(dir)) {
    if (!TEXT_TYPES.has(extname(file))) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(urlPattern)) {
      seen += 1;
      const url = match[0];
      if (url.startsWith(database)) continue;
      if (ALLOWED.some((entry) => url.startsWith(entry.prefix))) continue;
      problems += 1;
      console.error(`${relative(process.cwd(), file)}: disallowed remote reference ${url}`);
    }
  }
  console.log(
    problems === 0
      ? `check-origins: ${channelArg} build OK (${String(seen)} URLs, all own database or allowlisted)`
      : `check-origins: ${String(problems)} disallowed reference(s)`,
  );
  return problems;
}

process.exitCode = check(process.argv[2], process.argv[3] ?? 'dist') === 0 ? 0 : 1;
