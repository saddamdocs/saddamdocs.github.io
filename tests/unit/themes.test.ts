/**
 * The contrast test of PLAN 4.9: in Tamanduá Light, every text colour on every light background,
 * plus `--on-dark` and `--accent` on `--dark`, and `--dark` on `--accent`, reaches WCAG AA (4.5:1).
 */

import { describe, expect, it } from 'vitest';
import { TAMANDUA_LIGHT, type ThemeVariable } from '../../src/lib/settings/themes.ts';

/** WCAG 2 relative luminance of a `#RRGGBB` colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG 2 contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const TEXTS: ThemeVariable[] = ['text', 'heading', 'text-muted', 'accent-text', 'danger'];
const BACKGROUNDS: ThemeVariable[] = [
  'paper',
  'sidebar',
  'panel',
  'hover',
  'selection',
  'highlight',
];
const PAIRS: [ThemeVariable, ThemeVariable][] = [
  ...TEXTS.flatMap((fg) => BACKGROUNDS.map((bg): [ThemeVariable, ThemeVariable] => [fg, bg])),
  ['on-dark', 'dark'],
  ['accent', 'dark'],
  ['dark', 'accent'],
];

describe('Tamanduá Light contrast (PLAN 4.9)', () => {
  it.each(PAIRS)('--%s on --%s reaches 4.5:1', (fg, bg) => {
    expect(contrast(TAMANDUA_LIGHT[fg], TAMANDUA_LIGHT[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('the formula matches known values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    // PLAN 4.9: dark green reaches 11.7:1 on paper.
    expect(contrast(TAMANDUA_LIGHT.text, TAMANDUA_LIGHT.paper)).toBeCloseTo(11.7, 1);
  });
});
