/**
 * Unit tests for the name rules of PLAN 4.3 (`src/lib/vault/names.ts`) and the id format of
 * PLAN 5.5 (`src/lib/vault/ids.ts`).
 */

import { describe, expect, it } from 'vitest';
import { isId, newId } from '../../src/lib/vault/ids.ts';
import {
  clashes,
  exportName,
  freeName,
  nameProblem,
  normalizeName,
  suffixedName,
  validateName,
  type Sibling,
} from '../../src/lib/vault/names.ts';

const note = (id: string, name: string): Sibling => ({ id, name, kind: 'note' });
const folder = (id: string, name: string): Sibling => ({ id, name, kind: 'folder' });

describe('nameProblem (PLAN 4.3)', () => {
  it('accepts ordinary names, accents, other scripts and inner dots', () => {
    for (const name of ['plan', 'Ação de graças', 'ノート', 'v1.2 notes', 'a b', '200 € budget']) {
      expect(nameProblem(normalizeName(name), 'note'), name).toBeNull();
    }
  });

  it.each(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])('rejects the character %s', (c) => {
    expect(nameProblem(`a${c}b`, 'note')).toBe('forbidden-character');
  });

  it('rejects control characters, empty names, trailing dots and spaces, dot names', () => {
    expect(nameProblem('a\u0001b', 'note')).toBe('control-character');
    expect(nameProblem('a\tb', 'folder')).toBe('control-character');
    expect(nameProblem('', 'note')).toBe('empty');
    expect(nameProblem('   ', 'note')).toBe('empty');
    expect(nameProblem('plan.', 'note')).toBe('trailing-dot-or-space');
    expect(nameProblem('plan ', 'folder')).toBe('trailing-dot-or-space');
    expect(nameProblem('.obsidian', 'folder')).toBe('dot-name');
  });

  it('rejects reserved Windows names, also with an extension and in any case', () => {
    for (const name of ['CON', 'prn', 'Aux', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9', 'con.txt']) {
      expect(nameProblem(name, 'folder'), name).toBe('reserved');
    }
    // A note "con" exports as "con.md", which Windows also refuses.
    expect(nameProblem('con', 'note')).toBe('reserved');
    expect(nameProblem('COM10', 'note')).toBeNull();
    expect(nameProblem('console', 'note')).toBeNull();
  });

  it('allows 200 characters and refuses 201, counting characters not bytes', () => {
    expect(nameProblem('a'.repeat(200), 'note')).toBeNull();
    expect(nameProblem('a'.repeat(201), 'note')).toBe('too-long');
    expect(nameProblem('ç'.repeat(200), 'note')).toBeNull();
    expect(nameProblem('😀'.repeat(200), 'note')).toBeNull();
  });
});

describe('sibling clashes (PLAN 4.3)', () => {
  const siblings = [note('a', 'Plan'), folder('b', 'ideas')];

  it('names that differ only by case clash', () => {
    expect(validateName('plan', 'note', siblings)).toBe('sibling-clash');
    expect(validateName('IDEAS', 'folder', siblings)).toBe('sibling-clash');
  });

  it('a note and a folder of the same name do not clash (plan.md and plan/)', () => {
    expect(clashes('plan', 'folder', siblings)).toBe(false);
    expect(clashes('ideas', 'note', siblings)).toBe(false);
  });

  it('an item never clashes with itself, so a rename can change only the case', () => {
    expect(validateName('PLAN', 'note', siblings, 'a')).toBeNull();
  });

  it('composed and decomposed accents are the same name after normalisation', () => {
    const composed = 'ação';
    const decomposed = 'ação';
    expect(normalizeName(decomposed)).toBe(composed);
    expect(clashes(normalizeName(decomposed), 'note', [note('x', composed)])).toBe(true);
  });
});

describe('free names', () => {
  it('numbers new items like Obsidian: Untitled, Untitled 1, Untitled 2', () => {
    expect(freeName('Untitled', 'note', [])).toBe('Untitled');
    expect(freeName('Untitled', 'note', [note('a', 'Untitled')])).toBe('Untitled 1');
    expect(freeName('Untitled', 'note', [note('a', 'untitled'), note('b', 'Untitled 1')])).toBe(
      'Untitled 2',
    );
  });

  it('suffixes (2), (3) for restore and import, within the length limit', () => {
    expect(suffixedName('plan', 'note', [note('a', 'plan')])).toBe('plan (2)');
    expect(suffixedName('plan', 'note', [note('a', 'plan'), note('b', 'plan (2)')])).toBe(
      'plan (3)',
    );
    const long = 'x'.repeat(200);
    const result = suffixedName(long, 'note', [note('a', long)]);
    expect([...result].length).toBe(200);
    expect(result.endsWith(' (2)')).toBe(true);
  });

  it('exports notes with .md and other kinds as they are', () => {
    expect(exportName('plan', 'note')).toBe('plan.md');
    expect(exportName('ideas', 'folder')).toBe('ideas');
    expect(exportName('map.png', 'file')).toBe('map.png');
  });
});

describe('ids (PLAN 5.5)', () => {
  it('are 20 characters of lowercase base 36, time first', () => {
    const id = newId(Date.UTC(2026, 10, 20));
    expect(isId(id)).toBe(true);
    expect(id.slice(0, 9)).toBe(Date.UTC(2026, 10, 20).toString(36).padStart(9, '0'));
  });

  it('later creation times sort later', () => {
    expect(newId(1000) < newId(2000)).toBe(true);
  });

  it('do not repeat', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId(5)));
    expect(ids.size).toBe(10_000);
  });
});
