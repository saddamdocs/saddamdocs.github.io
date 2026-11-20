/**
 * The vault as a tree (PLAN 4.3): parents and children, paths computed from names, what is in the
 * Trash, and the rows the sidebar shows.
 *
 * Owns `VaultIndex`, an immutable index over item records, rebuilt after every change. It never
 * writes anything. Display rules: folders first, then notes, then files, in natural
 * case-insensitive order; an item whose parent is unknown or deleted forever shows at the root;
 * a parent loop (possible only through sync, repaired in M3b) never makes the tree loop.
 *
 * Talks to: nothing. Used by `vault/operations.ts` and the UI.
 */

import type { ItemKind, ItemRecord } from '../store/schema.ts';
import { exportName, nameKey } from './names.ts';

/** Natural, case-insensitive order (PLAN 4.3): "note 2" before "note 10", "a" next to "A". */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Order of kinds in the tree: folders first, then notes, then files. */
const KIND_ORDER: Readonly<Record<ItemKind, number>> = { folder: 0, note: 1, file: 2, settings: 3 };

/**
 * Compares two items for the tree.
 *
 * @param a - An item.
 * @param b - Another item.
 * @returns Negative, zero or positive, as `Array.prototype.sort` expects.
 */
export function compareItems(a: ItemRecord, b: ItemRecord): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    collator.compare(a.name, b.name) ||
    (a.id < b.id ? -1 : 1)
  );
}

/** One visible row of the sidebar tree. */
export interface TreeRow {
  readonly item: ItemRecord;
  /** 0 for items at the root. */
  readonly depth: number;
  /** True for a folder with at least one visible child. */
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  /** A live sibling has the same export name ignoring case (PLAN 4.3: two offline devices). */
  readonly sameName: boolean;
}

/** An immutable index of the vault's items. */
export class VaultIndex {
  /** Every record by id, tombstones and the settings item included. */
  readonly byId: ReadonlyMap<string, ItemRecord>;
  private readonly childrenOf = new Map<string, ItemRecord[]>();

  /**
   * Indexes a set of records.
   *
   * @param items - Every record of the `items` store.
   */
  constructor(items: Iterable<ItemRecord>) {
    const map = new Map<string, ItemRecord>();
    for (const item of items) map.set(item.id, item);
    this.byId = map;
    for (const item of map.values()) {
      if (item.gone || item.kind === 'settings') continue;
      const parent = this.parentOf(item);
      const list = this.childrenOf.get(parent);
      if (list === undefined) this.childrenOf.set(parent, [item]);
      else list.push(item);
    }
    for (const list of this.childrenOf.values()) list.sort(compareItems);
  }

  /**
   * Looks up an item.
   *
   * @param id - Item id.
   * @returns The record, or undefined.
   */
  get(id: string): ItemRecord | undefined {
    return this.byId.get(id);
  }

  /**
   * The folder an item shows in: its parent when that is a known, live-or-trashed folder that does
   * not lead back to the item; otherwise the root (`""`).
   *
   * @param item - The item.
   * @returns A folder id, or `""`.
   */
  parentOf(item: ItemRecord): string {
    const parent = this.byId.get(item.parent);
    if (parent === undefined || parent.gone || parent.kind !== 'folder') return '';
    // Guard against loops: walk up at most as many steps as there are items.
    let cursor: ItemRecord | undefined = parent;
    for (let steps = 0; cursor !== undefined && steps <= this.byId.size; steps += 1) {
      if (cursor.id === item.id) return '';
      const next = this.byId.get(cursor.parent);
      cursor = next === undefined || next.gone || next.kind !== 'folder' ? undefined : next;
    }
    return parent.id;
  }

  /**
   * The folders above an item, nearest first.
   *
   * @param id - Item id.
   * @returns The ancestor records; empty at the root or for an unknown id.
   */
  ancestors(id: string): ItemRecord[] {
    const result: ItemRecord[] = [];
    let item = this.byId.get(id);
    while (item !== undefined) {
      const parentId = this.parentOf(item);
      if (parentId === '') break;
      item = this.byId.get(parentId);
      if (item !== undefined) result.push(item);
    }
    return result;
  }

  /**
   * Tells whether an item is in the Trash: marked deleted itself, or inside a deleted folder
   * (PLAN 4.3).
   *
   * @param id - Item id.
   * @returns True when in the Trash. False for an unknown id.
   */
  inTrash(id: string): boolean {
    const item = this.byId.get(id);
    if (item === undefined || item.gone) return false;
    return item.deleted || this.ancestors(id).some((a) => a.deleted);
  }

  /**
   * Tells whether an item is live: known, not deleted forever, and not in the Trash.
   *
   * @param id - Item id.
   * @returns True when the item shows in the tree.
   */
  isLive(id: string): boolean {
    const item = this.byId.get(id);
    return item !== undefined && !item.gone && item.kind !== 'settings' && !this.inTrash(id);
  }

  /**
   * The children of a folder, sorted, Trash and tombstones included.
   *
   * @param parent - Folder id, or `""` for the root.
   * @returns The child records.
   */
  allChildren(parent: string): readonly ItemRecord[] {
    return this.childrenOf.get(parent) ?? [];
  }

  /**
   * The live children of a folder, sorted (PLAN 4.3).
   *
   * @param parent - Folder id, or `""` for the root.
   * @returns Children that are not marked deleted.
   */
  liveChildren(parent: string): ItemRecord[] {
    return this.allChildren(parent).filter((c) => !c.deleted);
  }

  /**
   * Every item below a folder, at any depth, deepest first, so a purge can delete the contents
   * before the folder (PLAN 4.3, 6.3).
   *
   * @param folderId - Folder id.
   * @returns The descendants, children after their own descendants.
   */
  descendantsDeepestFirst(folderId: string): ItemRecord[] {
    const result: ItemRecord[] = [];
    const visit = (id: string, depth: number): void => {
      if (depth > this.byId.size) return;
      for (const child of this.allChildren(id)) {
        if (child.kind === 'folder') visit(child.id, depth + 1);
        result.push(child);
      }
    };
    visit(folderId, 0);
    return result;
  }

  /**
   * The path of an item, computed from names (PLAN 4.3): `ideas/plan.md`.
   *
   * @param id - Item id.
   * @returns The path, with `.md` for notes; empty for an unknown id.
   */
  path(id: string): string {
    const item = this.byId.get(id);
    if (item === undefined) return '';
    const folders = this.ancestors(id)
      .reverse()
      .map((a) => a.name);
    return [...folders, exportName(item.name, item.kind)].join('/');
  }

  /**
   * Finds a live item by path, ignoring letter case (PLAN 4.3, "Path identity").
   *
   * @param path - A path such as `ideas/plan.md`.
   * @returns The item, or undefined.
   */
  findByPath(path: string): ItemRecord | undefined {
    let parent = '';
    let found: ItemRecord | undefined;
    for (const part of path.split('/').filter((p) => p !== '')) {
      const key = nameKey(part);
      found = this.liveChildren(parent).find((c) => nameKey(exportName(c.name, c.kind)) === key);
      if (found === undefined) return undefined;
      parent = found.id;
    }
    return found;
  }

  /**
   * The rows the sidebar shows (PLAN 4.3): live notes and folders, and files when asked, nested
   * under expanded folders.
   *
   * @param expanded - Ids of expanded folders.
   * @param showFiles - The "Show all files" setting (PLAN 4.13).
   * @returns The rows in display order.
   */
  rows(expanded: ReadonlySet<string>, showFiles: boolean): TreeRow[] {
    const rows: TreeRow[] = [];
    const visible = (item: ItemRecord): boolean => showFiles || item.kind !== 'file';
    const walk = (parent: string, depth: number): void => {
      const children = this.liveChildren(parent).filter(visible);
      const counts = new Map<string, number>();
      for (const c of children) {
        const key = nameKey(exportName(c.name, c.kind));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      for (const item of children) {
        const isOpen = item.kind === 'folder' && expanded.has(item.id);
        const hasChildren =
          item.kind === 'folder' && this.liveChildren(item.id).some((c) => visible(c));
        const sameName = (counts.get(nameKey(exportName(item.name, item.kind))) ?? 0) > 1;
        rows.push({ item, depth, hasChildren, expanded: isOpen, sameName });
        if (isOpen && depth < this.byId.size) walk(item.id, depth + 1);
      }
    };
    walk('', 0);
    return rows;
  }

  /**
   * The Trash view's entries (PLAN 4.3): items marked deleted themselves, newest first. Items that
   * are only inside a deleted folder are not listed separately; the folder's entry counts them.
   *
   * @returns The entries with the number of items each deleted folder holds.
   */
  trashEntries(): { item: ItemRecord; contains: number }[] {
    const entries: { item: ItemRecord; contains: number }[] = [];
    for (const item of this.byId.values()) {
      if (item.gone || item.kind === 'settings' || !item.deleted) continue;
      // An item inside a deleted folder is represented by that folder's entry.
      if (this.ancestors(item.id).some((a) => a.deleted)) continue;
      const contains = item.kind === 'folder' ? this.descendantsDeepestFirst(item.id).length : 0;
      entries.push({ item, contains });
    }
    return entries.sort((a, b) => (b.item.deletedAt ?? 0) - (a.item.deletedAt ?? 0));
  }
}
