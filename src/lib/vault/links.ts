/**
 * Image links in notes (PLAN 4.3, "Image links"): finding `![alt](path)` in a note, looking the
 * path up from the note's folder (or, failing that, the one file of that name in the vault), and
 * rewriting a moved note's links so they point at the same files.
 *
 * Only relative paths are links to the vault. A path with a scheme (`https:`, `data:`), an absolute
 * path or a fragment is left alone; the app never loads images from the internet (PLAN 2).
 *
 * Talks to: `vault/tree.ts` and `vault/names.ts`. Pure functions.
 */

import type { ItemRecord } from '../store/schema.ts';
import { nameKey } from './names.ts';
import type { VaultIndex } from './tree.ts';

/** One image link found in a text. */
export interface ImageLink {
  /** Offset of the path's first character in the text. */
  readonly from: number;
  /** Offset just after the path. */
  readonly to: number;
  /** The path as written, without angle brackets. */
  readonly path: string;
}

/** `![alt](path)` or `![alt](<path with spaces>)`, with an optional title after the path. */
const IMAGE = /!\[(?:[^\]\\]|\\.)*\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;

/**
 * Finds the image links of a note, skipping fenced code blocks and inline code, where `![]()` is
 * not a link.
 *
 * @param text - The note's text.
 * @returns The links in order.
 */
export function findImageLinks(text: string): ImageLink[] {
  const masked = maskCode(text);
  const links: ImageLink[] = [];
  for (const match of masked.matchAll(IMAGE)) {
    const raw = match[1] ?? '';
    const start = (match.index ?? 0) + match[0].indexOf(raw, match[0].indexOf(']('));
    const angled = raw.startsWith('<');
    const from = angled ? start + 1 : start;
    const to = angled ? start + raw.length - 1 : start + raw.length;
    links.push({ from, to, path: text.slice(from, to) });
  }
  return links;
}

/** Replaces code spans and fenced blocks with spaces of the same length, so offsets keep. */
function maskCode(text: string): string {
  const blank = (s: string): string => s.replace(/[^\n]/g, ' ');
  return text
    .replace(/^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\2[`~]*[ \t]*(?=\n|$)|$)/gm, blank)
    .replace(/(`+)[^`\n]*?\1/g, blank);
}

/**
 * Tells whether a path points into the vault: relative, with no scheme and no leading slash.
 *
 * @param path - A link path.
 * @returns True for a vault path.
 */
export function isVaultPath(path: string): boolean {
  return (
    path !== '' &&
    !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
    !path.startsWith('/') &&
    !path.startsWith('#')
  );
}

/** Splits a link path into names, decoding `%20` and the like. */
function segments(path: string): string[] {
  return path
    .split('/')
    .filter((s) => s !== '')
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        // A stray "%" is a literal character in a file name.
        return s;
      }
    });
}

/**
 * Looks an image up as PLAN 4.3 says: from the note's folder first; otherwise the one live file in
 * the vault with that name, when exactly one exists.
 *
 * @param index - The vault.
 * @param folder - The note's folder id, or `""` for the root.
 * @param path - The link path as written.
 * @returns The file, or null when the image is missing.
 */
export function resolveImage(index: VaultIndex, folder: string, path: string): ItemRecord | null {
  if (!isVaultPath(path)) return null;
  const parts = segments(path);
  const direct = walk(index, folder, parts);
  if (direct !== null) return direct;
  const last = parts[parts.length - 1];
  if (last === undefined) return null;
  const key = nameKey(last);
  const candidates = [...index.byId.values()].filter(
    (i) => i.kind === 'file' && index.isLive(i.id) && nameKey(i.name) === key,
  );
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

/** Follows path segments from a folder, `.` and `..` included. */
function walk(index: VaultIndex, folder: string, parts: readonly string[]): ItemRecord | null {
  let current = folder;
  let found: ItemRecord | null = null;
  for (const [i, part] of parts.entries()) {
    if (part === '.') continue;
    if (part === '..') {
      if (current === '') return null;
      const here = index.get(current);
      current = here === undefined ? '' : index.parentOf(here);
      continue;
    }
    const key = nameKey(part);
    const last = i === parts.length - 1;
    const child = index
      .liveChildren(current)
      .find((c) => nameKey(c.name) === key && (last ? c.kind === 'file' : c.kind === 'folder'));
    if (child === undefined) return null;
    found = child;
    current = child.id;
  }
  return found !== null && found.kind === 'file' ? found : null;
}

/** Encodes a name for a link path: the characters that would end or break the link. */
function encodeSegment(name: string): string {
  return name.replace(/%/g, '%25').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * The relative path from a folder to a file, as a link writes it: `../attachments/map.png`.
 *
 * @param index - The vault.
 * @param folder - The folder the link is written in.
 * @param file - The file.
 * @returns The path, with spaces and parentheses encoded.
 */
export function relativePath(index: VaultIndex, folder: string, file: ItemRecord): string {
  const chain = (id: string): string[] =>
    id === ''
      ? []
      : [
          ...index
            .ancestors(id)
            .map((a) => a.id)
            .reverse(),
          id,
        ];
  const from = chain(folder);
  const to = chain(index.parentOf(file));
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common += 1;
  const up = from.slice(common).map(() => '..');
  const down = to.slice(common).map((id) => encodeSegment(index.get(id)?.name ?? ''));
  return [...up, ...down, encodeSegment(file.name)].join('/');
}

/**
 * Looks an image up from a folder by its path alone, without the same-name fallback.
 *
 * @param index - The vault.
 * @param folder - The folder the link is written in.
 * @param path - The link path as written.
 * @returns The file the path names, or null.
 */
export function resolveDirect(index: VaultIndex, folder: string, path: string): ItemRecord | null {
  return isVaultPath(path) ? walk(index, folder, segments(path)) : null;
}

/**
 * Rewrites a note's image links for a move from one folder to another (PLAN 4.3), so each link
 * still points at the same file. A link is rewritten when its path names a file from the old
 * folder and does not name that same file from the new one. Links that only resolved through the
 * same-name fallback keep working the same way after the move, and links to missing images stay
 * as written.
 *
 * @param index - The vault before the move.
 * @param text - The note's text.
 * @param oldFolder - The folder the note leaves.
 * @param newFolder - The folder it goes to.
 * @param shortest - Also rewrite links that still work, to their shortest path. Undo uses it, so
 *   a move and its Undo give back the text as it was.
 * @returns The new text; the same string when nothing changed.
 */
export function rewriteLinksForMove(
  index: VaultIndex,
  text: string,
  oldFolder: string,
  newFolder: string,
  shortest = false,
): string {
  let result = '';
  let last = 0;
  for (const link of findImageLinks(text)) {
    const file = resolveDirect(index, oldFolder, link.path);
    if (file === null) continue;
    const path = relativePath(index, newFolder, file);
    const stillWorks = resolveDirect(index, newFolder, link.path)?.id === file.id;
    if ((stillWorks && !shortest) || path === link.path) continue;
    result += text.slice(last, link.from) + path;
    last = link.to;
  }
  return last === 0 ? text : result + text.slice(last);
}

/**
 * Renames the file name at the end of matching image links (used by import, PLAN 4.15, when an
 * imported image had to be renamed).
 *
 * @param text - A note's text.
 * @param renames - Old file name to new file name.
 * @returns The new text.
 */
export function renameLinkTargets(text: string, renames: ReadonlyMap<string, string>): string {
  if (renames.size === 0) return text;
  let result = '';
  let last = 0;
  for (const link of findImageLinks(text)) {
    const parts = link.path.split('/');
    const tail = parts[parts.length - 1] ?? '';
    let decoded = tail;
    try {
      decoded = decodeURIComponent(tail);
    } catch {
      // Keep the literal name.
    }
    const renamed = renames.get(decoded);
    // A renamed image may itself contain ":" (`a:b.png` is valid on Linux), which looks like a URL
    // scheme to `isVaultPath`; only real URLs are left alone here.
    if (
      renamed === undefined ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(link.path) ||
      /^data:/i.test(link.path)
    ) {
      continue;
    }
    parts[parts.length - 1] = encodeSegment(renamed);
    result += text.slice(last, link.from) + parts.join('/');
    last = link.to;
  }
  return last === 0 ? text : result + text.slice(last);
}
