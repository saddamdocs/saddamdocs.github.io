/**
 * Playwright configuration (PLAN 8, "Interface" and "Brave smoke run").
 *
 * Two servers, both `vite preview` of a built app so the real service worker runs:
 * - port 4173: the next build in `dist/` (build it first: `npm run build:next`);
 * - port 4174: the emulator build in `dist-emulator/`, whose database is the local emulator.
 * `npm run test:ui` builds both and runs everything inside `firebase emulators:exec`.
 *
 * Projects:
 * - `chromium`: Playwright's Chromium, every test. Runs locally and in CI.
 * - `brave`: the installed Brave through `executablePath`, only tests tagged `@brave`. Local only.
 *
 * Talks to: nothing; read by Playwright.
 */

import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/** Where Brave is installed on Fedora (RPM). Override with BRAVE_PATH. */
const BRAVE_PATH = process.env.BRAVE_PATH ?? '/usr/bin/brave-browser';

/** Port of the next build's preview server. */
export const NEXT_PORT = 4173;
/** Port of the emulator build's preview server. */
export const EMULATOR_PORT = 4174;

export default defineConfig({
  testDir: 'tests/ui',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${String(NEXT_PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `npx vite preview --mode next --port ${String(NEXT_PORT)} --strictPort`,
      url: `http://127.0.0.1:${String(NEXT_PORT)}`,
      reuseExistingServer: process.env.CI === undefined,
    },
    {
      command: `npx vite preview --mode emulator --port ${String(EMULATOR_PORT)} --strictPort`,
      url: `http://127.0.0.1:${String(EMULATOR_PORT)}`,
      reuseExistingServer: process.env.CI === undefined,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(existsSync(BRAVE_PATH)
      ? [
          {
            name: 'brave',
            grep: /@brave/,
            use: {
              ...devices['Desktop Chrome'],
              launchOptions: { executablePath: BRAVE_PATH },
            },
          },
        ]
      : []),
  ],
});
