/**
 * PLAN 5.10, "Making the web app behave like a desktop app": one test per rule, against the next
 * build. Context menus, drag and drop, navigation, selection, start-up, the window title, one window
 * at a time, and fonts. Clipboard images are tested in M5, where pasting images is built.
 */

import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { newNote, startLocal, treeRow } from '../support/app.ts';

test("context menus: the app's own on the tree, the browser's in the editor", async ({ page }) => {
  await startLocal(page);
  await newNote(page, 'Menu test');
  const prevented = (selector: string): Promise<boolean> =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const event = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 50,
          clientY: 50,
        });
        el.dispatchEvent(event);
        return event.defaultPrevented;
      });
  expect(await prevented('[role="treeitem"]')).toBe(true);
  await expect(page.getByTestId('context-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await prevented('.cm-content')).toBe(false);
  expect(await prevented('[role="tab"]')).toBe(true);
});

test('a file dropped on the page does not open in it', async ({ page }) => {
  await startLocal(page);
  const url = page.url();
  const refused = await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['# hello'], 'dropped.md', { type: 'text/markdown' }));
    const target = document.querySelector('.cm-editor, .pane, main, body') ?? document.body;
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data });
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data });
    target.dispatchEvent(over);
    target.dispatchEvent(drop);
    return over.defaultPrevented && drop.defaultPrevented;
  });
  expect(refused).toBe(true);
  expect(page.url()).toBe(url);
});

test('the app never navigates away: no link in the shell leaves the page', async ({ page }) => {
  await startLocal(page);
  const leaving = await page
    .locator('a[href]')
    .evaluateAll(
      (links) => links.filter((a) => (a as HTMLAnchorElement).target !== '_blank').length,
    );
  expect(leaving).toBe(0);
});

test('the chrome cannot be selected, the editor can', async ({ page }) => {
  await startLocal(page);
  await newNote(page, 'Select me');
  const userSelect = (selector: string): Promise<string> =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).userSelect);
  expect(await userSelect('[data-testid="sidebar"]')).toBe('none');
  expect(await userSelect('[data-testid="tabbar"]')).toBe('none');
  expect(await userSelect('[data-testid="statusbar"]')).toBe('none');
  expect(await userSelect('.cm-content')).not.toBe('none');
});

test('start-up paints the icon on the theme background before any script, with no inline script', async ({
  page,
}) => {
  const html = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');
  expect(html).toMatch(/<div id="splash"><img src="\/icons\/favicon.svg" width="128"/);
  expect(html).toMatch(/background:\s*#fcf9f3/i);
  expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  await page.goto('/');
  await expect(page.locator('#splash')).toHaveCount(0);
  const background = await page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  );
  expect(background).toBe('rgb(252, 249, 243)');
});

test('the window title names the open note', async ({ page }) => {
  await startLocal(page);
  await expect(page).toHaveTitle('Tamanduá (next)');
  await newNote(page, 'Títulos');
  await expect(page).toHaveTitle('Títulos — Tamanduá (next)');
});

test('one window at a time, and "Use it here" moves the app @brave', async ({ page, context }) => {
  await startLocal(page);
  await newNote(page, 'Only here');
  const second = await context.newPage();
  await second.goto('/');
  await expect(
    second.getByRole('heading', { name: 'Tamanduá is open in another window' }),
  ).toBeVisible();
  await second.getByTestId('use-here').click();
  await expect(second.getByTestId('shell')).toBeVisible();
  await expect(treeRow(second, 'Only here')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Tamanduá is open in another window' }),
  ).toBeVisible();
  // And back again: the first page reloads from storage when it takes over.
  await page.getByTestId('use-here').click();
  await expect(page.getByTestId('shell')).toBeVisible();
  await expect(
    second.getByRole('heading', { name: 'Tamanduá is open in another window' }),
  ).toBeVisible();
});

test('fonts: Inter for the interface and notes, JetBrains Mono for code, swapped in', async ({
  page,
}) => {
  await startLocal(page);
  await newNote(page, 'Fonts');
  const vars = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return ['--font-ui', '--font-text', '--font-mono'].map((v) => style.getPropertyValue(v));
  });
  expect(vars[0]).toContain('Inter Variable');
  expect(vars[1]).toContain('Inter Variable');
  expect(vars[2]).toContain('JetBrains Mono Variable');
  const faces = await page.evaluate(() =>
    [...document.fonts].map((f) => `${f.family.replaceAll('"', '')} ${f.style} ${f.display}`),
  );
  expect(faces).toContain('Inter Variable normal swap');
  expect(faces).toContain('JetBrains Mono Variable italic swap');
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px "Inter Variable"')))
    .toBe(true);
});
