/**
 * Unit tests for the vault's operations (`src/lib/vault/operations.ts`) on an in-memory IndexedDB
 * (fake-indexeddb): create, rename, move, duplicate, the Trash with Undo and restore, delete
 * forever with folders, the local purge, saving text, and the sync bookkeeping of PLAN 5.3.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openVault, type VaultDb } from '../../src/lib/store/db.ts';
import { Vault } from '../../src/lib/vault/operations.ts';

let db: VaultDb;
let vault: Vault;
let now: number;
let dbCount = 0;

/** Unwraps an operation result, failing the test when it was refused. */
function ok<T>(result: { ok: true; value: T } | { ok: false; problem: string }): T {
  if (!result.ok) throw new Error(`refused: ${result.problem}`);
  return result.value;
}

/** Names as the tree shows them with every folder expanded. */
function tree(): string[] {
  const folders = new Set(
    [...vault.index.byId.values()].filter((i) => i.kind === 'folder').map((i) => i.id),
  );
  return vault.index.rows(folders, false).map((r) => `${'  '.repeat(r.depth)}${r.item.name}`);
}

beforeEach(async () => {
  dbCount += 1;
  const opened = await openVault(`test-vault-${String(dbCount)}`);
  if (opened.kind !== 'ok') throw new Error(opened.kind);
  db = opened.db;
  now = Date.UTC(2026, 10, 20, 12);
  vault = await Vault.load(
    db,
    () => 'Linux · Brave',
    () => now,
  );
});

describe('create', () => {
  it('names new notes Untitled, Untitled 1… and folders the same way', async () => {
    const a = ok(await vault.createNote(''));
    const b = ok(await vault.createNote(''));
    const f = ok(await vault.createFolder(''));
    expect([a.name, b.name, f.name]).toEqual(['Untitled', 'Untitled 1', 'Untitled']);
    expect(await vault.readText(a.id)).toBe('');
  });

  it('marks a new item dirty, never uploaded, seq 1, with no base (PLAN 5.3)', async () => {
    const note = ok(await vault.createNote(''));
    expect(note).toMatchObject({
      rev: 0,
      ts: null,
      dirty: true,
      dirtySince: now,
      seq: 1,
      base: null,
    });
    expect(note.device).toBe('Linux · Brave');
  });

  it('nests folders to any depth', async () => {
    let parent = '';
    for (let depth = 0; depth < 6; depth += 1)
      parent = ok(await vault.createFolder(parent, `level ${String(depth)}`)).id;
    ok(await vault.createNote(parent, 'deep'));
    expect(vault.index.path(vault.index.liveChildren(parent)[0]?.id ?? '')).toBe(
      'level 0/level 1/level 2/level 3/level 4/level 5/deep.md',
    );
  });

  it('refuses to create inside a note or a deleted folder', async () => {
    const note = ok(await vault.createNote(''));
    expect(await vault.createNote(note.id)).toEqual({ ok: false, problem: 'not-a-folder' });
    const folder = ok(await vault.createFolder(''));
    ok(await vault.delete(folder.id));
    expect(await vault.createNote(folder.id)).toEqual({ ok: false, problem: 'not-a-folder' });
  });

  it('survives a reload: everything is in IndexedDB', async () => {
    const folder = ok(await vault.createFolder('', 'ideas'));
    ok(await vault.createNote(folder.id, 'plan'));
    const again = await Vault.load(db, () => 'x');
    expect(again.index.path(again.index.liveChildren(folder.id)[0]?.id ?? '')).toBe(
      'ideas/plan.md',
    );
  });
});

describe('rename', () => {
  it('applies the name rules and the sibling rule', async () => {
    const a = ok(await vault.createNote('', 'plan'));
    ok(await vault.createNote('', 'other'));
    expect(await vault.rename(a.id, 'a:b')).toEqual({ ok: false, problem: 'forbidden-character' });
    expect(await vault.rename(a.id, 'OTHER')).toEqual({ ok: false, problem: 'sibling-clash' });
    expect(ok(await vault.rename(a.id, 'Plan')).name).toBe('Plan');
  });

  it('raises seq and keeps the oldest dirtySince', async () => {
    const a = ok(await vault.createNote('', 'plan'));
    now += 1000;
    const renamed = ok(await vault.rename(a.id, 'plan 2'));
    expect(renamed.seq).toBe(2);
    expect(renamed.dirtySince).toBe(a.dirtySince);
    expect(renamed.updated).toBe(now);
  });

  it('renaming a folder changes every path below it in one change', async () => {
    const f = ok(await vault.createFolder('', 'ideas'));
    const n = ok(await vault.createNote(f.id, 'plan'));
    ok(await vault.rename(f.id, 'thoughts'));
    expect(vault.index.path(n.id)).toBe('thoughts/plan.md');
    expect(vault.index.get(n.id)?.seq).toBe(1);
  });
});

describe('move', () => {
  it('moves notes and folders, and refuses loops and clashes', async () => {
    const a = ok(await vault.createFolder('', 'a'));
    const b = ok(await vault.createFolder(a.id, 'b'));
    const n = ok(await vault.createNote('', 'plan'));
    ok(await vault.move(n.id, b.id));
    expect(vault.index.path(n.id)).toBe('a/b/plan.md');
    expect(await vault.move(a.id, b.id)).toEqual({ ok: false, problem: 'into-itself' });
    expect(await vault.move(a.id, a.id)).toEqual({ ok: false, problem: 'into-itself' });
    ok(await vault.createNote('', 'plan'));
    expect(await vault.move(n.id, '')).toEqual({ ok: false, problem: 'sibling-clash' });
  });

  it('can be undone', async () => {
    const f = ok(await vault.createFolder('', 'f'));
    const n = ok(await vault.createNote('', 'plan'));
    const token = ok(await vault.move(n.id, f.id));
    await vault.undo(token);
    expect(vault.index.path(n.id)).toBe('plan.md');
  });
});

describe('duplicate', () => {
  it("copies a note's text beside it, named like Obsidian", async () => {
    const n = ok(await vault.createNote('', 'plan'));
    await vault.saveText(n.id, 'hello');
    const copy = ok(await vault.duplicate(n.id));
    expect(copy.name).toBe('plan 1');
    expect(copy.id).not.toBe(n.id);
    expect(await vault.readText(copy.id)).toBe('hello');
  });

  it('does not duplicate folders', async () => {
    const f = ok(await vault.createFolder('', 'f'));
    expect(await vault.duplicate(f.id)).toEqual({ ok: false, problem: 'not-a-note' });
  });
});

describe('the Trash (PLAN 4.3)', () => {
  it('deleting a folder marks only the folder and hides its contents', async () => {
    const f = ok(await vault.createFolder('', 'old'));
    const n = ok(await vault.createNote(f.id, 'inside'));
    ok(await vault.delete(f.id));
    expect(vault.index.get(f.id)?.deleted).toBe(true);
    expect(vault.index.get(n.id)?.deleted).toBe(false);
    expect(vault.index.inTrash(n.id)).toBe(true);
    expect(tree()).toEqual([]);
  });

  it('Undo brings a deletion back', async () => {
    const n = ok(await vault.createNote('', 'plan'));
    const token = ok(await vault.delete(n.id));
    await vault.undo(token);
    expect(tree()).toEqual(['plan']);
    expect(vault.index.get(n.id)).toMatchObject({ deleted: false, deletedAt: null, seq: 3 });
  });

  it('restore puts an item back in its folder', async () => {
    const f = ok(await vault.createFolder('', 'ideas'));
    const n = ok(await vault.createNote(f.id, 'plan'));
    ok(await vault.delete(n.id));
    ok(await vault.restore(n.id));
    expect(vault.index.path(n.id)).toBe('ideas/plan.md');
  });

  it('restore recreates a folder that is no longer live under the root', async () => {
    const f = ok(await vault.createFolder('', 'ideas'));
    const n = ok(await vault.createNote(f.id, 'plan'));
    ok(await vault.delete(n.id));
    ok(await vault.delete(f.id));
    ok(await vault.restore(n.id));
    expect(tree()).toEqual(['ideas', '  plan']);
    expect(vault.index.parentOf(vault.index.get(n.id)!)).not.toBe(f.id);
  });

  it('restore renames with (2) when the name is taken', async () => {
    const n = ok(await vault.createNote('', 'plan'));
    ok(await vault.delete(n.id));
    ok(await vault.createNote('', 'plan'));
    expect(ok(await vault.restore(n.id)).name).toBe('plan (2)');
  });

  it('deleting a folder forever takes its contents, and nothing reappears', async () => {
    const f = ok(await vault.createFolder('', 'old'));
    const g = ok(await vault.createFolder(f.id, 'inner'));
    const n = ok(await vault.createNote(g.id, 'a'));
    ok(await vault.delete(f.id));
    expect(await vault.deleteForever([f.id])).toBe(3);
    expect(vault.index.get(n.id)).toBeUndefined();
    expect(await db.get('texts', n.id)).toBeUndefined();
    expect(tree()).toEqual([]);
    expect(vault.index.trashEntries()).toEqual([]);
  });

  it('an item that was uploaded keeps a local tombstone (PLAN 5.5)', async () => {
    const n = ok(await vault.createNote('', 'synced'));
    await db.put('items', { ...n, rev: 3, dirty: false, dirtySince: null, ts: 1 });
    const reloaded = await Vault.load(
      db,
      () => 'x',
      () => now,
    );
    ok(await reloaded.delete(n.id));
    await reloaded.deleteForever([n.id]);
    expect(reloaded.index.get(n.id)).toMatchObject({ gone: true, dirty: true, rev: 3 });
    expect(await db.get('texts', n.id)).toBeUndefined();
  });

  it('Empty Trash deletes every entry', async () => {
    ok(await vault.delete(ok(await vault.createNote('', 'a')).id));
    ok(await vault.delete(ok(await vault.createFolder('', 'b')).id));
    expect(await vault.emptyTrash()).toBe(2);
    expect(vault.index.trashEntries()).toEqual([]);
  });

  it('purges entries older than the limit by the device clock when sync is off', async () => {
    const old = ok(await vault.createNote('', 'old'));
    ok(await vault.delete(old.id));
    now += 20 * 86_400_000;
    const recent = ok(await vault.createNote('', 'recent'));
    ok(await vault.delete(recent.id));
    now += 11 * 86_400_000;
    expect(await vault.purgeExpired(30)).toBe(1);
    expect(vault.index.get(old.id)).toBeUndefined();
    expect(vault.index.get(recent.id)?.deleted).toBe(true);
  });
});

describe('saving text (PLAN 4.4)', () => {
  it('writes text, size and the dirty mark together, and skips an unchanged text', async () => {
    const n = ok(await vault.createNote('', 'plan'));
    expect(await vault.saveText(n.id, 'ação')).toBe(true);
    expect(vault.index.get(n.id)).toMatchObject({ size: 6, seq: 2, dirty: true });
    expect(await vault.saveText(n.id, 'ação')).toBe(false);
    expect(vault.index.get(n.id)?.seq).toBe(2);
  });

  it('keeps the base text of a synced note on its first change (PLAN 5.3)', async () => {
    const n = ok(await vault.createNote('', 'plan'));
    await vault.saveText(n.id, 'synced text');
    await db.put('items', {
      ...vault.index.get(n.id)!,
      rev: 1,
      dirty: false,
      dirtySince: null,
      base: null,
    });
    const reloaded = await Vault.load(
      db,
      () => 'x',
      () => now,
    );
    await reloaded.saveText(n.id, 'edited');
    await reloaded.saveText(n.id, 'edited twice');
    expect(await db.get('texts', n.id)).toMatchObject({
      text: 'edited twice',
      baseText: 'synced text',
    });
    expect(reloaded.index.get(n.id)?.base?.name).toBe('plan');
  });
});

describe('image links follow a moved note (PLAN 4.3)', () => {
  it('rewrites links in the move, and Undo rewrites them back, keeping later edits', async () => {
    const ideas = ok(await vault.createFolder('', 'ideas'));
    const other = ok(await vault.createFolder('', 'other'));
    const [, note] = await vault.importItems(ideas.id, [
      {
        kind: 'file',
        name: 'map.png',
        parent: -1,
        bytes: new Uint8Array([1, 2, 3]),
        mime: 'image/png',
      },
      { kind: 'note', name: 'plan', parent: -1, text: 'See ![](map.png).' },
    ]);
    const token = ok(await vault.move(note!, other.id));
    expect(token.rewritten).toEqual([note]);
    expect(await vault.readText(note!)).toBe('See ![](../ideas/map.png).');
    await vault.saveText(note!, 'See ![](../ideas/map.png). More.');
    expect(await vault.undo(token)).toEqual([note]);
    expect(await vault.readText(note!)).toBe('See ![](map.png). More.');
  });

  it('a moved folder rewrites nothing', async () => {
    const ideas = ok(await vault.createFolder('', 'ideas'));
    const other = ok(await vault.createFolder('', 'other'));
    const [, note] = await vault.importItems(ideas.id, [
      { kind: 'file', name: 'map.png', parent: -1, bytes: new Uint8Array([1]), mime: 'image/png' },
      { kind: 'note', name: 'plan', parent: -1, text: '![](map.png)' },
    ]);
    const token = ok(await vault.move(ideas.id, other.id));
    expect(token.rewritten).toEqual([]);
    expect(await vault.readText(note!)).toBe('![](map.png)');
  });
});

describe('snapshots (PLAN 4.3)', () => {
  it('keeps at most one per 10 minutes, none for an unchanged text, and 20 at most', async () => {
    const n = ok(await vault.createNote('', 'plan'));
    expect(await vault.snapshot(n.id, 'v1', 'idle')).toBe(true);
    now += 9 * 60_000;
    expect(await vault.snapshot(n.id, 'v2', 'idle')).toBe(false);
    now += 60_000;
    expect(await vault.snapshot(n.id, 'v1', 'idle')).toBe(false);
    expect(await vault.snapshot(n.id, 'v2', 'close')).toBe(true);
    expect(await vault.snapshot(n.id, 'v3', 'merge', true)).toBe(true);
    for (let i = 0; i < 30; i += 1) {
      now += 10 * 60_000;
      await vault.snapshot(n.id, `t${String(i)}`, 'idle');
    }
    const list = await vault.listSnapshots(n.id);
    expect(list).toHaveLength(20);
    expect(list[0]?.text).toBe('t29');
    expect(list[19]?.text).toBe('t10');
  });

  it('deleting a note forever deletes its snapshots', async () => {
    const n = ok(await vault.createNote('', 'plan'));
    await vault.snapshot(n.id, 'v1', 'idle');
    await vault.deleteForever([n.id]);
    expect(await vault.listSnapshots(n.id)).toEqual([]);
  });
});

describe('import and batch delete (PLAN 4.15)', () => {
  it('creates folders, notes and files in one change, with the file hash', async () => {
    const ids = await vault.importItems('', [
      { kind: 'folder', name: 'ideas', parent: -1 },
      { kind: 'folder', name: 'empty', parent: 0 },
      { kind: 'note', name: 'plan', parent: 0, text: 'olá' },
      {
        kind: 'file',
        name: 'a.png',
        parent: 0,
        bytes: new TextEncoder().encode('abc'),
        mime: 'image/png',
      },
    ]);
    expect(tree()).toEqual(['ideas', '  empty', '  plan']);
    const file = vault.index.get(ids[3]!);
    expect(file?.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await (await vault.readFile(ids[3]!))?.text()).toBe('abc');
    await vault.deleteMany([ids[0]!]);
    expect(tree()).toEqual([]);
  });
});
