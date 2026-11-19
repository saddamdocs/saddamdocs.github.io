/**
 * Generates the app icons of Appendix A into `public/icons/` from `docs/reference/icon.svg` and
 * `public/icons/icon-maskable.svg`, by rendering them in Playwright's Chromium (PLAN 9, "Details"),
 * so no image tool is needed. The outputs are committed; run this again only if a source changes.
 *
 * Usage: `npm run icons`. Needs Playwright's Chromium (`npx playwright install chromium`).
 *
 * Talks to: the file system and Playwright. Never to the network.
 */

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const ROOT = new URL('../', import.meta.url);
const ICON = new URL('docs/reference/icon.svg', ROOT);
const MASKABLE = new URL('public/icons/icon-maskable.svg', ROOT);
const OUT = new URL('public/icons/', ROOT);

/** One PNG to produce: its source drawing, its file name and its edge length in pixels. */
interface Target {
  readonly source: URL;
  readonly file: string;
  readonly size: number;
}

const TARGETS: readonly Target[] = [
  { source: ICON, file: 'icon-32.png', size: 32 },
  { source: ICON, file: 'icon-192.png', size: 192 },
  { source: ICON, file: 'icon-512.png', size: 512 },
  { source: MASKABLE, file: 'icon-maskable-512.png', size: 512 },
];

/**
 * Renders every target and copies the icon as the SVG favicon.
 *
 * @returns Resolves when every file is written.
 * @throws When Chromium cannot start or a source file is missing.
 */
async function main(): Promise<void> {
  copyFileSync(ICON, new URL('favicon.svg', OUT));
  const browser = await chromium.launch();
  try {
    for (const target of TARGETS) {
      const page = await browser.newPage({
        viewport: { width: target.size, height: target.size },
        deviceScaleFactor: 1,
      });
      const svg = readFileSync(target.source, 'utf8')
        .replace('width="512"', `width="${String(target.size)}"`)
        .replace('height="512"', `height="${String(target.size)}"`);
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
      );
      const png = await page.screenshot({ omitBackground: true, type: 'png' });
      writeFileSync(new URL(target.file, OUT), png);
      console.log(`wrote public/icons/${target.file} (${String(png.length)} bytes)`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

await main();
