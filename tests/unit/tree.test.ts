/**
 * Unit tests for `src/lib/vault/tree.ts`: order, paths, the Trash, orphans and loops (PLAN 4.3).
 */

import { describe, expect, it } from 'vitest';
import type { ItemKind, ItemRecord } from '../../src/lib/store/schema.ts';
import { VaultIndex } from '../../src/lib/vault/tree.ts';

/** A record with defaults for everything a test does not care about. */
function rec(
  id: string,
  kind: ItemKind,
  name: string,
  parent = '',
  extra: Partial<ItemRecord> = {},
): ItemRecord {
  return {
    id,
    kind,
    name,
    parent,
    created: 0,
    updated: 0,
    device: 'test',
    deleted: false,
    deletedAt: null,
    mime: null,
    sha256: null,
    extra: {},
    size: 0,
    gone: false,
    rev: 0,
    ts: null,
    dirty: true,
    dirtySince: 0,
    seq: 1,
    base: null,
    unreadable: false,
    ...extra,
  };
}

const names = (index: VaultIndex, expanded: string[] = [], files = false): string[] =>
  index.rows(new Set(expanded), files).map((r) => `${'  '.repeat(r.depth)}${r.item.name}`);

describe('order (PLAN 4.3)', () => {
  it('lists folders first, then notes, in natural case-insensitive order', () => {
    const index = new VaultIndex([
      rec('n10', 'note', 'note 10'),
      rec('n2', 'note', 'note 2'),
      rec('nb', 'note', 'b'),
      rec('nA', 'note', 'A'),
      rec('fz', 'folder', 'zeta'),
      rec('fa', 'folder', 'Alpha'),
    ]);
    expect(names(index)).toEqual(['Alpha', 'zeta', 'A', 'b', 'note 2', 'note 10']);
  });

  it('shows children of expanded folders only, and files only when asked', () => {
    const index = new VaultIndex([
      rec('f', 'folder', 'ideas'),
      rec('n', 'note', 'plan', 'f'),
      rec('i', 'file', 'map.png', 'f'),
    ]);
    expect(names(index)).toEqual(['ideas']);
    expect(names(index, ['f'])).toEqual(['ideas', '  plan']);
    expect(names(index, ['f'], true)).toEqual(['ideas', '  plan', '  map.png']);
    expect(index.rows(new Set(), false)[0]?.hasChildren).toBe(true);
  });

  it('marks siblings with the same name ignoring case', () => {
    const index = new VaultIndex([
      rec('a', 'note', 'Plan'),
      rec('b', 'note', 'plan'),
      rec('c', 'note', 'x'),
    ]);
    expect(index.rows(new Set(), false).map((r) => r.sameName)).toEqual([true, true, false]);
  });
});

describe('paths (PLAN 4.3)', () => {
  const index = new VaultIndex([
    rec('f1', 'folder', 'ideas'),
    rec('f2', 'folder', 'drafts', 'f1'),
    rec('n1', 'note', 'talk', 'f2'),
    rec('i1', 'file', 'map.png', 'f1'),
  ]);

  it('are computed from names, with .md for notes', () => {
    expect(index.path('n1')).toBe('ideas/drafts/talk.md');
    expect(index.path('f2')).toBe('ideas/drafts');
    expect(index.path('i1')).toBe('ideas/map.png');
  });

  it('are found ignoring letter case', () => {
    expect(index.findByPath('IDEAS/Drafts/TALK.md')?.id).toBe('n1');
    expect(index.findByPath('ideas/nothing.md')).toBeUndefined();
  });
});

describe('the Trash (PLAN 4.3)', () => {
  const index = new VaultIndex([
    rec('f1', 'folder', 'old', '', { deleted: true, deletedAt: 200 }),
    rec('f2', 'folder', 'inner', 'f1'),
    rec('n1', 'note', 'a', 'f2'),
    rec('n2', 'note', 'b', 'f1', { deleted: true, deletedAt: 100 }),
    rec('n3', 'note', 'loose', '', { deleted: true, deletedAt: 300 }),
    rec('n4', 'note', 'live'),
  ]);

  it('an item is in the Trash when marked itself or inside a deleted folder', () => {
    expect(index.inTrash('f1')).toBe(true);
    expect(index.inTrash('n1')).toBe(true);
    expect(index.inTrash('n3')).toBe(true);
    expect(index.inTrash('n4')).toBe(false);
    expect(index.isLive('n1')).toBe(false);
    expect(names(index, ['f1', 'f2'])).toEqual(['live']);
  });

  it('lists one entry per deleted folder with its count, newest first', () => {
    const entries = index.trashEntries().map((e) => `${e.item.name}:${String(e.contains)}`);
    expect(entries).toEqual(['loose:0', 'old:3']);
  });

  it("lists a folder's contents deepest first, for purging", () => {
    expect(index.descendantsDeepestFirst('f1').map((i) => i.id)).toEqual(['n1', 'f2', 'n2']);
  });
});

describe('robustness', () => {
  it('shows an item whose parent is unknown or gone at the root', () => {
    const index = new VaultIndex([
      rec('n1', 'note', 'orphan', 'missing0000000000000'),
      rec('f1', 'folder', 'purged', '', { gone: true }),
      rec('n2', 'note', 'left', 'f1'),
    ]);
    expect(names(index)).toEqual(['left', 'orphan']);
  });

  it("never loops when two folders are each other's parent", () => {
    const index = new VaultIndex([rec('a', 'folder', 'A', 'b'), rec('b', 'folder', 'B', 'a')]);
    expect(index.ancestors('a').length).toBeLessThanOrEqual(2);
    expect(index.path('a').length).toBeGreaterThan(0);
    expect(index.rows(new Set(['a', 'b']), false).length).toBeLessThanOrEqual(4);
  });

  it('leaves the settings item out of the tree', () => {
    const index = new VaultIndex([rec('settings000000000000', 'settings', 'settings')]);
    expect(names(index)).toEqual([]);
  });
});
