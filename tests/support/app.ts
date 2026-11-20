/**
 * Helpers for Playwright tests of the app: start a vault on this device, create and rename items
 * through the interface, and find tree rows. Every helper acts like a user would.
 */

import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Opens the app in a fresh profile and chooses "Use only on this device for now".
 *
 * @param page - A page with empty storage.
 * @returns Resolves when the shell shows.
 */
export async function startLocal(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Use only on this device for now' }).click();
  await expect(page.getByTestId('shell')).toBeVisible();
}

/**
 * Finds a tree row by its exact name.
 *
 * @param page - The page.
 * @param name - The item's name.
 * @returns The row's locator.
 */
export function treeRow(page: Page, name: string): Locator {
  return page.locator('[role="treeitem"]').filter({
    has: page.locator('.name', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }),
  });
}

/** Escapes a string for use inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Types a name into the tree's rename field and presses Enter.
 *
 * @param page - The page.
 * @param name - The new name.
 * @returns Resolves when the field closed.
 */
export async function typeName(page: Page, name: string): Promise<void> {
  const input = page.locator('input.rename');
  await input.fill(name);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
}

/**
 * Creates a note with the "New note" button, in the selected folder, and names it.
 *
 * @param page - The page.
 * @param name - The note's name.
 * @returns Resolves when the note shows in the tree.
 */
export async function newNote(page: Page, name: string): Promise<void> {
  await page.getByTestId('new-note').click();
  await typeName(page, name);
  await expect(treeRow(page, name)).toBeVisible();
}

/**
 * Creates a folder with the "New folder" button, in the selected folder, and names it.
 *
 * @param page - The page.
 * @param name - The folder's name.
 * @returns Resolves when the folder shows in the tree.
 */
export async function newFolder(page: Page, name: string): Promise<void> {
  await page.getByTestId('new-folder').click();
  await typeName(page, name);
  await expect(treeRow(page, name)).toBeVisible();
}

/**
 * The tree as text: one line per visible row, indented two spaces per level.
 *
 * @param page - The page.
 * @returns The rows.
 */
export async function treeText(page: Page): Promise<string[]> {
  return page.locator('[role="treeitem"]').evaluateAll((rows) =>
    rows.map((row) => {
      const level = Number(row.getAttribute('aria-level') ?? '1');
      const name = row.querySelector('.name')?.textContent ?? '';
      return `${'  '.repeat(level - 1)}${name}`;
    }),
  );
}
