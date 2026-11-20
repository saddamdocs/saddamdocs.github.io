/**
 * The vault's operations on this device (PLAN 4.3): create, rename, move, duplicate, delete to the
 * Trash, restore, delete forever, undo, the local purge of old Trash items, and saving a note's text.
 *
 * Owns `Vault`, the only writer of the `items`, `texts`, `files` and `snapshots` stores. It keeps
 * every item record in memory (start-up reads metadata only, PLAN 5.3), applies each operation as
 * one strict IndexedDB transaction, and only then updates memory and tells its listeners. Every
 * change marks its items dirty through `records.changed()`, so sync (M3a) finds them.
 *
 * Operations run one at a time, in the order they were asked for, so a read-modify-write can never
 * interleave with another.
 *
 * Talks to: `store/db.ts` for transactions, `vault/tree.ts` for the index, `vault/names.ts` for
 * the name rules, `vault/records.ts` for the bookkeeping.
 */

import type { VaultDb } from '../store/db.ts';
import { writeTx } from '../store/db.ts';
import type { ItemRecord, TextRecord } from '../store/schema.ts';
import { SETTINGS_ID } from '../store/schema.ts';
import { newId } from './ids.ts';
import { freeName, normalizeName, suffixedName, validateName, type NameProblem } from './names.ts';
import { changed, newRecord, utf8Size } from './records.ts';
import { VaultIndex } from './tree.ts';

/** Why an operation was refused. */
export type OpProblem = NameProblem | 'not-found' | 'not-a-folder' | 'into-itself' | 'not-a-note';

/** The outcome of an operation that can be refused. */
export type OpResult<T> = { ok: true; value: T } | { ok: false; problem: OpProblem };

/** What an undo puts back: the placement and deletion state of each item before the operation. */
export interface UndoToken {
  readonly kind: 'delete' | 'move';
  readonly before: readonly Pick<ItemRecord, 'id' | 'name' | 'parent' | 'deleted' | 'deletedAt'>[];
}

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The vault on this device. */
export class Vault {
  private items: Map<string, ItemRecord>;
  private idx: VaultIndex;
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Use `Vault.load()`.
   *
   * @param db - The open database.
   * @param device - Returns this device's name, recorded on every change.
   * @param items - Every record of the `items` store.
   * @param clock - Returns the device time in ms; tests pass a fake.
   */
  private constructor(
    readonly db: VaultDb,
    private readonly device: () => string,
    items: readonly ItemRecord[],
    private readonly clock: () => number,
  ) {
    this.items = new Map(items.map((i) => [i.id, i]));
    this.idx = new VaultIndex(this.items.values());
  }

  /**
   * Reads every item's metadata and returns the vault.
   *
   * @param db - The open database.
   * @param device - Returns this device's name.
   * @param clock - Device time in ms; `Date.now` by default.
   * @returns The loaded vault.
   */
  static async load(
    db: VaultDb,
    device: () => string,
    clock: () => number = Date.now,
  ): Promise<Vault> {
    return new Vault(db, device, await db.getAll('items'), clock);
  }

  /** The current index; replaced (never mutated) after every change. */
  get index(): VaultIndex {
    return this.idx;
  }

  /**
   * Calls a function after every change.
   *
   * @param listener - Called with no arguments.
   * @returns A function that stops the calls.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Runs operations one at a time. A failed operation does not stop the ones after it. */
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * Writes records in one strict transaction, then updates memory and tells the listeners.
   *
   * @param put - Item records to store.
   * @param texts - Text records to store.
   * @param remove - Ids whose item, text, file and snapshots are removed entirely.
   * @param dropContent - Ids whose text, file and snapshots are removed but whose item stays.
   */
  private async commit(
    put: readonly ItemRecord[],
    texts: readonly TextRecord[] = [],
    remove: readonly string[] = [],
    dropContent: readonly string[] = [],
  ): Promise<void> {
    const tx = writeTx(this.db, ['items', 'texts', 'files', 'snapshots']);
    const items = tx.objectStore('items');
    const textStore = tx.objectStore('texts');
    const files = tx.objectStore('files');
    const snapshots = tx.objectStore('snapshots');
    const writes: Promise<unknown>[] = [];
    for (const record of put) writes.push(items.put(record));
    for (const text of texts) writes.push(textStore.put(text));
    for (const id of [...remove, ...dropContent]) {
      if (remove.includes(id)) writes.push(items.delete(id));
      writes.push(textStore.delete(id));
      writes.push(files.delete(id));
      writes.push(snapshots.delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER])));
    }
    await Promise.all([...writes, tx.done]);
    for (const record of put) this.items.set(record.id, record);
    for (const id of remove) this.items.delete(id);
    this.idx = new VaultIndex(this.items.values());
    for (const listener of this.listeners) listener();
  }

  /** The live children of a folder, as the name rules need them. */
  private siblings(parent: string): ItemRecord[] {
    return this.idx.liveChildren(parent);
  }

  /** Checks that an id names a live folder, or is the root. */
  private isFolderTarget(parent: string): boolean {
    if (parent === '') return true;
    const folder = this.items.get(parent);
    return folder !== undefined && folder.kind === 'folder' && this.idx.isLive(parent);
  }

  /**
   * Creates an empty note named `Untitled`, `Untitled 1`… (PLAN 4.3).
   *
   * @param parent - Folder id, or `""` for the root.
   * @param base - The name to start from.
   * @returns The new note, or `not-a-folder` when the parent is not a live folder.
   */
  createNote(parent: string, base = 'Untitled'): Promise<OpResult<ItemRecord>> {
    return this.run(async () => {
      if (!this.isFolderTarget(parent)) return { ok: false, problem: 'not-a-folder' };
      const now = this.clock();
      const name = freeName(base, 'note', this.siblings(parent));
      const record = newRecord({ id: newId(now), kind: 'note', name, parent }, now, this.device());
      await this.commit([record], [{ id: record.id, text: '', baseText: null }]);
      return { ok: true, value: record };
    });
  }

  /**
   * Creates a folder named `Untitled`, `Untitled 1`… (PLAN 4.3).
   *
   * @param parent - Folder id, or `""` for the root.
   * @param base - The name to start from.
   * @returns The new folder, or `not-a-folder` when the parent is not a live folder.
   */
  createFolder(parent: string, base = 'Untitled'): Promise<OpResult<ItemRecord>> {
    return this.run(async () => {
      if (!this.isFolderTarget(parent)) return { ok: false, problem: 'not-a-folder' };
      const now = this.clock();
      const name = freeName(base, 'folder', this.siblings(parent));
      const record = newRecord(
        { id: newId(now), kind: 'folder', name, parent },
        now,
        this.device(),
      );
      await this.commit([record]);
      return { ok: true, value: record };
    });
  }

  /**
   * Renames an item (PLAN 4.3). Renaming a folder is one change: paths are computed.
   *
   * @param id - The item.
   * @param rawName - The new name as typed.
   * @returns The renamed item, or why the name was refused.
   */
  rename(id: string, rawName: string): Promise<OpResult<ItemRecord>> {
    return this.run(async () => {
      const old = this.items.get(id);
      if (old === undefined || old.gone) return { ok: false, problem: 'not-found' };
      const name = normalizeName(rawName);
      if (name === old.name) return { ok: true, value: old };
      const problem = validateName(name, old.kind, this.siblings(this.idx.parentOf(old)), id);
      if (problem !== null) return { ok: false, problem };
      const record = changed(old, { name }, this.clock(), this.device());
      await this.commit([record]);
      return { ok: true, value: record };
    });
  }

  /**
   * Moves an item into a folder (PLAN 4.3). A folder cannot move into itself or below itself, and
   * the name must not clash in the target. M2 adds the rewrite of a moved note's image links.
   *
   * @param id - The item.
   * @param parent - Target folder id, or `""` for the root.
   * @returns An undo token, or why the move was refused.
   */
  move(id: string, parent: string): Promise<OpResult<UndoToken>> {
    return this.run(async () => {
      const old = this.items.get(id);
      if (old === undefined || old.gone) return { ok: false, problem: 'not-found' };
      if (!this.isFolderTarget(parent)) return { ok: false, problem: 'not-a-folder' };
      if (parent === id || this.idx.ancestors(parent).some((a) => a.id === id)) {
        return { ok: false, problem: 'into-itself' };
      }
      const token: UndoToken = { kind: 'move', before: [pickPlacement(old)] };
      if (this.idx.parentOf(old) === parent) return { ok: true, value: token };
      const problem = validateName(old.name, old.kind, this.siblings(parent), id);
      if (problem !== null) return { ok: false, problem };
      await this.commit([changed(old, { parent }, this.clock(), this.device())]);
      return { ok: true, value: token };
    });
  }

  /**
   * Duplicates a note: a new note beside it, named like Obsidian does (`plan 1`), with a copy of
   * the text only (PLAN 4.3). Folders are not duplicated.
   *
   * @param id - The note.
   * @returns The copy.
   */
  duplicate(id: string): Promise<OpResult<ItemRecord>> {
    return this.run(async () => {
      const old = this.items.get(id);
      if (old === undefined || old.gone) return { ok: false, problem: 'not-found' };
      if (old.kind !== 'note') return { ok: false, problem: 'not-a-note' };
      const text = (await this.db.get('texts', id))?.text ?? '';
      const parent = this.idx.parentOf(old);
      const now = this.clock();
      const name = freeName(old.name, 'note', this.siblings(parent));
      const record = newRecord(
        { id: newId(now), kind: 'note', name, parent, size: utf8Size(text) },
        now,
        this.device(),
      );
      await this.commit([record], [{ id: record.id, text, baseText: null }]);
      return { ok: true, value: record };
    });
  }

  /**
   * Moves an item to the Trash (PLAN 4.3). A folder is marked alone; its contents are hidden with
   * it and not changed one by one.
   *
   * @param id - The item.
   * @returns An undo token for the snackbar's Undo.
   */
  delete(id: string): Promise<OpResult<UndoToken>> {
    return this.run(async () => {
      const old = this.items.get(id);
      if (old === undefined || old.gone) return { ok: false, problem: 'not-found' };
      const token: UndoToken = { kind: 'delete', before: [pickPlacement(old)] };
      if (old.deleted) return { ok: true, value: token };
      const now = this.clock();
      await this.commit([changed(old, { deleted: true, deletedAt: now }, now, this.device())]);
      return { ok: true, value: token };
    });
  }

  /**
   * Puts items back as they were before a delete or a move, as a new ordinary change. A name that
   * now clashes gets ` (2)`.
   *
   * @param token - From `delete()` or `move()`.
   * @returns Resolves when written.
   */
  undo(token: UndoToken): Promise<void> {
    return this.run(async () => {
      const now = this.clock();
      const records: ItemRecord[] = [];
      for (const before of token.before) {
        const current = this.items.get(before.id);
        if (current === undefined || current.gone) continue;
        const parent = this.isFolderTarget(before.parent) ? before.parent : '';
        const name = suffixedName(before.name, current.kind, this.siblings(parent), current.id);
        records.push(
          changed(
            current,
            { parent, name, deleted: before.deleted, deletedAt: before.deletedAt },
            now,
            this.device(),
          ),
        );
      }
      if (records.length > 0) await this.commit(records);
    });
  }

  /**
   * Restores an item from the Trash (PLAN 4.3): back to its folder, or, when that folder is no
   * longer live, into a new folder of the same name under the root. A name that clashes gets
   * ` (2)`.
   *
   * @param id - An item marked deleted.
   * @returns The restored item.
   */
  restore(id: string): Promise<OpResult<ItemRecord>> {
    return this.run(async () => {
      const old = this.items.get(id);
      if (old === undefined || old.gone) return { ok: false, problem: 'not-found' };
      const now = this.clock();
      const device = this.device();
      const records: ItemRecord[] = [];
      let parent = old.parent;
      if (!this.isFolderTarget(parent)) {
        const lost = this.items.get(parent);
        const folderName = suffixedName(
          lost !== undefined && !lost.gone ? lost.name : 'Restored',
          'folder',
          this.siblings(''),
        );
        const folder = newRecord(
          { id: newId(now), kind: 'folder', name: folderName, parent: '' },
          now,
          device,
        );
        records.push(folder);
        parent = folder.id;
      }
      const siblings = records.length > 0 ? [] : this.siblings(parent);
      const name = suffixedName(old.name, old.kind, siblings, id);
      const restored = changed(old, { parent, name, deleted: false, deletedAt: null }, now, device);
      records.push(restored);
      await this.commit(records);
      return { ok: true, value: restored };
    });
  }

  /**
   * Deletes items forever (PLAN 4.3): a folder takes everything inside it, deepest first. An item
   * never uploaded is removed; one that was uploaded keeps a local tombstone, so the deletion can
   * upload (PLAN 5.5). Its text, file and snapshots are removed either way.
   *
   * @param ids - Items to delete forever.
   * @returns The number of items deleted, contents included.
   */
  deleteForever(ids: readonly string[]): Promise<number> {
    return this.run(async () => {
      const targets = new Map<string, ItemRecord>();
      for (const id of ids) {
        const item = this.items.get(id);
        if (item === undefined || item.gone) continue;
        if (item.kind === 'folder') {
          for (const inside of this.idx.descendantsDeepestFirst(id)) targets.set(inside.id, inside);
        }
        targets.set(id, item);
      }
      const now = this.clock();
      const device = this.device();
      const put: ItemRecord[] = [];
      const remove: string[] = [];
      const drop: string[] = [];
      for (const item of targets.values()) {
        if (item.rev === 0) remove.push(item.id);
        else {
          put.push(changed(item, { gone: true, deleted: true }, now, device));
          drop.push(item.id);
        }
      }
      if (targets.size > 0) await this.commit(put, [], remove, drop);
      return targets.size;
    });
  }

  /**
   * Empties the Trash: deletes every Trash entry forever.
   *
   * @returns The number of items deleted, contents included.
   */
  emptyTrash(): Promise<number> {
    return this.deleteForever(this.idx.trashEntries().map((e) => e.item.id));
  }

  /**
   * Deletes forever the Trash entries older than the limit, by the device clock. This is the rule
   * for a vault with sync off (PLAN 4.3); M3b adds the database-time rule for synced vaults.
   *
   * @param days - The "Keep items in the Trash for" setting (PLAN 4.13).
   * @returns The number of items deleted, contents included.
   */
  purgeExpired(days: number): Promise<number> {
    const limit = this.clock() - days * DAY_MS;
    const expired = this.idx
      .trashEntries()
      .filter((e) => e.item.deletedAt !== null && e.item.deletedAt <= limit)
      .map((e) => e.item.id);
    return expired.length === 0 ? Promise.resolve(0) : this.deleteForever(expired);
  }

  /**
   * Reads a note's or the settings item's text.
   *
   * @param id - The item.
   * @returns The text, or null when there is none.
   */
  async readText(id: string): Promise<string | null> {
    return (await this.db.get('texts', id))?.text ?? null;
  }

  /**
   * Saves a note's or the settings item's text, its size and its "needs upload" mark in one strict
   * transaction (PLAN 4.4). A text equal to the stored one is not written.
   *
   * @param id - The item.
   * @param text - The full text.
   * @returns True when something was written; false when nothing changed.
   * @throws When the transaction fails (storage full, storage disabled); the caller reports it.
   */
  saveText(id: string, text: string): Promise<boolean> {
    return this.run(async () => {
      const old = this.items.get(id);
      if (old === undefined || old.gone) throw new Error(`saveText: no item ${id}`);
      const stored = await this.db.get('texts', id);
      if (stored !== undefined && stored.text === text) return false;
      // `baseText` is the text as of `rev`, captured on the first change after a sync.
      const baseText = old.dirty
        ? (stored?.baseText ?? null)
        : old.rev > 0
          ? (stored?.text ?? null)
          : null;
      const record = changed(old, { size: utf8Size(text) }, this.clock(), this.device());
      await this.commit([record], [{ id, text, baseText }]);
      return true;
    });
  }

  /**
   * Creates the settings item if it does not exist yet (PLAN 5.5: fixed id).
   *
   * @param defaultText - The settings as JSON.
   * @returns Resolves when the item exists.
   */
  ensureSettingsItem(defaultText: string): Promise<void> {
    return this.run(async () => {
      if (this.items.has(SETTINGS_ID)) return;
      const now = this.clock();
      const record = newRecord(
        {
          id: SETTINGS_ID,
          kind: 'settings',
          name: 'settings',
          parent: '',
          size: utf8Size(defaultText),
        },
        now,
        this.device(),
      );
      await this.commit([record], [{ id: SETTINGS_ID, text: defaultText, baseText: null }]);
    });
  }
}

/** The placement and deletion state of an item, for an undo token. */
function pickPlacement(item: ItemRecord): UndoToken['before'][number] {
  return {
    id: item.id,
    name: item.name,
    parent: item.parent,
    deleted: item.deleted,
    deletedAt: item.deletedAt,
  };
}
