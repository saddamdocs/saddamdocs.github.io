/**
 * Takes the screenshots of the M3a gate: the welcome screen's sync form, the key shown once, the
 * shell with the sync chip, the chip's details, and Settings → Sync. Runs against a preview of the
 * emulator build (port 4174) with the database emulator running:
 *
 *   npm run build:emulator
 *   npx firebase emulators:exec --project demo-tamandua --only database \
 *     "npx vite preview --mode emulator --port 4174 & sleep 2; node scripts/screens-m3a.ts <dir>"
 *
 * Talks to: Playwright's Chromium, the preview server and the emulator. Never a real database.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const [outDir, base = 'http://127.0.0.1:4174/'] = process.argv.slice(2);
if (outDir === undefined) {
  console.error('Usage: node scripts/screens-m3a.ts <output folder> [base URL]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const shot = async (name: string): Promise<void> => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    console.log(`wrote ${name}.png`);
  };
  await page.goto(base);
  await page.getByRole('button', { name: 'Start a new synced vault' }).click();
  await page.getByTestId('passphrase').fill('quatro palavras ao acaso');
  await page.getByTestId('passphrase-again').fill('quatro palavras ao acaso');
  await shot('1-start-form');
  await page.getByTestId('sync-submit').click();
  await page.getByTestId('key-reveal').waitFor();
  await shot('2-key');
  await page.getByTestId('key-done').click();
  await page.getByTestId('new-note').click();
  await page.locator('input.rename').fill('Nota sincronizada');
  await page.locator('input.rename').press('Enter');
  await page.locator('.cm-content').click();
  await page.keyboard.type('Esta nota está no banco de dados, cifrada.');
  await page.getByTestId('sync-chip').getByText('Synced').waitFor({ timeout: 10_000 });
  await shot('3-shell-synced');
  await page.getByTestId('sync-chip').click();
  await shot('4-chip-details');
  await page.getByTestId('sync-chip').click();
  await page.getByTestId('settings').click();
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await shot('5-settings-sync');
} finally {
  await browser.close();
}
