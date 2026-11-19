/**
 * Build configuration (PLAN 3, 9): Svelte, the offline shell (vite-plugin-pwa with Workbox
 * `generateSW`, update by prompt), and everything that differs between channels.
 *
 * Modes, chosen with `--mode`:
 * - `next`, `stable`: the published builds (`npm run build:next`, `npm run build:stable`).
 * - `emulator`: the next channel pointed at the local database emulator, for Playwright tests
 *   (output in `dist-emulator/`). Never deployed.
 * - `development`: `npm run dev`, also pointed at the emulator.
 *
 * Talks to: `src/lib/channel.ts` (names, prefixes, database addresses), `src/lib/csp.ts` (the
 * content security policy) and `src/lib/settings/themes.ts` (manifest and splash colours).
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { channelDefinition, isChannelName, type ChannelName } from './src/lib/channel.ts';
import { contentSecurityPolicy } from './src/lib/csp.ts';
import { TAMANDUA_LIGHT } from './src/lib/settings/themes.ts';

/** The local Realtime Database emulator (firebase.json) and its default namespace (PLAN 5.8). */
const EMULATOR = {
  url: 'http://127.0.0.1:9000',
  namespace: 'demo-tamandua-default-rtdb',
} as const;

/** Reads the version from package.json, the only place it is written (PLAN 9). */
function packageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

/** The short commit hash: from GitHub Actions when present, otherwise from git, else `unknown`. */
function commitHash(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi !== undefined && fromCi !== '') return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // Building from an unpacked archive without git is legitimate; the About screen says so.
    return 'unknown';
  }
}

/** Escapes a value for use inside a double-quoted HTML attribute or a style block. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Fills the `%TAMANDUA_<NAME>%` placeholders of index.html.
 *
 * @param values - Placeholder names without the prefix and percent signs, mapped to their values.
 * @returns A Vite plugin. The build fails if index.html names a placeholder that has no value.
 */
function htmlPlaceholders(values: Readonly<Record<string, string>>): Plugin {
  return {
    name: 'tamandua-html-placeholders',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/%TAMANDUA_([A-Z_]+)%/g, (_match, name: string) => {
          const value = values[name];
          if (value === undefined) throw new Error(`index.html: no value for %TAMANDUA_${name}%`);
          return escapeHtml(value);
        });
      },
    },
  };
}

/** Virtual module that stands in for the probe page in stable builds. */
const PROBE_STUB = '\0tamandua-probe-stub';

/**
 * Leaves the spike B and D probe page out of stable builds (PLAN 7, M0: "on the next channel
 * only"). App.svelte already skips the probe there at run time, but the bundler still emits the
 * dynamically imported chunk, and Workbox would precache it. This plugin resolves the import to an
 * empty module instead.
 *
 * @param enabled - True for stable builds.
 * @returns A Vite plugin.
 */
function stubProbe(enabled: boolean): Plugin {
  return {
    name: 'tamandua-stub-probe',
    enforce: 'pre',
    resolveId(source) {
      return enabled && source.endsWith('/probe/Probe.svelte') ? PROBE_STUB : null;
    },
    load(id) {
      return id === PROBE_STUB ? 'export default null;' : null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const useEmulator = mode === 'emulator' || mode === 'development';
  const channelName: ChannelName = useEmulator ? 'next' : (mode as ChannelName);
  if (!isChannelName(channelName)) {
    throw new Error(`Unknown mode "${mode}". Use next, stable, emulator or development.`);
  }
  const def = channelDefinition(channelName);
  const csp = contentSecurityPolicy(useEmulator ? [EMULATOR.url] : []);

  return {
    base: '/',
    define: {
      __TAMANDUA_CHANNEL__: JSON.stringify(channelName),
      __TAMANDUA_EMULATOR__: useEmulator ? JSON.stringify(EMULATOR) : 'null',
      __TAMANDUA_BUILD__: JSON.stringify({
        version: packageVersion(),
        commit: commitHash(),
        date: new Date().toISOString(),
      }),
    },
    build: {
      outDir: mode === 'emulator' ? 'dist-emulator' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
    },
    preview: {
      host: '127.0.0.1',
    },
    server: {
      host: '127.0.0.1',
    },
    plugins: [
      stubProbe(channelName === 'stable'),
      htmlPlaceholders({
        CSP: csp,
        APP_NAME: def.appName,
        THEME_COLOR: TAMANDUA_LIGHT.panel,
        PAPER: TAMANDUA_LIGHT.paper,
      }),
      svelte(),
      VitePWA({
        strategies: 'generateSW',
        // PLAN 3, 4.16: a new version never replaces a running one without the user's click.
        registerType: 'prompt',
        // The app registers the worker itself through `virtual:pwa-register` (src/lib/updates.ts).
        injectRegister: false,
        includeAssets: ['icons/favicon.svg', 'icons/icon-32.png'],
        manifest: {
          id: '/',
          name: def.appName,
          short_name: def.appName,
          description: 'Offline-first Markdown notes with live preview and encrypted sync.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          // PLAN 4.16: the tab bar's cream, so an installed window's title bar blends in.
          theme_color: TAMANDUA_LIGHT.panel,
          background_color: TAMANDUA_LIGHT.paper,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // PLAN 4.16: every file of the app is precached; nothing else is cached at run time,
          // so database requests always go to the network.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
          // PLAN 5.9 rule 6: cache names start with the channel prefix.
          cacheId: def.prefix,
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          sourcemap: false,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  };
});
