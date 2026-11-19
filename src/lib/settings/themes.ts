/**
 * The colour themes: one set of CSS variables, with one value set per theme (PLAN 4.9).
 *
 * Owns every colour of the interface. Components use only the CSS variables declared here; no
 * other file may hold a colour value, except the splash colours that vite.config.ts copies from
 * this file into index.html and the manifest.
 *
 * Talks to: nothing at import time. `applyTheme()` writes the variables onto an element (the
 * document root at start-up). vite.config.ts imports `TAMANDUA_LIGHT` for the manifest colours.
 *
 * M0 declares Tamanduá Light only. M8 adds the Solarized Light values for the same variables.
 */

/** The names of the theme variables, without the leading `--`. */
export type ThemeVariable =
  | 'paper'
  | 'sidebar'
  | 'panel'
  | 'hover'
  | 'border'
  | 'text'
  | 'heading'
  | 'text-muted'
  | 'dark'
  | 'on-dark'
  | 'accent'
  | 'accent-text'
  | 'selection'
  | 'highlight'
  | 'danger';

/** A complete theme: one colour per variable, as `#RRGGBB`. */
export type Theme = Readonly<Record<ThemeVariable, string>>;

/** Identifiers of the themes this version knows. */
export type ThemeId = 'tamandua-light';

/**
 * Tamanduá Light, the default theme (PLAN 4.9). Built from the icon's colours (Appendix A), the
 * nib gold and one red. The comment on each value says where it is used.
 */
export const TAMANDUA_LIGHT: Theme = {
  /** Editor, dialogs, the active tab. The icon's cream with 75% white. */
  paper: '#FCF9F3',
  /** Sidebar, Trash view. Cream with 45% white. */
  sidebar: '#F8F1E5',
  /** Tab bar, status bar, code blocks, inline code. The icon's cream; also the manifest theme colour. */
  panel: '#F2E6CF',
  /** Hovered and selected rows in the tree and in menus. The icon's light cream. */
  hover: '#E9DCC3',
  /** Dividers, the pane divider, scrollbar thumbs. The icon's shaded cream. */
  border: '#CFC0A3',
  /** Body text, icons. The icon's dark green. */
  text: '#1F3A34',
  /** Headings, bold text. */
  heading: '#1F3A34',
  /** Paths, counts, week numbers, done tasks, code comments, input outlines. Dark green with 20% paper. */
  'text-muted': '#4B605A',
  /** Fills: primary buttons, checked task boxes, the snackbar, tooltips, the calendar's header row. */
  dark: '#1F3A34',
  /** Text and ticks on `--dark`. */
  'on-dark': '#F2E6CF',
  /** The nib gold: active tab line, selected row bar, current week, link underlines, focus ring, snackbar action. */
  accent: '#E0A43A',
  /** Gold-coloured text on light backgrounds. Gold with 45% black. */
  'accent-text': '#7B5A20',
  /** Selected text. Gold at 35% over paper. */
  selection: '#F2DBB2',
  /** `==highlighted==` text. Gold at 40% over paper. */
  highlight: '#F1D7A9',
  /** Errors, failed saves, formulas KaTeX cannot parse. */
  danger: '#A23B2A',
};

/** Every theme by id. */
export const THEMES: Readonly<Record<ThemeId, Theme>> = {
  'tamandua-light': TAMANDUA_LIGHT,
};

/**
 * Writes a theme's variables onto an element's inline style, as `--<name>`.
 *
 * @param theme - The theme to apply.
 * @param target - The element to style; the document root in the app.
 * @returns Nothing. It cannot fail.
 */
export function applyTheme(theme: Theme, target: HTMLElement): void {
  for (const [name, value] of Object.entries(theme)) {
    target.style.setProperty(`--${name}`, value);
  }
}
