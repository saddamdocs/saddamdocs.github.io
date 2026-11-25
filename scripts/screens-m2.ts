/**
 * Takes the screenshots of the M2 gate: Settings → Data, the import summary, the History view, the
 * export reminder, the image viewer and the save-failure banner. Same usage as `scripts/screens.ts`:
 * a preview of the next build on port 4173, then `node scripts/screens-m2.ts <output folder>`.
 *
 * Talks to: Playwright's Chromium, the preview server, and the import fixtures.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { zipSync } from 'fflate';

const [outDir, base = 'http://127.0.0.1:4173/'] = process.argv.slice(2);
if (outDir === undefined) {
  console.error('Usage: node scripts/screens-m2.ts <output folder> [base URL]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const FIXTURES = fileURLToPath(new URL('../tests/fixtures/import/source', import.meta.url));

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound with apply below.
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      if (
        (window as unknown as { failSaves?: boolean }).failSaves === true &&
        this.name === 'texts'
      ) {
        throw new DOMException('Simulated full disk', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  const page = await context.newPage();
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    console.log(`wrote ${name}.png`);
  };

  await page.goto(base);
  await page.getByRole('button', { name: 'Use only on this device for now' }).click();
  await page.getByTestId('settings').click();
  await shot('1-settings-data');

  await page.getByTestId('import-folder').setInputFiles(FIXTURES);
  await page.getByTestId('import-summary').waitFor();
  await shot('2-import-summary');
  await page.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();

  // Ten notes and never exported: the reminder shows.
  const ten = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      `Diário/dia ${String(i + 1)}.md`,
      new TextEncoder().encode(`Dia ${String(i + 1)}.\n`),
    ]),
  );
  await page.getByTestId('import-files').setInputFiles({
    name: 'ten.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(ten)),
  });
  await page.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByTestId('show-all-files').check();
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close' }).click();
  await page.locator('[role="treeitem"]', { hasText: 'Notas' }).click();
  await page.locator('[role="treeitem"]', { hasText: 'Ação e coração' }).click();
  await shot('3-export-reminder');

  await page.locator('[role="treeitem"]', { hasText: 'images' }).first().click();
  await page.locator('[role="treeitem"]', { hasText: 'img' }).click();
  await shot('4-image-viewer');

  await page.locator('[role="treeitem"]', { hasText: 'Ação e coração' }).click();
  // An edit, then closing the tab, keeps a snapshot (PLAN 4.3).
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Primeira edição.');
  await page.waitForTimeout(500);
  await page.getByRole('tab').getByRole('button', { name: /Close/ }).click();
  await page.locator('[role="treeitem"]', { hasText: 'Ação e coração' }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nUma linha nova.');
  await page.getByRole('tab').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'History' }).click();
  await shot('5-history');
  await page.getByTestId('history').getByRole('button', { name: 'Close', exact: true }).click();

  await page.evaluate(() => ((window as unknown as { failSaves: boolean }).failSaves = true));
  await page.locator('.cm-content').first().click();
  await page.keyboard.type(' Não salvo.');
  await page.getByTestId('save-failed').waitFor();
  await shot('6-save-failed');
} finally {
  await browser.close();
}
