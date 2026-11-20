/**
 * Unit tests for reading settings safely (`src/lib/settings/schema.ts`, PLAN 4.9, 4.13, 5.5), the
 * font fallback of PLAN 4.9, the workspace model (`src/lib/workspace/model.ts`, PLAN 4.6), the
 * device name (PLAN 4.5) and the word count.
 */

import { describe, expect, it } from 'vitest';
import { countWords } from '../../src/lib/editor/words.ts';
import { browserName, operatingSystem } from '../../src/lib/device.ts';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
} from '../../src/lib/settings/schema.ts';
import { noteFont } from '../../src/lib/settings/fonts.ts';
import {
  activeTab,
  closeMissing,
  closeTab,
  emptyWorkspace,
  findTab,
  openNote,
  parseWorkspace,
} from '../../src/lib/workspace/model.ts';

describe('settings (PLAN 4.9, 4.13)', () => {
  it('a missing or damaged settings item reads as the defaults', () => {
    expect(parseSettings(null).settings).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json').settings).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]').settings).toEqual(DEFAULT_SETTINGS);
  });

  it('a value out of range or of the wrong type reads as its default', () => {
    const { settings } = parseSettings(
      JSON.stringify({ fontSize: 99, lineHeight: '2', trashDays: 3, weekChip: 'yes' }),
    );
    expect(settings.fontSize).toBe(16);
    expect(settings.lineHeight).toBe(1.6);
    expect(settings.trashDays).toBe(30);
    expect(settings.weekChip).toBe(true);
  });

  it('keeps keys from a newer version and writes them back (PLAN 5.5)', () => {
    const stored = parseSettings(JSON.stringify({ fontSize: 18, futureSetting: { a: 1 } }));
    expect(stored.settings.fontSize).toBe(18);
    expect(JSON.parse(serializeSettings(stored))).toMatchObject({
      fontSize: 18,
      futureSetting: { a: 1 },
    });
  });

  it('an unknown font id draws as Inter without changing the setting (PLAN 4.9)', () => {
    expect(noteFont('literata-2030').id).toBe('inter');
    expect(parseSettings(JSON.stringify({ noteFont: 'literata-2030' })).settings.noteFont).toBe(
      'literata-2030',
    );
  });
});

describe('workspace (PLAN 4.6)', () => {
  it('opens a note in the current tab, or focuses the tab it already has', () => {
    let ws = openNote(emptyWorkspace(), 'a');
    ws = openNote(ws, 'b');
    expect(ws.panes[0]?.tabs.map((t) => t.itemId)).toEqual(['b']);
    ws = openNote(ws, 'c', { newTab: true });
    ws = openNote(ws, 'b');
    expect(ws.panes[0]?.tabs.map((t) => t.itemId)).toEqual(['b', 'c']);
    expect(activeTab(ws)?.itemId).toBe('b');
  });

  it('closing a tab activates its right neighbour, else its left', () => {
    let ws = openNote(emptyWorkspace(), 'a');
    ws = openNote(ws, 'b', { newTab: true });
    ws = openNote(ws, 'c', { newTab: true });
    ws = openNote(ws, 'b');
    ws = closeTab(ws, findTab(ws, 'b')!.tab.id);
    expect(activeTab(ws)?.itemId).toBe('c');
    ws = closeTab(ws, findTab(ws, 'c')!.tab.id);
    expect(activeTab(ws)?.itemId).toBe('a');
  });

  it('closes the tabs of notes that are gone, and forgets only folders that no longer exist', () => {
    let ws = openNote(emptyWorkspace(), 'gone');
    ws = { ...ws, expanded: ['trashed', 'purged'] };
    const { workspace, closed } = closeMissing(
      ws,
      () => false,
      (id) => id === 'trashed',
    );
    expect(closed.map((t) => t.itemId)).toEqual(['gone']);
    expect(workspace.panes[0]?.tabs).toEqual([]);
    expect(workspace.expanded).toEqual(['trashed']);
  });

  it('reads a damaged stored workspace as an empty one', () => {
    expect(parseWorkspace('nonsense').panes).toHaveLength(1);
    expect(parseWorkspace({ panes: [] }).panes).toHaveLength(1);
    const ws = parseWorkspace({
      panes: [{ tabs: [{ itemId: 'x', cursor: 'bad' }], active: null }],
      sidebarWidth: 9999,
    });
    expect(ws.panes[0]?.tabs[0]).toMatchObject({ itemId: 'x', cursor: 0, mode: 'preview' });
    expect(ws.sidebarWidth).toBe(480);
  });
});

describe('device name (PLAN 4.5)', () => {
  const nav = (ua: string, extra: object = {}): Navigator =>
    ({ userAgent: ua, ...extra }) as unknown as Navigator;

  it('names the operating system', () => {
    expect(operatingSystem(nav('Mozilla/5.0 (X11; Linux x86_64)'))).toBe('Linux');
    expect(operatingSystem(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'))).toBe('Windows');
  });

  it('recognises Brave, which hides its name from the user agent', async () => {
    const brave = nav('Chrome/158', { brave: { isBrave: () => Promise.resolve(true) } });
    expect(await browserName(brave)).toBe('Brave');
    expect(await browserName(nav('Mozilla/5.0 Chrome/158 Safari/537.36'))).toBe('Chrome');
    expect(await browserName(nav('Mozilla/5.0 Chrome/158 Edg/158'))).toBe('Edge');
  });
});

describe('word count', () => {
  it('counts words, not Markdown markers', () => {
    expect(countWords('# Title\n\n- **bold** and *ação*\n> d’água')).toBe(5);
    expect(countWords('')).toBe(0);
    expect(countWords("don't stop")).toBe(2);
  });
});
