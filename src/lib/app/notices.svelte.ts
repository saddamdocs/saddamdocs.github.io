/**
 * The snackbar's state (PLAN 4.1): one short notice at a time at the bottom of the window, with an
 * optional action such as "Undo" or "Reload". Used by the session and by the update prompt.
 *
 * Talks to: `config.ts` for the timeouts. Drawn by `ui/Snackbar.svelte`.
 */

import { SNACKBAR_TIMEOUT_MS, UNDO_TIMEOUT_MS } from '../config.ts';

/** A notice. */
export interface Snack {
  readonly id: number;
  readonly text: string;
  readonly action?: { readonly label: string; readonly run: () => void };
}

/** How long a notice stays. */
export type SnackDuration = 'short' | 'undo' | 'sticky';

/** The snackbar. */
export class Notices {
  /** The notice on screen, or null. */
  current: Snack | null = $state(null);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private counter = 0;

  /**
   * Shows a notice, replacing the one on screen.
   *
   * @param text - The notice.
   * @param action - An optional button.
   * @param duration - `short` (5 s), `undo` (the Undo time, PLAN 4.3) or `sticky` (until acted on,
   *   for "A new version is ready", PLAN 4.16). Defaults to `undo` with an action, `short` without.
   */
  notify(text: string, action?: Snack['action'], duration?: SnackDuration): void {
    clearTimeout(this.timer);
    this.counter += 1;
    const id = this.counter;
    this.current = action === undefined ? { id, text } : { id, text, action };
    const kind = duration ?? (action === undefined ? 'short' : 'undo');
    if (kind === 'sticky') return;
    this.timer = setTimeout(
      () => {
        if (this.current?.id === id) this.current = null;
      },
      kind === 'short' ? SNACKBAR_TIMEOUT_MS : UNDO_TIMEOUT_MS,
    );
  }

  /** Hides the notice on screen. */
  dismiss(): void {
    clearTimeout(this.timer);
    this.current = null;
  }
}
