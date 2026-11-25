/**
 * M2 UI tests for plain Markdown in and out (PLAN 4.15, R12), history (PLAN 4.3), image links on a
 * move (PLAN 4.3), the image viewer, and the export reminder. Archives are read back in Node with
 * fflate, so the tests compare real downloads byte for byte.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { newNote, startLocal, treeRow, treeText } from '../support/app.ts';

const FIXTURE_FOLDER = fileURLToPath(new URL('../fixtures/import/source', import.meta.url));
const FIXTURE_ZIP = fileURLToPath(new URL('../fixtures/import/source.zip', import.meta.url));

/** Opens Settings → Data. */
async function openData(page: Page): Promise<void> {
  await page.getByTestId('settings').click();
  await expect(page.getByTestId('export-vault')).toBeVisible();
}

/** Imports the fixture folder through the folder picker and closes the summary. */
async function importFixtureFolder(page: Page): Promise<void> {
  await openData(page);
  await page.getByTestId('import-folder').setInputFiles(FIXTURE_FOLDER);
  await expect(page.getByTestId('import-summary')).toBeVisible();
}

/** Exports the vault and returns the archive's entries. */
async function exportVault(page: Page): Promise<Record<string, Uint8Array>> {
  const downloading = page.waitForEvent('download');
  await page.getByTestId('export-vault').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^tamandua-\d{4}-\d{2}-\d{2}\.zip$/);
  return unzipSync(new Uint8Array(readFileSync(await download.path())));
}

test('a folder imports with its structure, a summary, and Undo import', async ({ page }) => {
  await startLocal(page);
  await importFixtureFolder(page);
  const summary = page.getByTestId('import-summary');
  await expect(summary.getByTestId('import-counts')).toHaveText(
    '7 notes, 5 images and 7 folders imported.',
  );
  await expect(summary).toContainText('Notas/latin1.md: not UTF-8 text');
  await expect(summary).toContainText('.obsidian/: starts with a dot');
  await expect(summary).toContainText('doc.pdf: not a Markdown note or a supported image');
  await summary.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => treeText(page)).toEqual(['images', 'Notas', 'README']);
  await treeRow(page, 'Notas').click();
  await expect.poll(() => treeText(page)).toContain('  empty');

  await openData(page);
  await page.getByTestId('import-folder').setInputFiles(FIXTURE_FOLDER);
  await expect(page.getByTestId('import-summary')).toContainText('Notas → Notas (2)');
  await page.getByTestId('import-summary').getByRole('button', { name: 'Undo import' }).click();
  await expect(page.getByTestId('import-summary')).toContainText('in the Trash');
  await page.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close' }).click();
  await expect.poll(() => treeText(page)).not.toContain('Notas (2)');
});

test('R12: export, then import into an empty vault, reproduces everything byte for byte', async ({
  page,
  browser,
}) => {
  await startLocal(page);
  await importFixtureFolder(page);
  await page.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('import-files').setInputFiles(FIXTURE_ZIP);
  await page.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();
  const first = await exportVault(page);
  expect(Object.keys(first)).toContain('Notas/empty/');
  expect(Object.keys(first)).toContain('Notas (2)/sub/deep/deeper/deepest/five.md');
  await expect(page.getByTestId('last-export')).toContainText('Last exported from this device');

  // A second, empty browser profile imports the archive and exports it again.
  const other = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const page2 = await other.newPage();
  await startLocal(page2);
  await openData(page2);
  const archive = zipSync(Object.fromEntries(Object.entries(first)));
  await page2.getByTestId('import-files').setInputFiles({
    name: 'export.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await page2.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();
  const second = await exportVault(page2);
  await other.close();

  expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort());
  for (const [path, bytes] of Object.entries(first)) expect(second[path], path).toEqual(bytes);
});

test('moving a note rewrites its image links, and Undo puts them back', async ({ page }) => {
  await startLocal(page);
  await importFixtureFolder(page);
  await page.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close' }).click();
  await treeRow(page, 'Notas').click();
  await treeRow(page, 'with images').click();
  await expect(page.locator('.cm-content')).toContainText('![png](../images/img.png)');
  // One level deeper, the old links would name Notas/images/…, which does not exist.
  await treeRow(page, 'with images').dragTo(treeRow(page, 'sub'));
  await expect(page.getByTestId('status-path')).toHaveText('Notas/sub/with images.md');
  await expect(page.locator('.cm-content')).toContainText('![png](../../images/img.png)');
  // A link to a missing image stays as written (PLAN 4.3).
  await expect(page.locator('.cm-content')).toContainText('![missing](../images/nowhere.png)');
  await page.getByTestId('snackbar').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('status-path')).toHaveText('Notas/with images.md');
  await expect(page.locator('.cm-content')).toContainText('![png](../images/img.png)');
});

test('History keeps a snapshot when a tab closes, and Restore is an undoable edit', async ({
  page,
}) => {
  await startLocal(page);
  await newNote(page, 'Versions');
  await page.locator('.cm-content').click();
  await page.keyboard.type('First version.');
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  // Closing the tab takes a snapshot (PLAN 4.3).
  await page.getByRole('tab').getByRole('button', { name: /Close/ }).click();
  await treeRow(page, 'Versions').click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Second.');
  await page.getByRole('tab').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'History' }).click();
  await expect(page.getByTestId('history')).toContainText('tab closed');
  await page.getByTestId('history-restore').click();
  await expect(page.locator('.cm-editor').first().locator('.cm-content')).toHaveText(
    'First version.',
  );
  await page.locator('.cm-editor').first().locator('.cm-content').click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.cm-editor').first().locator('.cm-content')).toHaveText(
    'First version. Second.',
  );
});

test('"Show all files" lists images, which open in the viewer', async ({ page }) => {
  await startLocal(page);
  await importFixtureFolder(page);
  await page.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByTestId('show-all-files').check();
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close' }).click();
  await treeRow(page, 'images').click();
  await treeRow(page, 'img').click();
  const image = page.getByTestId('image-viewer').locator('img');
  await expect(image).toBeVisible();
  expect(await image.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(16);
});

test('"Download as .md" saves the note byte for byte', async ({ page }) => {
  await startLocal(page);
  await newNote(page, 'Só texto');
  await page.locator('.cm-content').click();
  await page.keyboard.type('Linha um\nLinha dois');
  await page.getByRole('tab').click({ button: 'right' });
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download as .md' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('Só texto.md');
  expect(readFileSync(await download.path(), 'utf8')).toBe('Linha um\nLinha dois');
});

test('the export reminder appears for a never-exported vault of ten notes', async ({ page }) => {
  await startLocal(page);
  await openData(page);
  const notes = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`note ${String(i)}.md`, new TextEncoder().encode('x')]),
  );
  await page.getByTestId('import-files').setInputFiles({
    name: 'ten.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(notes)),
  });
  await page.getByTestId('import-summary').getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Close' }).click();
  const reminder = page.getByTestId('export-reminder');
  await expect(reminder).toContainText('never been exported');
  await reminder.getByRole('button', { name: 'Later' }).click();
  await expect(reminder).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible();
  await expect(reminder).toHaveCount(0);
});
