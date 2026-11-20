/**
 * Takes the screenshots Felipe approves at the M1 gate (PLAN 7: "the empty shell, the tree and the
 * welcome screen"), from a fresh browser profile against a running preview of the next build.
 *
 * Usage: `npm run build:next && npx vite preview --mode next --port 4173` in one terminal, then
 * `node scripts/screens.ts <output folder> [base URL]`. Writes PNG files into the folder.
 *
 * Talks to: Playwright's Chromium and the preview server. Never to the network beyond it.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [outDir, base = 'http://127.0.0.1:4173/'] = process.argv.slice(2);
if (outDir === undefined) {
  console.error('Usage: node scripts/screens.ts <output folder> [base URL]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    console.log(`wrote ${name}.png`);
  };

  await page.goto(base);
  await page.getByRole('button', { name: 'Use only on this device for now' }).waitFor();
  await shot('1-welcome');

  await page.getByRole('button', { name: 'Use only on this device for now' }).click();
  await page.getByTestId('shell').waitFor();
  await shot('2-empty-shell');

  // A small tree: folders, a subfolder, notes, and one open note with text.
  const rename = async (name: string): Promise<void> => {
    const input = page.locator('input.rename');
    await input.fill(name);
    await input.press('Enter');
  };
  await page.getByTestId('new-folder').click();
  await rename('Ideas');
  await page.getByTestId('new-folder').click();
  await rename('Drafts');
  await page.getByTestId('new-note').click();
  await rename('Talk outline');
  await page.locator('[data-kind="folder"]', { hasText: 'Ideas' }).click();
  await page.getByTestId('new-note').click();
  await rename('Plan for 2027');
  await page.locator('.tree').click({ position: { x: 5, y: 380 } });
  await page.getByTestId('tree').press('Escape');
  await page.evaluate(() => {
    // Select the root so the next note lands there.
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await page.locator('[data-kind="note"]', { hasText: 'Plan for 2027' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.type(
    '# Plan for 2027\n\nSome **bold** words, some *italic* ones, and `code`.\n\n- first item\n- second item\n\n> A quote about ação and coração.\n',
  );
  await page.waitForTimeout(600);
  await shot('3-tree-and-note');

  await page.locator('[data-kind="note"]', { hasText: 'Talk outline' }).click({ button: 'right' });
  await shot('4-context-menu');
  await page.keyboard.press('Escape');

  await page.locator('[data-kind="note"]', { hasText: 'Talk outline' }).click();
  await page.locator('[data-kind="note"]', { hasText: 'Talk outline' }).press('Delete');
  await shot('5-deleted-with-undo');

  await page.getByTestId('trash-button').click();
  await shot('6-trash');
} finally {
  await browser.close();
}
