/**
 * Unit tests for plain Markdown in and out (PLAN 4.15, R12): the export layout, the import rules
 * against the fixtures of PLAN 8, the round trip byte for byte, and the export reminder.
 */

import 'fake-indexeddb/auto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { openVault } from '../../src/lib/store/db.ts';
import { planExport, readExport } from '../../src/lib/transfer/exportZip.ts';
import { fixName, planImport, type SourceFile } from '../../src/lib/transfer/importFiles.ts';
import { DAY_MS, reminderDue } from '../../src/lib/transfer/reminder.ts';
import { unzipEntries, zipEntries, type ZipEntries } from '../../src/lib/transfer/zipCore.ts';
import { Vault } from '../../src/lib/vault/operations.ts';

const FIXTURES = fileURLToPath(new URL('../fixtures/import/', import.meta.url));

/** Reads the fixture folder as an import would see a picked folder. */
function fixtureFolder(): SourceFile[] {
  const base = join(FIXTURES, 'source');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) =>
      statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)],
    );
  return walk(base).map((full) => ({
    path: relative(base, full),
    bytes: new Uint8Array(readFileSync(full)),
  }));
}

/** Reads the fixture archive as an import would. */
function fixtureZip(): SourceFile[] {
  const entries = unzipEntries(new Uint8Array(readFileSync(join(FIXTURES, 'source.zip'))));
  return Object.entries(entries).map(([path, bytes]) => ({ path, bytes }));
}

let count = 0;
async function newVault(): Promise<Vault> {
  count += 1;
  const opened = await openVault(`transfer-${String(count)}`);
  if (opened.kind !== 'ok') throw new Error(opened.kind);
  return Vault.load(opened.db, () => 'test');
}

/** Exports a vault to archive entries, the way the app does. */
async function exportAll(vault: Vault, includeTrash = false): Promise<ZipEntries> {
  const { entries } = await readExport(vault, planExport(vault.index, '', includeTrash));
  return unzipEntries(zipEntries(entries));
}

/** Imports sources into a vault, the way the app does. */
async function importInto(vault: Vault, sources: SourceFile[], target = '') {
  const plan = planImport(sources, vault.index, target);
  await vault.importItems(target, plan.items);
  return plan.report;
}

const text = (bytes: Uint8Array | undefined): string => new TextDecoder().decode(bytes);

let vault: Vault;
beforeEach(async () => {
  vault = await newVault();
});

describe('import of the fixture folder (PLAN 4.15, 8)', () => {
  it('keeps the structure, converts CRLF, drops the BOM, and skips what it must', async () => {
    const report = await importInto(vault, fixtureFolder());
    const out = await exportAll(vault);
    expect(Object.keys(out).sort()).toEqual([
      'Notas/',
      'Notas/Ação e coração.md',
      'Notas/bom.md',
      'Notas/crlf.md',
      'Notas/empty/',
      'Notas/sub/',
      'Notas/sub/deep/',
      'Notas/sub/deep/deeper/',
      'Notas/sub/deep/deeper/deepest/',
      'Notas/sub/deep/deeper/deepest/five.md',
      'Notas/with images.md',
      'Notas/日本語のノート.md',
      'README.md',
      'images/',
      'images/anim.gif',
      'images/img.png',
      'images/logo.svg',
      'images/photo.jpg',
      'images/pic.webp',
    ]);
    expect(text(out['Notas/crlf.md'])).toBe(
      '# Windows line endings\n\nFirst line.\nSecond line.\n',
    );
    expect(text(out['Notas/bom.md'])).toBe('Starts with a byte-order mark.\n');
    expect(out['images/img.png']).toEqual(
      new Uint8Array(readFileSync(join(FIXTURES, 'source/images/img.png'))),
    );
    expect(report.skipped.sort((a, b) => (a.path < b.path ? -1 : 1))).toEqual([
      { path: '.obsidian/', reason: 'hidden' },
      { path: '.trash/', reason: 'hidden' },
      { path: 'Notas/empty/.gitkeep', reason: 'hidden' },
      { path: 'Notas/latin1.md', reason: 'not-utf8' },
      { path: 'doc.pdf', reason: 'unsupported' },
      { path: 'notes.txt', reason: 'unsupported' },
    ]);
    expect(report).toMatchObject({ notes: 7, files: 5, folders: 7, renamed: [] });
  });

  it('fixes names that break the rules, and links follow a renamed image', async () => {
    const report = await importInto(vault, fixtureZip());
    const out = await exportAll(vault);
    expect(Object.keys(out)).toEqual(
      expect.arrayContaining([
        'Bad names/what_.md',
        'Bad names/CON_.md',
        'Bad names/trailing dot_.md',
        'Bad names/a_b.png',
        'Notas/PLAN.md',
        'Notas/plan (2).md',
      ]),
    );
    expect(text(out['Bad names/links to it.md'])).toBe('![](a_b.png)\n');
    expect(report.renamed).toEqual(
      expect.arrayContaining([
        { from: 'Bad names/what?.md', to: 'what_.md' },
        { from: 'Bad names/a:b.png', to: 'a_b.png' },
        { from: 'Notas/plan.md', to: 'plan (2).md' },
      ]),
    );
    expect(report.skipped).toContainEqual({ path: '.git/', reason: 'hidden' });
  });

  it('gives an existing path (2) and changes nothing existing', async () => {
    await importInto(vault, [{ path: 'ideas/plan.md', bytes: new TextEncoder().encode('first') }]);
    const report = await importInto(vault, [
      { path: 'ideas/plan.md', bytes: new TextEncoder().encode('second') },
    ]);
    const out = await exportAll(vault);
    expect(text(out['ideas/plan.md'])).toBe('first');
    expect(text(out['ideas (2)/plan.md'])).toBe('second');
    expect(report.renamed).toEqual([{ from: 'ideas', to: 'ideas (2)' }]);
  });

  it('skips an image over 7 MB', async () => {
    const report = await importInto(vault, [
      { path: 'huge.png', bytes: new Uint8Array(7_000_001) },
    ]);
    expect(report.skipped).toEqual([{ path: 'huge.png', reason: 'too-large' }]);
  });

  it('fixName gives the nearest valid name', () => {
    expect(fixName('a<b>c', 'note')).toBe('a_b_c');
    expect(fixName('end. ', 'folder')).toBe('end__');
    expect(fixName('LPT1', 'folder')).toBe('LPT1_');
    expect(fixName('aux.png', 'file')).toBe('aux_.png');
    expect([...fixName('x'.repeat(250), 'note')]).toHaveLength(200);
  });
});

describe('export (PLAN 4.15)', () => {
  it('adds (2) to the later of two names that clash ignoring case', async () => {
    await vault.importItems('', [{ kind: 'note', name: 'Plan', parent: -1, text: 'a' }]);
    await vault.importItems('', [{ kind: 'note', name: 'plan', parent: -1, text: 'b' }]);
    const out = await exportAll(vault);
    expect(text(out['Plan.md'])).toBe('a');
    expect(text(out['plan (2).md'])).toBe('b');
  });

  it('leaves the Trash out unless asked, then puts it under .trash/', async () => {
    const [folder] = await vault.importItems('', [
      { kind: 'folder', name: 'old', parent: -1 },
      { kind: 'note', name: 'inside', parent: 0, text: 'x' },
    ]);
    await vault.delete(folder!);
    expect(Object.keys(await exportAll(vault))).toEqual([]);
    expect(Object.keys(await exportAll(vault, true)).sort()).toEqual([
      '.trash/',
      '.trash/old/',
      '.trash/old/inside.md',
    ]);
  });

  it('exports one folder with the folder at the top', async () => {
    const [folder] = await vault.importItems('', [
      { kind: 'folder', name: 'ideas', parent: -1 },
      { kind: 'note', name: 'plan', parent: 0, text: 'x' },
      { kind: 'note', name: 'outside', parent: -1, text: 'y' },
    ]);
    const { entries } = await readExport(vault, planExport(vault.index, folder!, false));
    expect(Object.keys(entries)).toEqual(['ideas/', 'ideas/plan.md']);
  });
});

describe('R12: export, then import into an empty vault, reproduces everything byte for byte', () => {
  it('holds for the fixtures, with nested and empty folders, accents and every image type', async () => {
    await importInto(vault, fixtureFolder());
    await importInto(vault, fixtureZip());
    const first = await exportAll(vault);
    const empty = await newVault();
    await importInto(
      empty,
      Object.entries(first).map(([path, bytes]) => ({ path, bytes })),
    );
    const second = await exportAll(empty);
    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort());
    for (const [path, bytes] of Object.entries(first)) expect(second[path], path).toEqual(bytes);
  });
});

describe('the export reminder (PLAN 4.15)', () => {
  const base = {
    now: 100 * DAY_MS,
    lastExport: 90 * DAY_MS,
    snoozedUntil: null,
    lastChange: 95 * DAY_MS,
    noteCount: 3,
    days: 7,
  };

  it('shows when the vault changed since an export older than the setting', () => {
    expect(reminderDue(base)).toBe(true);
    expect(reminderDue({ ...base, lastChange: 80 * DAY_MS })).toBe(false);
    expect(reminderDue({ ...base, lastExport: 95 * DAY_MS })).toBe(false);
  });

  it('waits a day after Later, and never with the setting at 0', () => {
    expect(reminderDue({ ...base, snoozedUntil: base.now + 1 })).toBe(false);
    expect(reminderDue({ ...base, days: 0 })).toBe(false);
  });

  it('counts a never-exported vault as overdue from ten notes', () => {
    expect(reminderDue({ ...base, lastExport: null, noteCount: 9 })).toBe(false);
    expect(reminderDue({ ...base, lastExport: null, noteCount: 10 })).toBe(true);
  });
});
