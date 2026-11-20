/**
 * UI tests of the app shell against the next build (PLAN 7, M0 and M1; PLAN 8, "Interface"):
 * the first screen, the page's policy and manifest, the service worker, an offline reload, the
 * channel prefix of the caches, and the shortcut probe of spike B. Tests tagged @brave also run in
 * the installed Brave (`npm run test:brave`).
 */

import { expect, test, type Page } from '@playwright/test';
import { newNote, startLocal, treeRow } from '../support/app.ts';

/** Waits until a service worker controls the page, reloading once if needed. */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

test('a first launch shows the welcome screen with one choice enabled @brave', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Tamanduá (next)');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tamanduá');
  await expect(page.getByRole('button', { name: 'Start a new synced vault' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Connect to my vault' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Use only on this device for now' })).toBeEnabled();
  await expect(page.locator('#splash')).toHaveCount(0);
});

test('the page carries the content security policy of PLAN 5.9', async ({ page }) => {
  await page.goto('/');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("script-src 'self';");
  expect(csp).toContain("connect-src 'self' https://*.firebasedatabase.app;");
  expect(csp).not.toContain('127.0.0.1');
});

test('the manifest follows PLAN 4.16', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  const manifest = (await (await request.get(href ?? '')).json()) as Record<string, unknown>;
  expect(manifest).toMatchObject({
    name: 'Tamanduá (next)',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#F2E6CF',
    background_color: '#FCF9F3',
  });
  const icons = manifest.icons as { src: string; purpose: string }[];
  expect(icons.map((i) => `${i.src} ${i.purpose}`)).toEqual([
    '/icons/icon-192.png any',
    '/icons/icon-512.png any',
    '/icons/icon-maskable-512.png maskable',
  ]);
  for (const icon of icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test('after one visit the app and its notes open offline @brave', async ({ page, context }) => {
  await startLocal(page);
  await newNote(page, 'Offline note');
  await waitForServiceWorker(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(treeRow(page, 'Offline note')).toBeVisible();
    // A navigation to another path is served by the app shell too (navigateFallback).
    await page.goto('/?probe');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shortcut and database probe');
  } finally {
    await context.setOffline(false);
  }
});

test('every cache name starts with the channel prefix (PLAN 5.9 rule 6)', async ({ page }) => {
  await page.goto('/');
  await waitForServiceWorker(page);
  const names = await page.evaluate(() => caches.keys());
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) expect(name.startsWith('tamandua-next')).toBe(true);
});

test('spike B probe records shortcuts that reach the page @brave', async ({ page }) => {
  await page.goto('/?probe');
  await expect(page.getByTestId('display-mode')).toHaveText('browser tab');
  await page.keyboard.press('Alt+N');
  await page.keyboard.press('Control+Shift+Backslash');
  await page.keyboard.press('Alt+Minus');
  await expect(page.getByTestId('reached-Alt+N')).toHaveText('yes');
  await expect(page.getByTestId('reached-Ctrl+Shift+\\')).toHaveText('yes');
  await expect(page.getByTestId('reached-Alt+-')).toHaveText('yes');
  await expect(page.getByTestId('reached-Ctrl+S')).toHaveText('–');
});
