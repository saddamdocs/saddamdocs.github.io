/**
 * Offline shell and updates (PLAN 4.16): registers the service worker that vite-plugin-pwa
 * generates, reports when a new version is waiting, and checks for one every hour.
 *
 * The app never reloads by itself. A waiting version is announced through `onNeedRefresh`; the UI
 * shows "A new version is ready" with "Reload", which calls the function this module returns.
 *
 * Talks to: the service worker (through `virtual:pwa-register`, which wraps workbox-window) and
 * `config.ts` for the check interval.
 */

import { registerSW } from 'virtual:pwa-register';
import { UPDATE_CHECK_INTERVAL_MS } from './config.ts';

/** Callbacks the UI provides to hear about the service worker. */
export interface UpdateHandlers {
  /** A new version is installed and waiting; show the reload prompt. */
  onNeedRefresh: () => void;
  /** The first install finished: the app now opens offline. */
  onOfflineReady: () => void;
  /** Registration failed: the app works, but not offline. */
  onError: (error: unknown) => void;
}

/**
 * Registers the service worker and starts the hourly update check.
 *
 * @param handlers - Callbacks for the UI.
 * @returns A function that activates the waiting version and reloads the page. Call it only after
 *   the user chose "Reload", and only after everything is saved (M2 adds the save step).
 */
export function startUpdates(handlers: UpdateHandlers): () => Promise<void> {
  return registerSW({
    immediate: true,
    onNeedRefresh: handlers.onNeedRefresh,
    onOfflineReady: handlers.onOfflineReady,
    onRegisterError: handlers.onError,
    onRegisteredSW(_url, registration) {
      if (registration === undefined) return;
      // PLAN 4.16: check at start (registration itself does that) and every hour.
      setInterval(() => {
        if (!navigator.onLine) return; // Nothing to fetch; the next tick or start-up will check.
        registration.update().catch((error: unknown) => {
          // A failed check changes nothing on the device; it is retried at the next interval.
          console.warn('Tamanduá: update check failed', error);
        });
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });
}
