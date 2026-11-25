/**
 * Vitest configuration (PLAN 8): one project per test layer.
 * - `unit`: pure logic, no browser and no emulator (`npm run test:unit`).
 * - `rules`: REST requests to the Realtime Database emulator, which `npm run test:rules` starts
 *   through `firebase emulators:exec` with the `demo-tamandua` project.
 * - `sync`: the sync engine against the emulator (`npm run test:sync`). M3b adds `sim`.
 *
 * Talks to: nothing; read by Vitest.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'sync',
          include: ['tests/sync/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'rules',
          include: ['tests/rules/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
        },
      },
    ],
  },
});
