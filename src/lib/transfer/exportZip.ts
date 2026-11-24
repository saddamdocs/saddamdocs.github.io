/**
 * Export of plain Markdown (PLAN 4.15, R12): the vault, or one folder, as unencrypted `.md` files in
 * their folders, with their images, in one archive; and one note as a `.md` file.
 *
 * The layout is exactly the tree: every note is one `.md` file, byte for byte its text; every
 * folder is a folder, empty ones kept; images sit at their own paths. Names that clash ignoring
 * case get ` (2)` (the later one), so the archive unpacks on Windows. The Trash goes under a
 * top-level `.trash/` folder only when asked; snapshots, settings, the workspace and keys never.
 *
 * Talks to: `vault/tree.ts` for the layout, `vault/operations.ts` for texts and bytes, and the zip
 * worker. Export reads only this device's storage, so it works offline and with sync off.
 */

import type { ItemRecord } from '../store/schema.ts';
import { exportName, nameKey } from '../vault/names.ts';
import type { Vault } from '../vault/operations.ts';
import type { VaultIndex } from '../vault/tree.ts';
import type { ZipEntries } from './zipCore.ts';

/** One entry of an export, before the bytes are read. */
export interface ExportEntry {
  /** Path in the archive; folders end in `/`. */
  readonly path: string;
  readonly item: ItemRecord;
}

/** The top-level folder that holds the Trash in an export (PLAN 4.15); import skips it. */
export const TRASH_FOLDER = '.trash';

/**
 * Adds ` (n)` to a name, before a file's extension: `map (2).png`, `plan (2).md`.
 *
 * @param fileName - The export name.
 * @param n - The number, from 2.
 * @returns The new name.
 */
export function numbered(fileName: string, n: number): string {
  const dot = fileName.lastIndexOf('.');
  const suffix = ` (${String(n)})`;
  return dot > 0 ? fileName.slice(0, dot) + suffix + fileName.slice(dot) : fileName + suffix;
}

/**
 * Gives each sibling a unique export name ignoring case: the earliest created keeps its name, the
 * later ones get ` (2)`, ` (3)`… (PLAN 4.3, 4.15).
 */
function uniqueNames(siblings: readonly ItemRecord[]): Map<string, string> {
  const ordered = [...siblings].sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1));
  const taken = new Set<string>();
  const names = new Map<string, string>();
  for (const item of ordered) {
    const base = exportName(item.name, item.kind);
    let name = base;
    for (let n = 2; taken.has(nameKey(name)); n += 1) name = numbered(base, n);
    taken.add(nameKey(name));
    names.set(item.id, name);
  }
  return names;
}

/**
 * Plans an export: the path of every folder, note and file.
 *
 * @param index - The vault.
 * @param root - `""` for the whole vault, or a folder id to export that folder, which then sits
 *   at the top of the archive.
 * @param includeTrash - Put the Trash under `.trash/` (whole-vault exports only).
 * @returns The entries, folders before their contents.
 */
export function planExport(index: VaultIndex, root: string, includeTrash: boolean): ExportEntry[] {
  const entries: ExportEntry[] = [];
  const walk = (
    parent: string,
    prefix: string,
    children: (id: string) => readonly ItemRecord[],
  ): void => {
    const list = children(parent).filter((c) => !c.gone && c.kind !== 'settings');
    const names = uniqueNames(list);
    for (const item of list) {
      const path = prefix + (names.get(item.id) ?? '');
      if (item.kind === 'folder') {
        entries.push({ path: `${path}/`, item });
        walk(item.id, `${path}/`, children);
      } else {
        entries.push({ path, item });
      }
    }
  };
  const live = (id: string): readonly ItemRecord[] => index.liveChildren(id);
  if (root === '') {
    walk('', '', live);
    if (includeTrash) {
      const trashed = index.trashEntries().map((e) => e.item);
      if (trashed.length > 0) {
        entries.push({ path: `${TRASH_FOLDER}/`, item: trashed[0]! });
        // Inside the Trash, a deleted folder keeps everything it held, deleted or not.
        const all = (id: string): readonly ItemRecord[] =>
          id === TRASH_FOLDER ? trashed : index.allChildren(id);
        walk(TRASH_FOLDER, `${TRASH_FOLDER}/`, all);
      }
    }
  } else {
    const folder = index.get(root);
    if (folder === undefined || folder.kind !== 'folder') return [];
    entries.push({ path: `${folder.name}/`, item: folder });
    walk(root, `${folder.name}/`, live);
  }
  return entries;
}

/**
 * Reads the bytes of every planned entry: notes as UTF-8 of their text, files as their bytes,
 * folders as empty folder entries.
 *
 * @param vault - The vault.
 * @param plan - From `planExport`.
 * @returns Paths to bytes, ready for the zip worker. A file whose bytes this device does not have
 *   is left out and named in `missing`.
 */
export async function readExport(
  vault: Vault,
  plan: readonly ExportEntry[],
): Promise<{ entries: ZipEntries; missing: string[] }> {
  const entries: ZipEntries = {};
  const missing: string[] = [];
  const encoder = new TextEncoder();
  for (const { path, item } of plan) {
    if (path.endsWith('/')) {
      entries[path] = new Uint8Array(0);
    } else if (item.kind === 'note') {
      entries[path] = encoder.encode((await vault.readText(item.id)) ?? '');
    } else if (item.kind === 'file') {
      const blob = await vault.readFile(item.id);
      if (blob === null) missing.push(path);
      else entries[path] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  return { entries, missing };
}
