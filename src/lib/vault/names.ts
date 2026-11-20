/**
 * The name rules of PLAN 4.3: names must be valid file names on Windows and Linux, so that export
 * never fails, and siblings must not differ only by letter case.
 *
 * Owns: normalisation (NFC, so "ação" typed with dead keys or composed matches), validation, the
 * name an item gets on export, case-insensitive comparison, and choosing free names such as
 * `Untitled 1` or `plan 2`.
 *
 * Talks to: nothing. Pure functions, used by `vault/operations.ts`, the tree and import (M2).
 */

import type { ItemKind } from '../store/schema.ts';

/** Longest name allowed, in characters (PLAN 4.3). */
export const MAX_NAME_LENGTH = 200;

/** Why a name was refused. The UI turns each into a sentence from `strings.ts`. */
export type NameProblem =
  | 'empty'
  | 'too-long'
  | 'forbidden-character'
  | 'control-character'
  | 'trailing-dot-or-space'
  | 'reserved'
  | 'dot-name'
  | 'sibling-clash';

/** Characters Windows forbids in file names (PLAN 4.3). */
const FORBIDDEN = /[<>:"/\\|?*]/;
/** C0 control characters and DEL. */
// eslint-disable-next-line no-control-regex -- matching control characters is the point (PLAN 4.3).
const CONTROL = /[\u0000-\u001f\u007f]/;
/** Windows device names, also reserved with any extension ("CON.md" is as bad as "CON"). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Normalises a name as typed: Unicode NFC. Nothing else changes; validation decides the rest.
 *
 * @param name - The raw text.
 * @returns The normalised name.
 */
export function normalizeName(name: string): string {
  return name.normalize('NFC');
}

/**
 * The file or folder name an item gets in an export (PLAN 4.15): notes gain `.md`, folders and
 * files keep their name.
 *
 * @param name - The item's name.
 * @param kind - The item's kind.
 * @returns The name on disk.
 */
export function exportName(name: string, kind: ItemKind): string {
  return kind === 'note' ? `${name}.md` : name;
}

/**
 * The key two names are compared by: case-insensitive, as on Windows (PLAN 4.3, "Path identity").
 *
 * @param name - A name, or an export name.
 * @returns A key that is equal for names that differ only by letter case.
 */
export function nameKey(name: string): string {
  return normalizeName(name).toUpperCase().toLowerCase();
}

/**
 * Checks a name against the rules of PLAN 4.3, except the sibling rule.
 *
 * @param name - An NFC-normalised name.
 * @param kind - The item's kind; notes are checked with the `.md` export adds.
 * @returns The first problem found, or null when the name is valid.
 */
export function nameProblem(name: string, kind: ItemKind): NameProblem | null {
  if (name.trim() === '') return 'empty';
  if ([...name].length > MAX_NAME_LENGTH) return 'too-long';
  if (CONTROL.test(name)) return 'control-character';
  if (FORBIDDEN.test(name)) return 'forbidden-character';
  if (/[. ]$/.test(name)) return 'trailing-dot-or-space';
  // "." and ".." name directories themselves; names starting with a dot are skipped by import
  // (PLAN 4.15), so allowing them would make an export that cannot come back in.
  if (name.startsWith('.')) return 'dot-name';
  if (RESERVED.test(exportName(name, kind))) return 'reserved';
  return null;
}

/** A sibling as the clash check needs it. */
export interface Sibling {
  readonly id: string;
  readonly name: string;
  readonly kind: ItemKind;
}

/**
 * Tells whether a name would clash with a sibling: the same export name, ignoring case
 * (PLAN 4.3). A note `plan` and a folder `plan` do not clash (`plan.md` and `plan/`).
 *
 * @param name - The candidate name.
 * @param kind - The candidate's kind.
 * @param siblings - The live items in the same folder.
 * @param selfId - The item being renamed, which never clashes with itself.
 * @returns True on a clash.
 */
export function clashes(
  name: string,
  kind: ItemKind,
  siblings: readonly Sibling[],
  selfId: string | null = null,
): boolean {
  const key = nameKey(exportName(name, kind));
  return siblings.some((s) => s.id !== selfId && nameKey(exportName(s.name, s.kind)) === key);
}

/**
 * Checks a name completely: the rules of PLAN 4.3 and the sibling rule.
 *
 * @param name - An NFC-normalised name.
 * @param kind - The item's kind.
 * @param siblings - The live items in the target folder.
 * @param selfId - The item being renamed or moved, if any.
 * @returns The first problem found, or null.
 */
export function validateName(
  name: string,
  kind: ItemKind,
  siblings: readonly Sibling[],
  selfId: string | null = null,
): NameProblem | null {
  return (
    nameProblem(name, kind) ?? (clashes(name, kind, siblings, selfId) ? 'sibling-clash' : null)
  );
}

/**
 * Picks the first free name of the form `base`, `base 1`, `base 2`… (Obsidian numbers new notes
 * this way: `Untitled`, `Untitled 1`). Used for new notes and folders.
 *
 * @param base - For example `Untitled`.
 * @param kind - The new item's kind.
 * @param siblings - The live items in the target folder.
 * @returns A name that does not clash.
 */
export function freeName(base: string, kind: ItemKind, siblings: readonly Sibling[]): string {
  if (!clashes(base, kind, siblings)) return base;
  for (let n = 1; ; n += 1) {
    const candidate = `${base} ${String(n)}`;
    if (!clashes(candidate, kind, siblings)) return candidate;
  }
}

/**
 * Picks a free name for an item that must keep its own name if it can, adding ` (2)`, ` (3)`…
 * otherwise (PLAN 4.3 and 4.15: restoring, importing). Shortens the base so the result stays
 * within the length limit.
 *
 * @param name - The wanted name.
 * @param kind - The item's kind.
 * @param siblings - The live items in the target folder.
 * @param selfId - The item itself, if it already exists.
 * @returns `name`, or `name (n)` with the smallest free n from 2.
 */
export function suffixedName(
  name: string,
  kind: ItemKind,
  siblings: readonly Sibling[],
  selfId: string | null = null,
): string {
  if (!clashes(name, kind, siblings, selfId)) return name;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${String(n)})`;
    const room = MAX_NAME_LENGTH - suffix.length;
    const base = [...name]
      .slice(0, room)
      .join('')
      .replace(/[. ]+$/, '');
    const candidate = base + suffix;
    if (!clashes(candidate, kind, siblings, selfId)) return candidate;
  }
}
