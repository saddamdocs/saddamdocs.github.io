/**
 * Unit tests for image links (`src/lib/vault/links.ts`, PLAN 4.3): finding them, looking them up,
 * and rewriting them when a note moves.
 */

import { describe, expect, it } from 'vitest';
import type { ItemKind, ItemRecord } from '../../src/lib/store/schema.ts';
import {
  findImageLinks,
  relativePath,
  renameLinkTargets,
  resolveImage,
  rewriteLinksForMove,
} from '../../src/lib/vault/links.ts';
import { VaultIndex } from '../../src/lib/vault/tree.ts';

function rec(id: string, kind: ItemKind, name: string, parent = ''): ItemRecord {
  return {
    id,
    kind,
    name,
    parent,
    created: 0,
    updated: 0,
    device: 't',
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
  };
}

// ideas/            ideas/plan.md, ideas/map.png, ideas/attachments/chart.png
// notes/deep/       notes/deep/other.png
// unique.png (root), two "dup.png" in different folders
const index = new VaultIndex([
  rec('ideas', 'folder', 'ideas'),
  rec('plan', 'note', 'plan', 'ideas'),
  rec('map', 'file', 'map.png', 'ideas'),
  rec('att', 'folder', 'attachments', 'ideas'),
  rec('chart', 'file', 'chart.png', 'att'),
  rec('notes', 'folder', 'notes'),
  rec('deep', 'folder', 'deep', 'notes'),
  rec('other', 'file', 'my image (1).png', 'deep'),
  rec('unique', 'file', 'unique.png'),
  rec('dupA', 'file', 'dup.png', 'ideas'),
  rec('dupB', 'file', 'dup.png', 'notes'),
]);

describe('finding links', () => {
  it('finds ![alt](path), angle brackets and titles, but not inside code', () => {
    const text =
      '![a](map.png) ![b](<my file.png>) ![c](x.png "title")\n`![no](code.png)`\n```\n![no](fence.png)\n```\n';
    expect(findImageLinks(text).map((l) => l.path)).toEqual(['map.png', 'my file.png', 'x.png']);
    const first = findImageLinks(text)[0]!;
    expect(text.slice(first.from, first.to)).toBe('map.png');
  });
});

describe('looking up (PLAN 4.3)', () => {
  it("looks up from the note's folder first, with subfolders and ..", () => {
    expect(resolveImage(index, 'ideas', 'map.png')?.id).toBe('map');
    expect(resolveImage(index, 'ideas', 'attachments/chart.png')?.id).toBe('chart');
    expect(resolveImage(index, 'att', '../map.png')?.id).toBe('map');
    expect(resolveImage(index, 'ideas', '../notes/deep/my%20image%20%281%29.png')?.id).toBe(
      'other',
    );
  });

  it('falls back to the one file of that name anywhere, and only when there is exactly one', () => {
    expect(resolveImage(index, 'notes', 'unique.png')?.id).toBe('unique');
    expect(resolveImage(index, 'deep', 'chart.png')?.id).toBe('chart');
    expect(resolveImage(index, 'deep', 'dup.png')).toBeNull();
    expect(resolveImage(index, 'ideas', 'dup.png')?.id).toBe('dupA');
  });

  it('ignores the internet and absolute paths', () => {
    expect(resolveImage(index, '', 'https://example.com/map.png')).toBeNull();
    expect(resolveImage(index, '', '/map.png')).toBeNull();
    expect(resolveImage(index, '', 'data:image/png;base64,AAAA')).toBeNull();
  });
});

describe('moving a note rewrites its links (PLAN 4.3)', () => {
  it('points every link at the same file from the new folder', () => {
    const text = '![](map.png) and ![chart](attachments/chart.png "t")';
    expect(rewriteLinksForMove(index, text, 'ideas', 'deep')).toBe(
      '![](../../ideas/map.png) and ![chart](../../ideas/attachments/chart.png "t")',
    );
    expect(rewriteLinksForMove(index, text, 'ideas', '')).toBe(
      '![](ideas/map.png) and ![chart](ideas/attachments/chart.png "t")',
    );
  });

  it('leaves missing images and links that still resolve alone', () => {
    const text = '![](missing.png) ![](unique.png)';
    expect(rewriteLinksForMove(index, text, 'ideas', 'deep')).toBe(text);
  });

  it('encodes spaces and parentheses in rewritten paths', () => {
    expect(relativePath(index, 'ideas', index.get('other')!)).toBe(
      '../notes/deep/my%20image%20%281%29.png',
    );
  });

  it('round-trips: moving back restores the original paths', () => {
    const text = '![](map.png)';
    const moved = rewriteLinksForMove(index, text, 'ideas', 'deep');
    expect(rewriteLinksForMove(index, moved, 'deep', 'ideas')).toBe('![](map.png)');
  });
});

describe('import renames', () => {
  it('updates links to an image that import had to rename (PLAN 4.15)', () => {
    const renames = new Map([['a:b.png', 'a_b.png']]);
    expect(renameLinkTargets('![](img/a:b.png) ![](other.png)', renames)).toBe(
      '![](img/a_b.png) ![](other.png)',
    );
  });
});
