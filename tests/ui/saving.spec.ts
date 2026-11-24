/**
 * M2 UI tests for saving (PLAN 4.4, 6.2, R4): typed text reaches IndexedDB within a second,
 * closing the page abruptly a second after the last keystroke loses nothing, and a failed save
 * shows the banner, keeps the text and recovers with Retry.
 */

import { expect, test, type Page } from '@playwright/test';
import { newNote, startLocal, treeRow } from '../support/app.ts';

/** Reads a note's stored text straight from IndexedDB, by the note's name. */
async function storedText(page: Page, name: string): Promise<string | null> {
  return page.evaluate(async (noteName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tamandua-next');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
    const read = <T>(store: string): Promise<T[]> =>
      new Promise((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      });
    const items = await read<{ id: string; name: string; kind: string }>('items');
    const texts = await read<{ id: string; text: string }>('texts');
    db.close();
    const item = items.find((i) => i.kind === 'note' && i.name === noteName);
    return texts.find((t) => t.id === item?.id)?.text ?? null;
  }, name);
}

test('typed text is in IndexedDB within a second of the last keystroke (PLAN R4)', async ({
  page,
}) => {
  await startLocal(page);
  await newNote(page, 'Fast');
  await page.locator('.cm-content').click();
  await page.keyboard.type('Ação rápida');
  const typedAt = Date.now();
  await expect
    .poll(() => storedText(page, 'Fast'), { timeout: 1000, intervals: [100] })
    .toBe('Ação rápida');
  expect(Date.now() - typedAt).toBeLessThan(1000);
});

test('closing the page abruptly a second after the last keystroke loses nothing @brave', async ({
  page,
  context,
}) => {
  await startLocal(page);
  await newNote(page, 'Abrupt');
  await page.locator('.cm-content').click();
  await page.keyboard.type('Nothing may be lost.');
  await page.waitForTimeout(1000);
  // No beforeunload, no chance to save on the way out: as if the window was killed.
  await page.close({ runBeforeUnload: false });
  const again = await context.newPage();
  await again.goto('/');
  await expect(again.getByTestId('shell')).toBeVisible();
  await treeRow(again, 'Abrupt').click();
  await expect(again.locator('.cm-content')).toHaveText('Nothing may be lost.');
});

test('a failed save shows the banner, keeps the text, and Retry recovers', async ({ page }) => {
  // Make writes to the `texts` store fail while a flag is set, as a full disk would.
  await page.addInitScript(() => {
    // Unbound on purpose: the wrapper calls it with the store as `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
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
  await startLocal(page);
  await newNote(page, 'Fragile');
  await page.evaluate(() => ((window as unknown as { failSaves: boolean }).failSaves = true));
  await page.locator('.cm-content').click();
  await page.keyboard.type('Kept in memory.');
  await expect(page.getByTestId('save-failed')).toBeVisible();
  await expect(page.getByTestId('save-state')).toHaveText('Not saved');
  await expect(page.locator('.cm-content')).toHaveText('Kept in memory.');
  await page.evaluate(() => ((window as unknown as { failSaves: boolean }).failSaves = false));
  await page.getByTestId('save-failed').getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByTestId('save-failed')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  expect(await storedText(page, 'Fragile')).toBe('Kept in memory.');
});
