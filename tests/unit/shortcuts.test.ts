/**
 * Unit tests for the spike B shortcut table and matcher (`src/lib/probe/shortcuts.ts`), and a
 * check that the table follows the rules of PLAN 4.12.
 */

import { describe, expect, it } from 'vitest';
import { SHORTCUTS, matches, parseCombo, type Combo } from '../../src/lib/probe/shortcuts.ts';

/** A key press with the fields the matcher reads. */
function press(
  key: string,
  code: string,
  mods: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {},
): Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'> {
  return {
    key,
    code,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    metaKey: mods.meta ?? false,
  };
}

describe('parseCombo', () => {
  it('parses letters, punctuation and named keys', () => {
    expect(parseCombo('Ctrl+Shift+\\')).toMatchObject({
      ctrl: true,
      alt: false,
      shift: true,
      key: null,
      code: 'Backslash',
    });
    expect(parseCombo('Alt+-')).toMatchObject({ alt: true, code: 'Minus' });
    expect(parseCombo('Ctrl+,')).toMatchObject({ ctrl: true, code: 'Comma' });
    expect(parseCombo('Alt+N')).toMatchObject({ alt: true, key: 'n', code: null });
    expect(parseCombo('F2')).toMatchObject({ ctrl: false, code: 'F2' });
  });

  it('rejects keys it does not know', () => {
    expect(() => parseCombo('Ctrl+Space')).toThrow(/Unknown key/);
  });
});

describe('matches (PLAN 4.12: letters by key, the rest by code)', () => {
  it('matches letters case-insensitively', () => {
    const combo = parseCombo('Ctrl+Shift+F');
    expect(matches(combo, press('F', 'KeyF', { ctrl: true, shift: true }))).toBe(true);
    expect(matches(combo, press('f', 'KeyF', { ctrl: true, shift: true }))).toBe(true);
  });

  it('matches punctuation by physical key, whatever the layout prints', () => {
    // On a Portuguese layout the key left of Z is "<" (IntlBackslash); "\" is code Backslash.
    const combo = parseCombo('Ctrl+\\');
    expect(matches(combo, press('\\', 'Backslash', { ctrl: true }))).toBe(true);
    expect(matches(combo, press('~', 'Backslash', { ctrl: true }))).toBe(true);
    expect(
      matches(parseCombo('Alt+Shift+1'), press('!', 'Digit1', { alt: true, shift: true })),
    ).toBe(true);
  });

  it('requires exactly the same modifiers', () => {
    const combo = parseCombo('Ctrl+S');
    expect(matches(combo, press('s', 'KeyS', { ctrl: true, shift: true }))).toBe(false);
    expect(matches(combo, press('s', 'KeyS', { ctrl: true, alt: true }))).toBe(false);
    expect(matches(combo, press('s', 'KeyS', { ctrl: true, meta: true }))).toBe(false);
    expect(matches(combo, press('s', 'KeyS'))).toBe(false);
  });
});

describe('the table follows the rules of PLAN 4.12', () => {
  const combos: Combo[] = SHORTCUTS.flatMap((row) =>
    row.fallback === null ? [row.primary] : [row.primary, row.fallback],
  );

  it('never uses Ctrl+Alt (AltGr on Windows)', () => {
    for (const c of combos) expect(c.ctrl && c.alt, c.label).toBe(false);
  });

  it('never binds a combination the plan reserves for the browser', () => {
    const reserved = [
      'Ctrl+N',
      'Ctrl+T',
      'Ctrl+W',
      'Ctrl+L',
      'Ctrl+R',
      'F5',
      'F11',
      'F12',
      'Ctrl+Shift+I',
      'Ctrl+Shift+J',
      'Ctrl+Shift+C',
      'Ctrl+Shift+A',
      'Ctrl+Shift+B',
      'Ctrl+Shift+M',
      'Ctrl+Shift+N',
      'Ctrl+Shift+O',
      'Ctrl+Shift+Q',
      'Ctrl+Shift+T',
      'Ctrl+Shift+W',
      'Alt+D',
      'Alt+E',
      'Alt+F',
      'Alt+Left',
      'Alt+Right',
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => `Ctrl+${d}`),
    ];
    const labels = new Set(combos.map((c) => c.label));
    for (const r of reserved) expect(labels.has(r), r).toBe(false);
  });

  it('has no duplicate combination', () => {
    const labels = combos.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
