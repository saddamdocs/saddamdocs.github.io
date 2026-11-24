/**
 * Import of plain Markdown (PLAN 4.15, R12): a folder, a `.zip` or several `.md` files become
 * folders, notes and images in the vault, keeping their structure.
 *
 * `planImport` is pure: from the source files and the vault it computes what to create and a
 * summary of what was imported, renamed and skipped. `vault.importItems` then writes it all in one
 * transaction. The rules:
 * - `.md` and `.markdown` become notes; PNG, JPEG, GIF, WebP and SVG up to 7 MB become files;
 *   everything else, and every entry whose name starts with a dot (`.obsidian`, `.git`,
 *   `.trash`), is skipped.
 * - Text must be valid UTF-8; `\r\n` becomes `\n`; a byte-order mark is dropped.
 * - A name that breaks the rules of PLAN 4.3 changes to the nearest valid one, `_` for each
 *   forbidden character; links to a renamed image in the notes of the same import follow it.
 * - An item whose path already exists gets ` (2)`; nothing existing changes.
 *
 * Talks to: `vault/names.ts`, `vault/links.ts`, `vault/tree.ts`, `config.ts`.
 */

import { MAX_FILE_BYTES } from '../config.ts';
import { renameLinkTargets } from '../vault/links.ts';
import {
  MAX_NAME_LENGTH,
  nameKey,
  nameProblem,
  normalizeName,
  exportName,
} from '../vault/names.ts';
import type { ImportItem } from '../vault/operations.ts';
import type { VaultIndex } from '../vault/tree.ts';
import { numbered } from './exportZip.ts';

/** One file from the source: a path relative to what was picked, and its bytes. */
export interface SourceFile {
  /** `/`-separated; a folder entry ends in `/` and has no bytes. */
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** Why an entry was skipped. */
export type SkipReason = 'hidden' | 'not-utf8' | 'too-large' | 'unsupported';

/** What an import did, for its summary (PLAN 4.15). */
export interface ImportReport {
  notes: number;
  files: number;
  folders: number;
  /** Items whose name had to change: invalid names and ` (2)` for existing paths. */
  renamed: { from: string; to: string }[];
  skipped: { path: string; reason: SkipReason }[];
}

/** The result of planning: what to create, in order, and the summary. */
export interface ImportPlan {
  readonly items: ImportItem[];
  readonly report: ImportReport;
}

/** File types that become files in the vault, by extension (PLAN 4.2, 4.15). */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** One node of the source tree while planning. */
interface Node {
  name: string;
  kind: 'folder' | 'note' | 'file';
  children: Map<string, Node>;
  text?: string;
  bytes?: Uint8Array<ArrayBuffer>;
  mime?: string;
  /** The source path, for the summary. */
  source: string;
}

/**
 * Fixes a name to the nearest valid one (PLAN 4.15): `_` for each forbidden or control character
 * and for trailing dots and spaces, `_` after a reserved Windows name, and at most 200 characters.
 *
 * @param raw - The name from the source, without `.md` for notes.
 * @param kind - The item's kind.
 * @returns A valid name; the same string when it already was.
 */
export function fixName(raw: string, kind: 'folder' | 'note' | 'file'): string {
  // eslint-disable-next-line no-control-regex -- replacing control characters is the point.
  let name = normalizeName(raw).replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_');
  name = name.replace(/[. ]+$/, (tail) => '_'.repeat(tail.length));
  if ([...name].length > MAX_NAME_LENGTH)
    name = [...name]
      .slice(0, MAX_NAME_LENGTH)
      .join('')
      .replace(/[. ]+$/, '');
  if (name.trim() === '') name = '_';
  if (nameProblem(name, kind) === 'reserved') {
    const dot = kind === 'note' ? -1 : name.indexOf('.');
    name = dot > 0 ? `${name.slice(0, dot)}_${name.slice(dot)}` : `${name}_`;
  }
  return name;
}

/**
 * Plans an import.
 *
 * @param sources - The files, with paths relative to what was picked: the picked folder itself is
 *   not part of the paths, and a zip's top level is the top.
 * @param index - The vault, for the ` (2)` rule.
 * @param target - The folder the import lands in, or `""` for the root.
 * @returns What to create and the summary.
 */
export function planImport(
  sources: readonly SourceFile[],
  index: VaultIndex,
  target: string,
): ImportPlan {
  const report: ImportReport = { notes: 0, files: 0, folders: 0, renamed: [], skipped: [] };
  const root: Node = { name: '', kind: 'folder', children: new Map(), source: '' };
  const hiddenReported = new Set<string>();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (const source of sources) {
    const isFolderEntry = source.path.endsWith('/');
    const parts = source.path.split('/').filter((p) => p !== '' && p !== '.');
    if (parts.length === 0) continue;
    const hiddenAt = parts.findIndex((p) => p.startsWith('.'));
    // Folders above a hidden entry are real folders (one holding only `.gitkeep` or `.DS_Store`
    // is an empty folder); only the hidden entry and what is below it are skipped.
    const folders =
      hiddenAt !== -1 ? parts.slice(0, hiddenAt) : isFolderEntry ? parts : parts.slice(0, -1);
    let parent = root;
    for (const [i, folder] of folders.entries()) {
      let next = parent.children.get(`folder:${folder}`);
      if (next === undefined) {
        next = {
          name: folder,
          kind: 'folder',
          children: new Map(),
          source: `${parts.slice(0, i + 1).join('/')}/`,
        };
        parent.children.set(`folder:${folder}`, next);
      }
      parent = next;
    }
    if (hiddenAt !== -1) {
      const prefix =
        parts.slice(0, hiddenAt + 1).join('/') +
        (hiddenAt < parts.length - 1 || isFolderEntry ? '/' : '');
      if (!hiddenReported.has(prefix)) {
        hiddenReported.add(prefix);
        report.skipped.push({ path: prefix, reason: 'hidden' });
      }
      continue;
    }
    if (isFolderEntry) continue;
    const fileName = parts[parts.length - 1] ?? '';
    const ext = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? '';
    if (ext === 'md' || ext === 'markdown') {
      let text: string;
      try {
        // A byte-order mark is dropped by the decoder (ignoreBOM is false).
        text = decoder.decode(source.bytes).replace(/\r\n/g, '\n');
      } catch {
        report.skipped.push({ path: source.path, reason: 'not-utf8' });
        continue;
      }
      const name = fileName.slice(0, -(ext.length + 1));
      parent.children.set(`note:${name}`, {
        name,
        kind: 'note',
        children: new Map(),
        text,
        source: source.path,
      });
    } else if (ext in IMAGE_TYPES) {
      if (source.bytes.byteLength > MAX_FILE_BYTES) {
        report.skipped.push({ path: source.path, reason: 'too-large' });
        continue;
      }
      parent.children.set(`file:${fileName}`, {
        name: fileName,
        kind: 'file',
        children: new Map(),
        bytes: source.bytes,
        mime: IMAGE_TYPES[ext] ?? '',
        source: source.path,
      });
    } else {
      report.skipped.push({ path: source.path, reason: 'unsupported' });
    }
  }

  // Images renamed for validity: links to them in this import's notes follow (PLAN 4.15).
  const imageRenames = new Map<string, string>();
  const items: ImportItem[] = [];
  const notes: { item: ImportItem; index: number }[] = [];

  const place = (
    node: Node,
    parentIndex: number,
    existing: readonly { name: string; kind: string }[],
  ): void => {
    const taken = new Set(existing.map((e) => nameKey(exportName(e.name, e.kind as 'note'))));
    const children = [...node.children.values()].sort((a, b) => (a.source < b.source ? -1 : 1));
    for (const child of children) {
      const fixed = fixName(child.name, child.kind);
      let name = fixed;
      for (let n = 2; taken.has(nameKey(exportName(name, child.kind))); n += 1) {
        name = child.kind === 'file' ? numbered(fixed, n) : `${fixed} (${String(n)})`;
      }
      taken.add(nameKey(exportName(name, child.kind)));
      if (name !== child.name) {
        const from = child.kind === 'folder' ? child.source.replace(/\/$/, '') : child.source;
        report.renamed.push({ from, to: exportName(name, child.kind) });
        if (child.kind === 'file' && fixed !== child.name) imageRenames.set(child.name, fixed);
      }
      const item: ImportItem =
        child.kind === 'note'
          ? { kind: 'note', name, parent: parentIndex, text: child.text ?? '' }
          : child.kind === 'file'
            ? {
                kind: 'file',
                name,
                parent: parentIndex,
                bytes: child.bytes!,
                mime: child.mime ?? '',
              }
            : { kind: 'folder', name, parent: parentIndex };
      items.push(item);
      const at = items.length - 1;
      if (child.kind === 'note') {
        report.notes += 1;
        notes.push({ item, index: at });
      } else if (child.kind === 'file') report.files += 1;
      else {
        report.folders += 1;
        place(child, at, []);
      }
    }
  };
  place(root, -1, index.liveChildren(target));

  if (imageRenames.size > 0) {
    for (const { item, index: at } of notes) {
      const text = renameLinkTargets(item.text ?? '', imageRenames);
      if (text !== item.text) items[at] = { ...item, text };
    }
  }
  return { items, report };
}

/**
 * Reads files picked with a folder input (`webkitdirectory`): the picked folder itself is not
 * recreated, so its name is dropped from every path (PLAN 4.15).
 *
 * @param files - The picked files, each with `webkitRelativePath`.
 * @returns The source files.
 */
export async function readFolderPick(files: Iterable<File>): Promise<SourceFile[]> {
  const sources: SourceFile[] = [];
  for (const file of files) {
    const relative =
      (file.webkitRelativePath || file.name).split('/').slice(1).join('/') || file.name;
    sources.push({ path: relative, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  return sources;
}
