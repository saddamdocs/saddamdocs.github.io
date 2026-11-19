/**
 * Spike B (PLAN 7, M0): the shortcuts of PLAN 4.12 as data, and the rule that matches a key press
 * against them. The probe page uses it to show which shortcuts reach the page in Brave.
 *
 * Matching follows PLAN 4.12: letters by `event.key`, case-insensitively; punctuation, digits and
 * named keys by `event.code`, so `\`, `=`, `-` and `,` work on Portuguese and US layouts alike.
 * M6 moves the matcher into the app's keymap; the table stays the record of what spike B found.
 *
 * Talks to: nothing.
 */

/** One key combination, parsed from text such as `Ctrl+Shift+\`. */
export interface Combo {
  /** The text it was parsed from, for display. */
  readonly label: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  /** Lower-case letter to compare with `event.key`, or null when `code` is used. */
  readonly key: string | null;
  /** `KeyboardEvent.code` to compare, or null when `key` is used. */
  readonly code: string | null;
}

/** A row of the table in PLAN 4.12. */
export interface ShortcutRow {
  /** What the shortcut does in the app. */
  readonly action: string;
  readonly primary: Combo;
  /** The fallback the plan names for when the browser keeps the primary, or null if none. */
  readonly fallback: Combo | null;
}

/** `KeyboardEvent.code` for every non-letter key the table uses. */
const CODES: Readonly<Record<string, string>> = {
  '\\': 'Backslash',
  '=': 'Equal',
  '-': 'Minus',
  ',': 'Comma',
  '0': 'Digit0',
  '1': 'Digit1',
  '2': 'Digit2',
  PageDown: 'PageDown',
  PageUp: 'PageUp',
  Right: 'ArrowRight',
  Left: 'ArrowLeft',
  F2: 'F2',
  Delete: 'Delete',
};

/**
 * Parses a combination written as in PLAN 4.12.
 *
 * @param label - For example `Alt+Shift+W` or `Ctrl+\`.
 * @returns The parsed combination.
 * @throws Error when the last part is neither a letter nor a key listed in `CODES`.
 */
export function parseCombo(label: string): Combo {
  // Split on "+" but keep a literal trailing "+" or "-" key intact ("Alt+-" has key "-").
  const parts = label.split(/\+(?=.)/);
  const last = parts.pop() ?? '';
  const mods = new Set(parts);
  const isLetter = /^[A-Za-z]$/.test(last);
  const code = isLetter ? null : (CODES[last] ?? null);
  if (!isLetter && code === null) throw new Error(`Unknown key in shortcut "${label}"`);
  return {
    label,
    ctrl: mods.has('Ctrl'),
    alt: mods.has('Alt'),
    shift: mods.has('Shift'),
    key: isLetter ? last.toLowerCase() : null,
    code,
  };
}

/**
 * Tells whether a key press is exactly this combination: the same modifiers, no Meta key, and the
 * same letter or physical key.
 *
 * @param combo - The combination to test.
 * @param event - The key press, or any object with the same fields.
 * @returns True on a match.
 */
export function matches(
  combo: Combo,
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
): boolean {
  if (event.ctrlKey !== combo.ctrl || event.altKey !== combo.alt) return false;
  if (event.shiftKey !== combo.shift || event.metaKey) return false;
  if (combo.key !== null) return event.key.toLowerCase() === combo.key;
  return event.code === combo.code;
}

/** Builds a row from text. */
function row(action: string, primary: string, fallback: string | null = null): ShortcutRow {
  return {
    action,
    primary: parseCombo(primary),
    fallback: fallback === null ? null : parseCombo(fallback),
  };
}

/** Every shortcut of PLAN 4.12, one row per key combination, in the plan's order. */
export const SHORTCUTS: readonly ShortcutRow[] = [
  row('New note', 'Alt+N'),
  row('Quick switcher', 'Ctrl+O', 'Alt+O'),
  row('Close tab', 'Alt+W', 'Alt+Shift+W'),
  row('Next tab in pane', 'Alt+PageDown', 'Alt+Shift+Right'),
  row('Previous tab in pane', 'Alt+PageUp', 'Alt+Shift+Left'),
  row('Split right / close split', 'Ctrl+Shift+\\', 'Alt+\\'),
  row('Focus left pane', 'Alt+1', 'Alt+Shift+1'),
  row('Focus right pane', 'Alt+2', 'Alt+Shift+2'),
  row('Save now and sync now', 'Ctrl+S'),
  row('Live preview / source mode', 'Ctrl+E', 'Alt+Shift+E'),
  row('Find in note', 'Ctrl+F'),
  row('Replace in note', 'Ctrl+H'),
  row('Search all notes', 'Ctrl+Shift+F', 'Alt+Shift+F'),
  row('Export to PDF', 'Ctrl+P'),
  row('Calendar', 'Alt+C'),
  row('Text colour', 'Alt+T'),
  row('Settings', 'Ctrl+,', 'Alt+,'),
  row('Show or hide sidebar', 'Ctrl+\\', 'Alt+Shift+\\'),
  row('Bold', 'Ctrl+B'),
  row('Italic', 'Ctrl+I'),
  row('Link', 'Ctrl+K'),
  row('Font size up', 'Alt+='),
  row('Font size down', 'Alt+-'),
  row('Font size reset', 'Alt+0'),
  row('Undo', 'Ctrl+Z'),
  row('Redo', 'Ctrl+Y'),
  row('Redo (alternative)', 'Ctrl+Shift+Z'),
  row('Rename in tree', 'F2'),
  row('Delete in tree', 'Delete'),
];
