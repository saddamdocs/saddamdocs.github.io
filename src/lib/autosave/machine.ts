/**
 * The save state machine of one open note (PLAN 6.2), as a pure reducer: given a state and an
 * event, it returns the next state and the effects to run. `autosave/controller.ts` runs the
 * effects (timers, the IndexedDB write, the banner).
 *
 * States: clean (the editor equals IndexedDB), dirty (a save timer runs), saving (a write is in
 * flight), failed (the last write failed; a retry is scheduled).
 *
 * Talks to: nothing. Pure; tested with fake timers in tests/unit/autosave.test.ts.
 */

/** Timing of saves (PLAN 4.4). */
export interface SaveTiming {
  /** Delay after the last keystroke, in ms (300). */
  readonly debounce: number;
  /** Latest save after the first unsaved keystroke, in ms (2000). */
  readonly maxDelay: number;
  /** Delays between retries of a failed save, in ms; the last one repeats (2 s, 5 s, 15 s, 30 s). */
  readonly retries: readonly number[];
}

/** The state of one note's saving. */
export type SaveState =
  | { readonly status: 'clean' }
  | { readonly status: 'dirty'; readonly firstEdit: number }
  | {
      readonly status: 'saving';
      /** Time of the first edit made while the write was in flight, or null. */
      readonly editedSince: number | null;
      /** Failed writes before this one; 0 for an ordinary save. */
      readonly attempt: number;
    }
  | { readonly status: 'failed'; readonly attempt: number };

/** What can happen to a note's saving. */
export type SaveEvent =
  | { readonly type: 'edit'; readonly now: number }
  /** The save timer fired. */
  | { readonly type: 'timer'; readonly now: number }
  /** Save at once: blur, tab close, page hidden, `pagehide`, Ctrl+S (PLAN 4.4). */
  | { readonly type: 'flush'; readonly now: number }
  | { readonly type: 'written'; readonly now: number }
  | { readonly type: 'write-failed'; readonly now: number }
  /** The retry timer fired. */
  | { readonly type: 'retry'; readonly now: number }
  /** Sync applied a remote version and saved the editor's text itself (PLAN 6.2, 6.3). */
  | { readonly type: 'remote-applied' };

/** What the controller must do. */
export type SaveEffect =
  | { readonly type: 'set-timer'; readonly delay: number }
  | { readonly type: 'clear-timer' }
  | { readonly type: 'write' }
  | { readonly type: 'show-error' }
  | { readonly type: 'hide-error' }
  | { readonly type: 'set-retry'; readonly delay: number }
  /** Tell the sync engine the item changed (from M3a). */
  | { readonly type: 'changed' };

/** The result of one step. */
export interface SaveStep {
  readonly state: SaveState;
  readonly effects: readonly SaveEffect[];
}

/** The state of a note just opened. */
export const CLEAN: SaveState = { status: 'clean' };

/** Delay of the save timer: the debounce, but never past `firstEdit + maxDelay`. */
function timerDelay(firstEdit: number, now: number, timing: SaveTiming): number {
  return Math.max(0, Math.min(timing.debounce, firstEdit + timing.maxDelay - now));
}

/** Delay before retry number `attempt` (1-based). */
function retryDelay(attempt: number, timing: SaveTiming): number {
  return timing.retries[Math.min(attempt, timing.retries.length) - 1] ?? 30_000;
}

/**
 * Advances the machine by one event (the table of PLAN 6.2).
 *
 * @param state - The current state.
 * @param event - What happened.
 * @param timing - The delays.
 * @returns The next state and the effects to run, in order.
 */
export function step(state: SaveState, event: SaveEvent, timing: SaveTiming): SaveStep {
  if (event.type === 'remote-applied') {
    // The apply step has saved the editor's text itself; nothing is pending any more.
    return { state: CLEAN, effects: [{ type: 'clear-timer' }, { type: 'hide-error' }] };
  }
  switch (state.status) {
    case 'clean':
      if (event.type === 'edit') {
        return {
          state: { status: 'dirty', firstEdit: event.now },
          effects: [{ type: 'set-timer', delay: timing.debounce }],
        };
      }
      // PLAN 4.3: a note with no edits is never written, not even on Ctrl+S.
      return { state, effects: [] };

    case 'dirty':
      if (event.type === 'edit') {
        return {
          state,
          effects: [{ type: 'set-timer', delay: timerDelay(state.firstEdit, event.now, timing) }],
        };
      }
      if (event.type === 'timer' || event.type === 'flush') {
        return {
          state: { status: 'saving', editedSince: null, attempt: 0 },
          effects: [{ type: 'clear-timer' }, { type: 'write' }],
        };
      }
      return { state, effects: [] };

    case 'saving':
      if (event.type === 'edit') {
        return { state: { ...state, editedSince: state.editedSince ?? event.now }, effects: [] };
      }
      if (event.type === 'written') {
        const effects: SaveEffect[] = [{ type: 'changed' }];
        if (state.attempt > 0) effects.push({ type: 'hide-error' });
        if (state.editedSince === null) return { state: CLEAN, effects };
        // The text changed during the write: it is dirty again, timed from that first edit.
        effects.push({
          type: 'set-timer',
          delay: timerDelay(state.editedSince, event.now, timing),
        });
        return { state: { status: 'dirty', firstEdit: state.editedSince }, effects };
      }
      if (event.type === 'write-failed') {
        const attempt = state.attempt + 1;
        return {
          state: { status: 'failed', attempt },
          effects: [
            { type: 'show-error' },
            { type: 'set-retry', delay: retryDelay(attempt, timing) },
          ],
        };
      }
      // A flush while a write is in flight needs nothing: the in-flight write, plus the dirty state
      // after it, covers every edit.
      return { state, effects: [] };

    case 'failed':
      if (event.type === 'retry' || event.type === 'flush') {
        return {
          state: { status: 'saving', editedSince: null, attempt: state.attempt },
          effects: [{ type: 'clear-timer' }, { type: 'write' }],
        };
      }
      // Edits while failed are kept in the editor; the next retry writes the latest text.
      return { state, effects: [] };
  }
}

/**
 * Tells whether a state holds edits that are not in IndexedDB yet.
 *
 * @param state - A save state.
 * @returns True for dirty, saving and failed.
 */
export function hasUnsaved(state: SaveState): boolean {
  return state.status !== 'clean';
}
