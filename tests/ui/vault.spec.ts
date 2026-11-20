/**
 * M1 UI tests (PLAN 7, M1 acceptance): nested folders and notes are created, renamed, moved,
 * deleted, undone and restored through the interface, and everything survives a reload. Also the
 * keyboard of the tree, the name rules as the user meets them, and saving typed text.
 */

import { expect, test, type Page } from '@playwright/test';
import { newFolder, newNote, startLocal, treeRow, treeText, typeName } from '../support/app.ts';

/** Clears the tree's selection, so new items go to the root. */
async function selectRoot(page: Page): Promise<void> {
  const tree = page.getByTestId('tree');
  const box = await tree.boundingBox();
  if (box === null) throw new Error('no tree');
  await tree.click({ position: { x: 10, y: box.height - 10 } });
}

/** Builds Projects/Tamanduá/Plan and Inbox at the root. */
async function buildTree(page: Page): Promise<void> {
  await newFolder(page, 'Projects');
  await newFolder(page, 'Tamanduá');
  await newNote(page, 'Plan');
  await selectRoot(page);
  await newNote(page, 'Inbox');
}

test.beforeEach(async ({ page }) => {
  await startLocal(page);
});

test('nested folders and notes are created and renamed, and survive a reload @brave', async ({
  page,
}) => {
  await buildTree(page);
  await expect.poll(() => treeText(page)).toEqual(['Projects', '  Tamanduá', '    Plan', 'Inbox']);

  await treeRow(page, 'Plan').click();
  await treeRow(page, 'Plan').press('F2');
  await typeName(page, 'Plano de ação');
  await treeRow(page, 'Tamanduá').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await typeName(page, 'Tamanduá notes');

  // Renaming the note's folder and the note changes the path the status bar shows.
  await expect(page.getByTestId('status-path')).toHaveText(
    'Projects/Tamanduá notes/Plano de ação.md',
  );
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible();
  await expect
    .poll(() => treeText(page))
    .toEqual(['Projects', '  Tamanduá notes', '    Plano de ação', 'Inbox']);
});

test('a note moves by drag and drop, and Undo moves it back', async ({ page }) => {
  await buildTree(page);
  await treeRow(page, 'Inbox').dragTo(treeRow(page, 'Tamanduá'));
  await expect
    .poll(() => treeText(page))
    .toEqual(['Projects', '  Tamanduá', '    Inbox', '    Plan']);
  await page.getByTestId('snackbar').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => treeText(page)).toEqual(['Projects', '  Tamanduá', '    Plan', 'Inbox']);
});

test('a folder cannot be dropped into itself', async ({ page }) => {
  await buildTree(page);
  await treeRow(page, 'Projects').dragTo(treeRow(page, 'Tamanduá'));
  await expect(page.getByTestId('snackbar')).toContainText('cannot go inside itself');
  await expect.poll(() => treeText(page)).toEqual(['Projects', '  Tamanduá', '    Plan', 'Inbox']);
});

test('delete, Undo, the Trash, restore and delete forever', async ({ page }) => {
  await buildTree(page);

  // Delete a folder: its contents go with it; Undo brings everything back.
  await treeRow(page, 'Projects').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect.poll(() => treeText(page)).toEqual(['Inbox']);
  await page.getByTestId('snackbar').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => treeText(page)).toEqual(['Projects', '  Tamanduá', '    Plan', 'Inbox']);

  // Delete with the Delete key, find it in the Trash, restore it.
  // Focus, not click: a click on a folder row also toggles it (as in Obsidian).
  await treeRow(page, 'Projects').focus();
  await treeRow(page, 'Projects').press('Delete');
  await page.getByTestId('trash-button').click();
  const entry = page.getByTestId('trash-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Projects');
  await expect(entry).toContainText('2 items inside');
  await entry.getByRole('button', { name: 'Restore Projects' }).click();
  await expect(entry).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to notes' }).click();
  await expect(treeRow(page, 'Plan')).toBeVisible();

  // Delete forever asks first, then takes the folder and everything inside.
  // Focus, not click: a click on a folder row also toggles it (as in Obsidian).
  await treeRow(page, 'Projects').focus();
  await treeRow(page, 'Projects').press('Delete');
  await page.getByTestId('trash-button').click();
  await page.getByRole('button', { name: 'Delete forever Projects' }).click();
  await expect(page.getByTestId('confirm')).toContainText('cannot be undone');
  await page.getByTestId('confirm').getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.getByTestId('trash-entry')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('shell')).toBeVisible();
  await expect.poll(() => treeText(page)).toEqual(['Inbox']);
});

test('deleting an open note closes its tab, and Undo reopens it', async ({ page }) => {
  await newNote(page, 'Open me');
  await expect(page.getByTestId('tabbar')).toContainText('Open me');
  await treeRow(page, 'Open me').click();
  await treeRow(page, 'Open me').press('Delete');
  await expect(page.getByTestId('tabbar')).not.toContainText('Open me');
  await page.getByTestId('snackbar').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('tabbar')).toContainText('Open me');
});

test('names that break the rules are refused with the reason', async ({ page }) => {
  await newNote(page, 'Plan');
  await newNote(page, 'Other');
  await treeRow(page, 'Other').click();
  await treeRow(page, 'Other').press('F2');
  const input = page.locator('input.rename');
  await input.fill('a:b');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('cannot contain');
  await input.fill('PLAN');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('already has this name');
  await input.press('Escape');
  await expect(treeRow(page, 'Other')).toBeVisible();
});

test('the tree works from the keyboard', async ({ page }) => {
  await newFolder(page, 'Folder');
  await newNote(page, 'Inside');
  await selectRoot(page);
  await newNote(page, 'Loose');
  // Start at the first row and walk down.
  await treeRow(page, 'Folder').focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => treeText(page)).toEqual(['Folder', 'Loose']);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => treeText(page)).toEqual(['Folder', '  Inside', 'Loose']);
  await page.keyboard.press('ArrowDown');
  await expect(treeRow(page, 'Inside')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveTitle('Loose — Tamanduá (next)');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Delete');
  await expect.poll(() => treeText(page)).toEqual(['Folder', 'Loose']);
});

test('typed text is saved within a second and survives a reload @brave', async ({ page }) => {
  await newNote(page, 'Diário');
  await page.locator('.cm-content').click();
  await page.keyboard.type('Olá, coração! Ação.');
  await expect(page.getByTestId('save-state')).toHaveText('Saved', { timeout: 1000 });
  await expect(page.getByTestId('word-count')).toHaveText('3 words');
  await page.reload();
  await expect(page.locator('.cm-content')).toHaveText('Olá, coração! Ação.');
});
