/**
 * M3a sync tests in the browser (PLAN 8, "Sync tests"): two Playwright contexts with separate
 * storage are two devices, using the emulator build (port 4174), whose database is the local
 * emulator. A starts a synced vault, B connects with the key and the passphrase.
 *
 * Covers the budgets of PLAN 5.8 and R5 for an open note, a remote edit that Ctrl+Z on B does not
 * undo, a rename reaching the tree, offline changes uploading on reconnecting, and I6 checked by
 * intercepting every request.
 */

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { EMULATOR_PORT } from '../../playwright.config.ts';
import { treeRow, typeName } from '../support/app.ts';
import { RULES, loadRules } from '../support/emulator.ts';

const APP = `http://127.0.0.1:${String(EMULATOR_PORT)}/`;
const PASSPHRASE = 'quatro palavras ao acaso para testar';

/** A device: a browser context, its page, and every request it sent to the database. */
interface Device {
  context: BrowserContext;
  page: Page;
  requests: string[];
}

async function newDevice(browser: Browser): Promise<Device> {
  const context = await browser.newContext({ baseURL: APP });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('http://127.0.0.1:9000/')) requests.push(r.url());
  });
  return { context, page, requests };
}

/** A starts a synced vault from the welcome screen and returns the key it shows. */
async function startVault(device: Device): Promise<string> {
  const { page } = device;
  await page.goto(APP);
  await page.getByRole('button', { name: 'Start a new synced vault' }).click();
  await page.getByTestId('passphrase').fill(PASSPHRASE);
  await page.getByTestId('passphrase-again').fill(PASSPHRASE);
  await page.getByTestId('device-name').fill('Device A');
  await page.getByTestId('sync-submit').click();
  const key = ((await page.getByTestId('sync-key').textContent()) ?? '').replace(/\s/g, '');
  expect(key).toMatch(/^[A-Za-z0-9]{32}$/);
  await page.getByTestId('key-done').click();
  await expect(page.getByTestId('shell')).toBeVisible();
  return key;
}

/** B connects with the key and the passphrase. */
async function connect(device: Device, key: string): Promise<void> {
  const { page } = device;
  await page.goto(APP);
  await page.getByRole('button', { name: 'Connect to my vault' }).click();
  await page.getByTestId('sync-key-input').fill(key.replace(/(.{4})/g, '$1 '));
  await page.getByTestId('passphrase').fill(PASSPHRASE);
  await page.getByTestId('device-name').fill('Device B');
  await page.getByTestId('sync-submit').click();
  await expect(page.getByTestId('shell')).toBeVisible();
}

test.beforeAll(async () => {
  await loadRules('demo-tamandua-default-rtdb', RULES);
});

test('a note typed on A appears on B, in place, and Ctrl+Z on B does not undo it @brave', async ({
  browser,
}) => {
  const a = await newDevice(browser);
  const b = await newDevice(browser);
  const key = await startVault(a);
  await a.page.getByTestId('new-note').click();
  await typeName(a.page, 'Partilhada');
  await a.page.locator('.cm-content').click();
  await a.page.keyboard.type('Primeira linha.');
  await expect(a.page.getByTestId('sync-chip')).toHaveText('Synced', { timeout: 10_000 });

  await connect(b, key);
  await treeRow(b.page, 'Partilhada').click();
  await expect(b.page.locator('.cm-content')).toHaveText('Primeira linha.');
  await b.page.locator('.cm-content').click();
  await b.page.keyboard.press('Control+End');
  await b.page.keyboard.type(' B');
  await expect(b.page.getByTestId('sync-chip')).toHaveText('Synced', { timeout: 10_000 });
  await expect(a.page.locator('.cm-content')).toHaveText('Primeira linha. B', { timeout: 10_000 });

  // A types; B shows it within the budget: 3 s to the database, 2 s more to an open note (R5).
  await a.page.locator('.cm-content').click();
  await a.page.keyboard.press('Control+End');
  const typedAt = Date.now();
  await a.page.keyboard.type(' Segunda.');
  await expect(b.page.locator('.cm-content')).toHaveText('Primeira linha. B Segunda.', {
    timeout: 6000,
  });
  expect(Date.now() - typedAt).toBeLessThan(6000);

  // Ctrl+Z on B undoes B's own " B", never A's " Segunda." (PLAN 6.2).
  await b.page.locator('.cm-content').click();
  await b.page.keyboard.press('Control+z');
  await expect(b.page.locator('.cm-content')).toHaveText('Primeira linha. Segunda.');

  // I6: every request went to /tamandua/<key> on the emulator: the branch itself (the multi-path
  // upload of PLAN 5.8) or a path below it.
  const mine = new RegExp(`^http://127\\.0\\.0\\.1:9000/tamandua/${key}(\\.json|/)`);
  for (const url of [...a.requests, ...b.requests]) expect(url, url).toMatch(mine);
  await a.context.close();
  await b.context.close();
});

test("a rename on A reaches B's tree; changes made offline upload on reconnecting", async ({
  browser,
}) => {
  const a = await newDevice(browser);
  const b = await newDevice(browser);
  const key = await startVault(a);
  await a.page.getByTestId('new-note').click();
  await typeName(a.page, 'Antes');
  await expect(a.page.getByTestId('sync-chip')).toHaveText('Synced', { timeout: 10_000 });
  await connect(b, key);
  await expect(treeRow(b.page, 'Antes')).toBeVisible();

  await treeRow(a.page, 'Antes').press('F2');
  await typeName(a.page, 'Depois');
  await expect(a.page.getByTestId('sync-chip')).toHaveText('Synced', { timeout: 10_000 });
  // The tree follows within 30 s, and at once when the window regains focus (PLAN 4.5).
  await b.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(treeRow(b.page, 'Depois')).toBeVisible({ timeout: 5000 });

  // Offline on A: the change waits and the chip counts it; back online, it uploads.
  await a.context.setOffline(true);
  await treeRow(a.page, 'Depois').click();
  await a.page.locator('.cm-content').click();
  await a.page.keyboard.type('Escrito sem rede.');
  await expect(a.page.getByTestId('sync-chip')).toHaveText('Offline · 1 waiting', {
    timeout: 5000,
  });
  await a.context.setOffline(false);
  await expect(a.page.getByTestId('sync-chip')).toHaveText('Synced', { timeout: 10_000 });
  await b.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await treeRow(b.page, 'Depois').click();
  await expect(b.page.locator('.cm-content')).toHaveText('Escrito sem rede.', { timeout: 5000 });
  await a.context.close();
  await b.context.close();
});

test('a wrong passphrase is refused before anything is downloaded', async ({ browser }) => {
  const a = await newDevice(browser);
  const b = await newDevice(browser);
  const key = await startVault(a);
  await b.page.goto(APP);
  await b.page.getByRole('button', { name: 'Connect to my vault' }).click();
  await b.page.getByTestId('sync-key-input').fill(key);
  await b.page.getByTestId('passphrase').fill('this is not the passphrase');
  await b.page.getByTestId('sync-submit').click();
  await expect(b.page.getByRole('alert')).toHaveText('The passphrase does not open this vault.');
  expect(b.requests.filter((u) => u.includes('/items'))).toEqual([]);
  await a.context.close();
  await b.context.close();
});
