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
import { MAX_FILE_BYTES, SNAPSHOT_LIMIT, SNAPSHOT_MIN_INTERVAL_MS } from '../config.ts';
import type { ItemMeta, ItemRecord, SnapshotRecord, TextRecord } from '../store/schema.ts';
import { SETTINGS_ID } from '../store/schema.ts';
import { newId } from './ids.ts';
import { freeName, normalizeName, suffixedName, validateName, type NameProblem } from './names.ts';
import { rewriteLinksForMove } from './links.ts';
import { changed, metaOf, newRecord, utf8Size } from './records.ts';
import { VaultIndex } from './tree.ts';

/** Why an operation was refused. */
export type OpProblem = NameProblem | 'not-found' | 'not-a-folder' | 'into-itself' | 'not-a-note';

/** The outcome of an operation that can be refused. */
export type OpResult<T> = { ok: true; value: T } | { ok: false; problem: OpProblem };

/** What an undo puts back: the placement and deletion state of each item before the operation. */
export interface UndoToken {
  readonly kind: 'delete' | 'move';
  readonly before: readonly Pick<ItemRecord, 'id' | 'name' | 'parent' | 'deleted' | 'deletedAt'>[];
  /** Notes whose text the operation rewrote (image links of a moved note); an open editor reloads. */
  readonly rewritten: readonly string[];
}

/** One item for `importItems`. */
export interface ImportItem {
  readonly kind: 'folder' | 'note' | 'file';
  readonly name: string;
  /** Index of the parent folder in the same list, or -1 for the import's target folder. */
  readonly parent: number;
  /** A note's text, `\n` line endings. */
  readonly text?: string;
  /** A file's bytes, at most `MAX_FILE_BYTES`. */
  readonly bytes?: Uint8Array<ArrayBuffer>;
  readonly mime?: string;
}

/** What changed in the vault, for its listeners. */
export interface VaultChange {
  /** The items written or removed. */
  readonly ids: readonly string[];
  /**
   * `local`: a change made on this device, which marks items dirty. `remote`: a record from the
   * database was applied. `sync`: only sync bookkeeping changed (an upload finished).
   */
  readonly origin: 'local' | 'remote' | 'sync';
}

/** An item as an upload reads it (PLAN 6.3, "Push" step 1). */
export interface UploadSource {
  readonly item: ItemRecord;
  /** The text of a note or of the settings item, else null. */
  readonly text: string | null;
  /** A file's bytes, read for its first upload only; else null. */
  readonly bytes: Uint8Array<ArrayBuffer> | null;
}

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The vault on this device. */
export class Vault {
  private items: Map<string, ItemRecord>;
  private idx: VaultIndex;
  private readonly listeners = new Set<(change: VaultChange) => void>();
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
  subscribe(listener: (change: VaultChange) => void): () => void {
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
   * @param newFiles - File bytes to store.
   * @param origin - Who made the change, for the listeners.
   */
  private async commit(
    put: readonly ItemRecord[],
    texts: readonly TextRecord[] = [],
    remove: readonly string[] = [],
    dropContent: readonly string[] = [],
    newFiles: readonly { id: string; blob: Blob }[] = [],
    origin: VaultChange['origin'] = 'local',
  ): Promise<void> {
    const tx = writeTx(this.db, ['items', 'texts', 'files', 'snapshots']);
    const items = tx.objectStore('items');
    const textStore = tx.objectStore('texts');
    const files = tx.objectStore('files');
    const snapshots = tx.objectStore('snapshots');
    const writes: Promise<unknown>[] = [];
    for (const record of put) writes.push(items.put(record));
    for (const text of texts) writes.push(textStore.put(text));
    for (const file of newFiles) writes.push(files.put(file));
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
    const change: VaultChange = {
      ids: [
        ...new Set([
          ...put.map((r) => r.id),
          ...texts.map((t) => t.id),
          ...remove,
          ...newFiles.map((f) => f.id),
        ]),
      ],
      origin,
    };
    for (const listener of this.listeners) listener(change);
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
      if (this.idx.parentOf(old) === parent) {
        return { ok: true, value: { kind: 'move', before: [pickPlacement(old)], rewritten: [] } };
      }
      const problem = validateName(old.name, old.kind, this.siblings(parent), id);
      if (problem !== null) return { ok: false, problem };
      // PLAN 4.3: moving a note rewrites its image links, in the same transaction as the move.
      const text = await this.linksAfterMove(old, parent);
      const record = changed(
        old,
        text === null ? { parent } : { parent, size: utf8Size(text.text) },
        this.clock(),
        this.device(),
      );
      await this.commit([record], text === null ? [] : [text]);
      return {
        ok: true,
        value: { kind: 'move', before: [pickPlacement(old)], rewritten: text === null ? [] : [id] },
      };
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
      const token: UndoToken = { kind: 'delete', before: [pickPlacement(old)], rewritten: [] };
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
   * @returns The notes whose text was rewritten (an open editor reloads them).
   */
  undo(token: UndoToken): Promise<string[]> {
    return this.run(async () => {
      const now = this.clock();
      const records: ItemRecord[] = [];
      const texts: TextRecord[] = [];
      for (const before of token.before) {
        const current = this.items.get(before.id);
        if (current === undefined || current.gone) continue;
        const parent = this.isFolderTarget(before.parent) ? before.parent : '';
        const name = suffixedName(before.name, current.kind, this.siblings(parent), current.id);
        // Undoing a move rewrites the links back from where the note is now, so edits made since
        // the move are kept (PLAN 4.3: "undone with it").
        const text =
          this.idx.parentOf(current) === parent
            ? null
            : await this.linksAfterMove(current, parent, true);
        if (text !== null) texts.push(text);
        records.push(
          changed(
            current,
            {
              parent,
              name,
              deleted: before.deleted,
              deletedAt: before.deletedAt,
              ...(text === null ? {} : { size: utf8Size(text.text) }),
            },
            now,
            this.device(),
          ),
        );
      }
      if (records.length > 0) await this.commit(records, texts);
      return texts.map((t) => t.id);
    });
  }

  /**
   * The text record a note needs after moving to another folder, with its image links rewritten
   * (PLAN 4.3), or null when the item is not a note or no link changes.
   */
  private async linksAfterMove(
    item: ItemRecord,
    parent: string,
    shortest = false,
  ): Promise<TextRecord | null> {
    if (item.kind !== 'note') return null;
    const stored = await this.db.get('texts', item.id);
    if (stored === undefined) return null;
    const text = rewriteLinksForMove(
      this.idx,
      stored.text,
      this.idx.parentOf(item),
      parent,
      shortest,
    );
    return text === stored.text ? null : textAfterChange(item, stored, text);
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
      const record = changed(old, { size: utf8Size(text) }, this.clock(), this.device());
      await this.commit([record], [textAfterChange(old, stored, text)]);
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

  /**
   * Moves several items to the Trash in one change, for example "Undo import" (PLAN 4.15).
   *
   * @param ids - The items.
   * @returns Resolves when written.
   */
  deleteMany(ids: readonly string[]): Promise<void> {
    return this.run(async () => {
      const now = this.clock();
      const records = ids
        .map((id) => this.items.get(id))
        .filter((i): i is ItemRecord => i !== undefined && !i.gone && !i.deleted)
        .map((i) => changed(i, { deleted: true, deletedAt: now }, now, this.device()));
      if (records.length > 0) await this.commit(records);
    });
  }

  /**
   * Reads a file's bytes.
   *
   * @param id - The file.
   * @returns The Blob, or null when this device does not have the bytes.
   */
  async readFile(id: string): Promise<Blob | null> {
    return (await this.db.get('files', id))?.blob ?? null;
  }

  /**
   * Takes a snapshot of a note (PLAN 4.3): at most one per 10 minutes unless forced, none when the
   * text equals the newest snapshot, and never more than 20 per note (the oldest go).
   *
   * @param id - The note.
   * @param text - The text to keep.
   * @param reason - Why it is taken.
   * @param force - Skip the 10-minute rule (a merge, PLAN 6.3; a restore).
   * @returns True when a snapshot was stored.
   */
  snapshot(
    id: string,
    text: string,
    reason: SnapshotRecord['reason'],
    force = false,
  ): Promise<boolean> {
    return this.run(async () => {
      const now = this.clock();
      const tx = writeTx(this.db, ['snapshots']);
      const store = tx.objectStore('snapshots');
      const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
      const newest = await store.openCursor(range, 'prev');
      const last = newest?.value;
      const tooSoon = last !== undefined && now - last.time < SNAPSHOT_MIN_INTERVAL_MS;
      if ((tooSoon && !force) || last?.text === text) {
        await tx.done;
        return false;
      }
      await store.put({ id, time: now, reason, text });
      const keys = await store.getAllKeys(range);
      for (const key of keys.slice(0, Math.max(0, keys.length - SNAPSHOT_LIMIT)))
        await store.delete(key);
      await tx.done;
      return true;
    });
  }

  /**
   * Lists a note's snapshots, newest first.
   *
   * @param id - The note.
   * @returns The snapshots.
   */
  async listSnapshots(id: string): Promise<SnapshotRecord[]> {
    const all = await this.db.getAll(
      'snapshots',
      IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
    );
    return all.reverse();
  }

  /**
   * Adds imported items in one transaction (PLAN 4.15). Folders come before their contents in
   * `items`; each item names its parent by its index in the list, or -1 for the target folder.
   * Names are final: the caller has applied the name rules and the ` (2)` rule.
   *
   * @param target - The folder the import lands in, or `""` for the root.
   * @param items - What to create.
   * @returns The ids created, in the order given.
   */
  importItems(target: string, items: readonly ImportItem[]): Promise<string[]> {
    return this.run(async () => {
      const now = this.clock();
      const device = this.device();
      const records: ItemRecord[] = [];
      const texts: TextRecord[] = [];
      const files: { id: string; blob: Blob }[] = [];
      const ids: string[] = [];
      for (const item of items) {
        const parent = item.parent === -1 ? target : (ids[item.parent] ?? target);
        const id = newId(now);
        ids.push(id);
        if (item.kind === 'note') {
          const text = item.text ?? '';
          records.push(
            newRecord(
              { id, kind: 'note', name: item.name, parent, size: utf8Size(text) },
              now,
              device,
            ),
          );
          texts.push({ id, text, baseText: null });
        } else if (item.kind === 'file' && item.bytes !== undefined) {
          const sha256 = await sha256Hex(item.bytes);
          records.push(
            newRecord(
              {
                id,
                kind: 'file',
                name: item.name,
                parent,
                size: item.bytes.byteLength,
                mime: item.mime ?? null,
                sha256,
              },
              now,
              device,
            ),
          );
          files.push({ id, blob: new Blob([item.bytes], { type: item.mime ?? '' }) });
        } else {
          records.push(newRecord({ id, kind: 'folder', name: item.name, parent }, now, device));
        }
      }
      await this.commit(records, texts, [], [], files);
      return ids;
    });
  }

  /**
   * The items with changes not yet uploaded (PLAN 5.3, `dirty`).
   *
   * @returns The records, in no particular order.
   */
  dirtyItems(): ItemRecord[] {
    return [...this.items.values()].filter((i) => i.dirty);
  }

  /**
   * Reads an item, its text and, for a file never uploaded, its bytes, in one transaction
   * (PLAN 6.3, "Push" step 1).
   *
   * @param id - The item.
   * @returns What to upload, or null when the item no longer exists.
   */
  readForUpload(id: string): Promise<UploadSource | null> {
    return this.run(async () => {
      const item = this.items.get(id);
      if (item === undefined) return null;
      const tx = this.db.transaction(['texts', 'files'], 'readonly');
      const [text, file] = await Promise.all([
        item.kind === 'note' || item.kind === 'settings'
          ? tx.objectStore('texts').get(id)
          : undefined,
        item.kind === 'file' && item.rev === 0 ? tx.objectStore('files').get(id) : undefined,
        tx.done,
      ]);
      const bytes = file === undefined ? null : new Uint8Array(await file.blob.arrayBuffer());
      return { item, text: text?.text ?? null, bytes };
    });
  }

  /**
   * Records a finished upload (PLAN 6.3, "Push" step 4). When the item did not change during the
   * upload it becomes clean; otherwise it stays dirty, and what was uploaded becomes its base.
   *
   * @param id - The item.
   * @param rev - The revision just written.
   * @param seq - The item's `seq` when it was read for the upload.
   * @param uploaded - What was uploaded: the record as read, and its text.
   * @returns Resolves when stored.
   */
  markUploaded(id: string, rev: number, seq: number, uploaded: UploadSource): Promise<void> {
    return this.run(async () => {
      const current = this.items.get(id);
      if (current === undefined) return;
      const same = current.seq === seq;
      const record: ItemRecord = same
        ? { ...current, rev, dirty: false, dirtySince: null, base: null }
        : { ...current, rev, base: metaOf(uploaded.item) };
      const texts: TextRecord[] = [];
      if (uploaded.text !== null) {
        const stored = await this.db.get('texts', id);
        if (stored !== undefined) texts.push({ ...stored, baseText: same ? null : uploaded.text });
      }
      await this.commit([record], texts, [], [], [], 'sync');
    });
  }

  /**
   * Applies a record from the database to an item that has no local changes (PLAN 6.3, "Pull"
   * steps 3 and 4), or creates it. Never marks anything dirty.
   *
   * @param id - The item.
   * @param kind - Its kind.
   * @param rev - The record's revision.
   * @param ts - The record's database time.
   * @param meta - The opened metadata.
   * @param text - The opened text, for notes and the settings item.
   * @param size - The plaintext size.
   * @returns Resolves when stored.
   */
  applyRemote(
    id: string,
    kind: ItemRecord['kind'],
    rev: number,
    ts: number,
    meta: ItemMeta,
    text: string | null,
    size: number,
  ): Promise<void> {
    return this.run(async () => {
      const current = this.items.get(id);
      const record: ItemRecord = {
        ...(current ?? { id, seq: 0, gone: false }),
        ...meta,
        id,
        kind,
        size,
        gone: false,
        rev,
        ts,
        dirty: false,
        dirtySince: null,
        base: null,
        unreadable: false,
      };
      const texts: TextRecord[] = text === null ? [] : [{ id, text, baseText: null }];
      await this.commit([record], texts, [], [], [], 'remote');
    });
  }

  /**
   * Stores a file's bytes that arrived from the database.
   *
   * @param id - The file.
   * @param blob - The bytes, with the file's type.
   * @returns Resolves when stored.
   */
  putFileBytes(id: string, blob: Blob): Promise<void> {
    return this.run(async () => {
      const current = this.items.get(id);
      if (current === undefined) return;
      await this.commit([current], [], [], [], [{ id, blob }], 'remote');
    });
  }

  /**
   * Records the database time of the revision this device already has (PLAN 6.3, "Pull" step 1:
   * an upload with `print=silent` does not return it), or marks an item unreadable.
   *
   * @param id - The item.
   * @param patch - `ts`, `unreadable`, or both.
   * @returns Resolves when stored.
   */
  setSyncFields(id: string, patch: Partial<Pick<ItemRecord, 'ts' | 'unreadable'>>): Promise<void> {
    return this.run(async () => {
      const current = this.items.get(id);
      if (current === undefined) return;
      await this.commit([{ ...current, ...patch }], [], [], [], [], 'sync');
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

/**
 * The text record after a local change of a note's text (PLAN 5.3): `baseText` is the text as of
 * `rev`, captured on the first change after a sync and kept while the item stays dirty.
 *
 * @param item - The item before the change.
 * @param stored - Its stored text record, if any.
 * @param text - The new text.
 * @returns The record to store.
 */
function textAfterChange(
  item: ItemRecord,
  stored: TextRecord | undefined,
  text: string,
): TextRecord {
  const baseText = item.dirty
    ? (stored?.baseText ?? null)
    : item.rev > 0
      ? (stored?.text ?? null)
      : null;
  return { id: item.id, text, baseText };
}

/**
 * The hex SHA-256 of a file's bytes (PLAN 5.5, `meta.sha256`).
 *
 * @param bytes - The bytes, at most `MAX_FILE_BYTES`.
 * @returns 64 lowercase hex characters.
 * @throws RangeError for a file over the limit.
 */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new RangeError('file over the 7 MB limit');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
