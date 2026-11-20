/**
 * Runs the save state machine of PLAN 6.2 for each open note: timers, the IndexedDB write through
 * the vault, and retries. Also saves every open note when the page is hidden or closed, and asks
 * for the browser's "Leave site?" prompt only while a save has not finished (PLAN 4.4, R4).
 *
 * Talks to: `autosave/machine.ts` (the rules), `vault/operations.ts` (`saveText`),
 * `store/log.ts`, `config.ts`, and the window's `visibilitychange`, `pagehide` and
 * `beforeunload` events.
 */

import { SAVE_DEBOUNCE_MS, SAVE_MAX_DELAY_MS } from '../config.ts';
import { logEvent } from '../store/log.ts';
import type { Vault } from '../vault/operations.ts';
import {
  CLEAN,
  hasUnsaved,
  step,
  type SaveEffect,
  type SaveEvent,
  type SaveState,
  type SaveTiming,
} from './machine.ts';

/** The delays of PLAN 4.4. */
export const TIMING: SaveTiming = {
  debounce: SAVE_DEBOUNCE_MS,
  maxDelay: SAVE_MAX_DELAY_MS,
  retries: [2000, 5000, 15_000, 30_000],
};

/** The saving of one open note. */
export class NoteSaver {
  private state: SaveState = CLEAN;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private idleWaiters: (() => void)[] = [];

  /**
   * @param itemId - The note.
   * @param vault - Writes the text.
   * @param getText - Returns the editor's current text.
   * @param onState - Called after every state change, for the status bar and the error banner.
   * @param clock - Device time in ms.
   */
  constructor(
    readonly itemId: string,
    private readonly vault: Vault,
    private readonly getText: () => string,
    private readonly onState: (state: SaveState) => void,
    private readonly clock: () => number = Date.now,
  ) {}

  /** The current save state. */
  get current(): SaveState {
    return this.state;
  }

  /** Reports an edit in the editor. */
  edit(): void {
    this.dispatch({ type: 'edit', now: this.clock() });
  }

  /** Saves at once if anything is unsaved (blur, close, page hidden, Ctrl+S). */
  flush(): void {
    this.dispatch({ type: 'flush', now: this.clock() });
  }

  /**
   * Saves at once and waits until the note is clean, or until a write fails.
   *
   * @returns Resolves when nothing is unsaved, or after a failed attempt.
   */
  async flushAndWait(): Promise<void> {
    this.flush();
    if (this.state.status === 'clean' || this.state.status === 'failed') return;
    await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  /** Stops the timers. Call after `flushAndWait` when the note closes. */
  dispose(): void {
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
  }

  private dispatch(event: SaveEvent): void {
    const result = step(this.state, event, TIMING);
    this.state = result.state;
    for (const effect of result.effects) this.run(effect);
    this.onState(this.state);
    if (this.state.status === 'clean' || this.state.status === 'failed') {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  private run(effect: SaveEffect): void {
    switch (effect.type) {
      case 'set-timer':
        clearTimeout(this.timer);
        this.timer = setTimeout(
          () => this.dispatch({ type: 'timer', now: this.clock() }),
          effect.delay,
        );
        break;
      case 'clear-timer':
        clearTimeout(this.timer);
        break;
      case 'write':
        this.vault.saveText(this.itemId, this.getText()).then(
          () => this.dispatch({ type: 'written', now: this.clock() }),
          (error: unknown) => {
            void logEvent(
              this.vault.db,
              'error',
              'save-failed',
              `${this.itemId} ${error instanceof Error ? error.name : ''}`,
            );
            this.dispatch({ type: 'write-failed', now: this.clock() });
          },
        );
        break;
      case 'set-retry':
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(
          () => this.dispatch({ type: 'retry', now: this.clock() }),
          effect.delay,
        );
        break;
      case 'show-error':
      case 'hide-error':
      case 'changed':
        // The UI reads the state through `onState`; the sync engine listens from M3a.
        break;
    }
  }
}

/** Every open note's saver, for the page-level rules of PLAN 4.4. */
export class SaveRegistry {
  private readonly savers = new Set<NoteSaver>();

  /**
   * Starts watching the page: saves everything when it is hidden or closed, and requests the
   * browser's prompt only while a save is unfinished.
   *
   * @param target - The window.
   * @returns A function that stops watching.
   */
  watch(target: Window): () => void {
    const saveAll = (): void => {
      for (const saver of this.savers) saver.flush();
    };
    const onVisibility = (): void => {
      if (target.document.visibilityState === 'hidden') saveAll();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      saveAll();
      // PLAN 4.4: the only prompt about saving, and only while an edit has not reached IndexedDB.
      if ([...this.savers].some((s) => hasUnsaved(s.current))) event.preventDefault();
    };
    target.document.addEventListener('visibilitychange', onVisibility);
    target.addEventListener('pagehide', saveAll);
    target.addEventListener('blur', saveAll);
    target.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      target.document.removeEventListener('visibilitychange', onVisibility);
      target.removeEventListener('pagehide', saveAll);
      target.removeEventListener('blur', saveAll);
      target.removeEventListener('beforeunload', onBeforeUnload);
    };
  }

  /**
   * Adds a saver.
   *
   * @param saver - The saver of a note that was opened.
   */
  add(saver: NoteSaver): void {
    this.savers.add(saver);
  }

  /**
   * Removes a saver after its note closed.
   *
   * @param saver - The saver.
   */
  remove(saver: NoteSaver): void {
    this.savers.delete(saver);
  }

  /**
   * Saves every open note and waits (before a reload, before yielding the window).
   *
   * @returns Resolves when every note is clean or has failed.
   */
  async flushAll(): Promise<void> {
    await Promise.all([...this.savers].map((s) => s.flushAndWait()));
  }

  /**
   * Tells whether any open note has unsaved edits.
   *
   * @returns True while something is dirty, saving or failed.
   */
  anyUnsaved(): boolean {
    return [...this.savers].some((s) => hasUnsaved(s.current));
  }
}
