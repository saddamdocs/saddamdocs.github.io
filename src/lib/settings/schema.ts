/**
 * The synced settings (PLAN 4.9, 4.13): their names, defaults, ranges, and how the settings item's
 * JSON is read back safely.
 *
 * Owns the defaults. Every tunable the user can change is read through the settings store with
 * its default, from M1, even before the settings screen exists in M8 (PLAN 7). A value that is
 * missing, of the wrong type or out of range reads as its default; keys this version does not know
 * are kept, so a newer version's settings survive an older one (PLAN 5.5).
 *
 * Talks to: `settings/fonts.ts` for the font ids. Pure; used by `settings/store.ts`.
 */

import { DEFAULT_NOTE_FONT } from './fonts.ts';

/** Every synced setting. Device-only values (the device name) live in the `state` store. */
export interface Settings {
  /** Font for notes (PLAN 4.9). A font id; unknown ids draw as the default. */
  noteFont: string;
  /** Font size in px, 10 to 32 (PLAN 4.9). */
  fontSize: number;
  /** Line height, 1.2 to 2.0 (PLAN 4.9). */
  lineHeight: number;
  /** Text column at most 700 px, centred (PLAN 4.9). */
  readableLineWidth: boolean;
  /** Theme id (PLAN 4.9); M8 adds `solarized-light`. */
  theme: string;
  /** Clicking a note opens it in a new tab (PLAN 4.6, 4.13). */
  alwaysOpenInNewTab: boolean;
  /** Ask before Delete forever and Empty Trash (PLAN 4.3, 4.13). */
  confirmDeleteForever: boolean;
  /** Show files in the tree (PLAN 4.3, 4.13). */
  showAllFiles: boolean;
  /** Mode of new tabs (PLAN 4.13). */
  newTabMode: 'preview' | 'source';
  /** Where pasted images go (PLAN 4.2, 4.13). */
  pastedImagesTo: 'note-folder' | 'attachments';
  /** The week chip in the status bar (PLAN 4.13). */
  weekChip: boolean;
  /** Days items stay in the Trash, 7 to 365 (PLAN 4.13). */
  trashDays: number;
  /** Days before the export reminder, 1 to 90, or 0 for never (PLAN 4.13). */
  exportReminderDays: number;
}

/** The defaults of PLAN 4.9 and 4.13. */
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  noteFont: DEFAULT_NOTE_FONT,
  fontSize: 16,
  lineHeight: 1.6,
  readableLineWidth: true,
  theme: 'tamandua-light',
  alwaysOpenInNewTab: false,
  confirmDeleteForever: true,
  showAllFiles: false,
  newTabMode: 'preview',
  pastedImagesTo: 'note-folder',
  weekChip: true,
  trashDays: 30,
  exportReminderDays: 7,
};

/** Allowed ranges of the numeric settings, inclusive. */
export const RANGES = {
  fontSize: [10, 32],
  lineHeight: [1.2, 2.0],
  trashDays: [7, 365],
  exportReminderDays: [0, 90],
} as const;

/** The settings item as stored: known settings plus any keys a newer version added. */
export interface StoredSettings {
  readonly settings: Settings;
  /** Keys this version does not know, kept as they are. */
  readonly extra: Readonly<Record<string, unknown>>;
}

/** Accepts a number within a range, or falls back. */
function inRange(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

/** Accepts one of a set of strings, or falls back. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Accepts a boolean, or falls back. */
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Reads the settings item's JSON. It never throws: unreadable JSON gives the defaults.
 *
 * @param text - The stored JSON, or null when there is no settings item yet.
 * @returns Valid settings, and the keys this version does not know.
 */
export function parseSettings(text: string | null): StoredSettings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = text === null ? {} : JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
      raw = parsed as Record<string, unknown>;
  } catch {
    // A damaged settings item must not stop the app; the defaults apply and the next change
    // rewrites it.
    raw = {};
  }
  const d = DEFAULT_SETTINGS;
  const settings: Settings = {
    noteFont: typeof raw.noteFont === 'string' ? raw.noteFont : d.noteFont,
    fontSize: inRange(raw.fontSize, RANGES.fontSize, d.fontSize),
    lineHeight: inRange(raw.lineHeight, RANGES.lineHeight, d.lineHeight),
    readableLineWidth: bool(raw.readableLineWidth, d.readableLineWidth),
    theme: typeof raw.theme === 'string' ? raw.theme : d.theme,
    alwaysOpenInNewTab: bool(raw.alwaysOpenInNewTab, d.alwaysOpenInNewTab),
    confirmDeleteForever: bool(raw.confirmDeleteForever, d.confirmDeleteForever),
    showAllFiles: bool(raw.showAllFiles, d.showAllFiles),
    newTabMode: oneOf(raw.newTabMode, ['preview', 'source'], d.newTabMode),
    pastedImagesTo: oneOf(raw.pastedImagesTo, ['note-folder', 'attachments'], d.pastedImagesTo),
    weekChip: bool(raw.weekChip, d.weekChip),
    trashDays: inRange(raw.trashDays, RANGES.trashDays, d.trashDays),
    exportReminderDays: inRange(
      raw.exportReminderDays,
      RANGES.exportReminderDays,
      d.exportReminderDays,
    ),
  };
  const known = new Set(Object.keys(DEFAULT_SETTINGS));
  const extra = Object.fromEntries(Object.entries(raw).filter(([k]) => !known.has(k)));
  return { settings, extra };
}

/**
 * Writes settings back to JSON, unknown keys included.
 *
 * @param stored - The settings and the extra keys.
 * @returns JSON text for the settings item.
 */
export function serializeSettings(stored: StoredSettings): string {
  return JSON.stringify({ ...stored.extra, ...stored.settings });
}
