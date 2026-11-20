/**
 * The fonts the app ships (PLAN 4.9): one registry, the only file where a font name appears.
 *
 * Owns the list of fonts, the files of each (Latin and Latin Extended only, upright and italic,
 * which cover Portuguese), and the CSS variables that bring them to the page: `--font-ui`,
 * `--font-text` and `--font-mono`. Fonts are registered with the FontFace API, so the browser
 * downloads a file only when text in its unicode range is drawn; every file is still precached by
 * the service worker, so a font picked on one device works offline on the next.
 *
 * Talks to: `document.fonts` and the root element's style. Read by `settings/apply.ts`.
 *
 * Adding a font (M8 adds Atkinson Hyperlegible Next, Literata and Merriweather): install its
 * `@fontsource-variable/<name>` package, import its four Latin files below, add an entry to
 * `FONTS`, add its id to `NOTE_FONT_IDS`, and list it in THIRD_PARTY_LICENSES.md.
 * docs/ARCHITECTURE.md has the step-by-step guide.
 */

import interLatinItalic from '@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url';
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import interLatinExtItalic from '@fontsource-variable/inter/files/inter-latin-ext-wght-italic.woff2?url';
import interLatinExt from '@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2?url';
import monoLatinItalic from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-italic.woff2?url';
import monoLatin from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url';
import monoLatinExtItalic from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-italic.woff2?url';
import monoLatinExt from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2?url';

/** Unicode ranges of the two subsets, copied from the Fontsource packages' CSS. */
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

/** Identifiers of the fonts this version knows. */
export type FontId = 'inter' | 'jetbrains-mono' | 'system';

/** One font file: a subset in one style. */
interface FontFile {
  readonly url: string;
  readonly style: 'normal' | 'italic';
  readonly unicodeRange: string;
}

/** A font the app can use. */
export interface FontDefinition {
  readonly id: FontId;
  /** The name shown in Settings. */
  readonly label: string;
  /** The CSS `font-family` value, with fallbacks, used in the theme variables. */
  readonly stack: string;
  /** The family name the files are registered under, or null for the system font. */
  readonly family: string | null;
  /** Weight range of the variable font, as a FontFace descriptor. */
  readonly weight: string;
  readonly files: readonly FontFile[];
  /** Where the files come from. */
  readonly source: string;
  readonly licence: string;
  /** One line on why it is on the list (PLAN 4.9). */
  readonly note: string;
}

/** Every font the app ships, by id. */
export const FONTS: Readonly<Record<FontId, FontDefinition>> = {
  inter: {
    id: 'inter',
    label: 'Inter',
    family: 'Inter Variable',
    stack: "'Inter Variable', system-ui, sans-serif",
    weight: '100 900',
    files: [
      { url: interLatin, style: 'normal', unicodeRange: LATIN },
      { url: interLatinExt, style: 'normal', unicodeRange: LATIN_EXT },
      { url: interLatinItalic, style: 'italic', unicodeRange: LATIN },
      { url: interLatinExtItalic, style: 'italic', unicodeRange: LATIN_EXT },
    ],
    source: '@fontsource-variable/inter',
    licence: 'SIL Open Font License 1.1',
    note: 'Designed for computer screens, with a tall x-height that helps lower-case text',
  },
  'jetbrains-mono': {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: 'JetBrains Mono Variable',
    stack: "'JetBrains Mono Variable', ui-monospace, monospace",
    weight: '100 800',
    files: [
      { url: monoLatin, style: 'normal', unicodeRange: LATIN },
      { url: monoLatinExt, style: 'normal', unicodeRange: LATIN_EXT },
      { url: monoLatinItalic, style: 'italic', unicodeRange: LATIN },
      { url: monoLatinExtItalic, style: 'italic', unicodeRange: LATIN_EXT },
    ],
    source: '@fontsource-variable/jetbrains-mono',
    licence: 'SIL Open Font License 1.1',
    note: 'The code font',
  },
  system: {
    id: 'system',
    label: 'System font',
    family: null,
    stack: 'system-ui, sans-serif',
    weight: 'normal',
    files: [],
    source: "The operating system's interface font",
    licence: 'Not shipped',
    note: 'Matches the rest of the computer, so it differs between Fedora and Windows',
  },
};

/** The fonts offered for notes, in the order Settings lists them (PLAN 4.9). M8 adds three. */
export const NOTE_FONT_IDS: readonly FontId[] = ['inter', 'system'];

/** The interface font, fixed (PLAN 4.9). */
export const UI_FONT: FontId = 'inter';
/** The code font, fixed (PLAN 4.9). */
export const MONO_FONT: FontId = 'jetbrains-mono';
/** The default font for notes (PLAN 4.9). */
export const DEFAULT_NOTE_FONT: FontId = 'inter';

/**
 * Resolves a saved font id. A font id this version does not know, saved by a newer version, shows
 * as the default without changing the saved setting (PLAN 4.9).
 *
 * @param id - Any saved value.
 * @returns A font this version can draw.
 */
export function noteFont(id: unknown): FontDefinition {
  return typeof id === 'string' && (NOTE_FONT_IDS as readonly string[]).includes(id)
    ? FONTS[id as FontId]
    : FONTS[DEFAULT_NOTE_FONT];
}

const registered = new Set<FontId>();

/**
 * Registers a font's files with the page, once. The browser then downloads a file only when it
 * draws text in that file's range and style; until it arrives, the fallback in the stack stands
 * in (`display: swap`, PLAN 5.10).
 *
 * @param font - The font to register. The system font needs nothing.
 * @returns Nothing. A file that fails to load leaves the fallback in place; the browser reports it.
 */
export function registerFont(font: FontDefinition): void {
  if (font.family === null || registered.has(font.id)) return;
  registered.add(font.id);
  for (const file of font.files) {
    const face = new FontFace(font.family, `url(${file.url}) format('woff2')`, {
      style: file.style,
      weight: font.weight,
      unicodeRange: file.unicodeRange,
      display: 'swap',
    });
    document.fonts.add(face);
  }
}

/**
 * Registers the fonts in use and sets the font variables on an element.
 *
 * @param target - The document root in the app.
 * @param noteFontId - The saved "font for notes" setting.
 * @returns Nothing.
 */
export function applyFonts(target: HTMLElement, noteFontId: unknown): void {
  const ui = FONTS[UI_FONT];
  const mono = FONTS[MONO_FONT];
  const text = noteFont(noteFontId);
  for (const font of [ui, mono, text]) registerFont(font);
  target.style.setProperty('--font-ui', ui.stack);
  target.style.setProperty('--font-mono', mono.stack);
  target.style.setProperty('--font-text', text.stack);
}
