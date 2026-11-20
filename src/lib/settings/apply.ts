/**
 * Applies the appearance settings to the page (PLAN 4.9): the theme's colours, the fonts, the font
 * size, the line height and the readable line width, all as CSS variables on the root.
 *
 * Talks to: `settings/themes.ts`, `settings/fonts.ts`, and the root element's style.
 */

import { applyFonts } from './fonts.ts';
import type { Settings } from './schema.ts';
import { THEMES, TAMANDUA_LIGHT, applyTheme, type ThemeId } from './themes.ts';

/** The widest text column when "Readable line width" is on, in px (PLAN 4.9). */
const READABLE_WIDTH_PX = 700;

/**
 * Sets every appearance variable from the settings.
 *
 * @param settings - The current settings.
 * @param root - The document root in the app.
 * @returns Nothing.
 */
export function applyAppearance(settings: Settings, root: HTMLElement): void {
  const theme = settings.theme in THEMES ? THEMES[settings.theme as ThemeId] : TAMANDUA_LIGHT;
  applyTheme(theme, root);
  applyFonts(root, settings.noteFont);
  root.style.setProperty('--font-size', `${String(settings.fontSize)}px`);
  root.style.setProperty('--line-height', String(settings.lineHeight));
  root.style.setProperty(
    '--text-width',
    settings.readableLineWidth ? `${String(READABLE_WIDTH_PX)}px` : 'none',
  );
}
