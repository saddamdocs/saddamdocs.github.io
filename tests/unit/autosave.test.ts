/**
 * Unit tests for the save state machine of PLAN 6.2 (`src/lib/autosave/machine.ts`): every row of
 * the transition table, with times given explicitly instead of real timers. M2 extends these with
 * the controller and fake timers.
 */

import { describe, expect, it } from 'vitest';
import { CLEAN, step, type SaveState, type SaveTiming } from '../../src/lib/autosave/machine.ts';

const timing: SaveTiming = { debounce: 300, maxDelay: 2000, retries: [2000, 5000, 15_000, 30_000] };

describe('the save machine (PLAN 6.2)', () => {
  it('clean + edit: starts the 300 ms timer and records the first edit', () => {
    expect(step(CLEAN, { type: 'edit', now: 1000 }, timing)).toEqual({
      state: { status: 'dirty', firstEdit: 1000 },
      effects: [{ type: 'set-timer', delay: 300 }],
    });
  });

  it('dirty + edit: restarts the timer, but never past 2 s after the first edit', () => {
    const dirty: SaveState = { status: 'dirty', firstEdit: 1000 };
    expect(step(dirty, { type: 'edit', now: 1500 }, timing).effects).toEqual([
      { type: 'set-timer', delay: 300 },
    ]);
    expect(step(dirty, { type: 'edit', now: 2800 }, timing).effects).toEqual([
      { type: 'set-timer', delay: 200 },
    ]);
    expect(step(dirty, { type: 'edit', now: 3100 }, timing).effects).toEqual([
      { type: 'set-timer', delay: 0 },
    ]);
  });

  it.each(['timer', 'flush'] as const)('dirty + %s: writes', (type) => {
    expect(step({ status: 'dirty', firstEdit: 0 }, { type, now: 300 }, timing)).toEqual({
      state: { status: 'saving', editedSince: null, attempt: 0 },
      effects: [{ type: 'clear-timer' }, { type: 'write' }],
    });
  });

  it('clean + flush (Ctrl+S): writes nothing (PLAN 4.3, "Nothing to save")', () => {
    expect(step(CLEAN, { type: 'flush', now: 0 }, timing)).toEqual({ state: CLEAN, effects: [] });
  });

  it('saving + written: clean, and the sync engine is told', () => {
    const saving: SaveState = { status: 'saving', editedSince: null, attempt: 0 };
    expect(step(saving, { type: 'written', now: 400 }, timing)).toEqual({
      state: CLEAN,
      effects: [{ type: 'changed' }],
    });
  });

  it('an edit during the write makes the note dirty again, timed from that edit', () => {
    let state: SaveState = { status: 'saving', editedSince: null, attempt: 0 };
    state = step(state, { type: 'edit', now: 350 }, timing).state;
    state = step(state, { type: 'edit', now: 380 }, timing).state;
    expect(state).toEqual({ status: 'saving', editedSince: 350, attempt: 0 });
    expect(step(state, { type: 'written', now: 400 }, timing)).toEqual({
      state: { status: 'dirty', firstEdit: 350 },
      effects: [{ type: 'changed' }, { type: 'set-timer', delay: 300 }],
    });
  });

  it('a failed write shows the banner and retries after 2 s, 5 s, 15 s, then every 30 s', () => {
    let state: SaveState = { status: 'saving', editedSince: null, attempt: 0 };
    const delays: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const failed = step(state, { type: 'write-failed', now: 0 }, timing);
      expect(failed.effects[0]).toEqual({ type: 'show-error' });
      const retry = failed.effects[1];
      if (retry?.type === 'set-retry') delays.push(retry.delay);
      state = step(failed.state, { type: 'retry', now: 0 }, timing).state;
    }
    expect(delays).toEqual([2000, 5000, 15_000, 30_000, 30_000, 30_000]);
  });

  it('a retry that succeeds hides the banner', () => {
    const retrying: SaveState = { status: 'saving', editedSince: null, attempt: 2 };
    expect(step(retrying, { type: 'written', now: 0 }, timing).effects).toContainEqual({
      type: 'hide-error',
    });
  });

  it('edits while failed wait for the retry, which writes the latest text', () => {
    const failed: SaveState = { status: 'failed', attempt: 1 };
    expect(step(failed, { type: 'edit', now: 0 }, timing)).toEqual({ state: failed, effects: [] });
    expect(step(failed, { type: 'flush', now: 0 }, timing).effects).toContainEqual({
      type: 'write',
    });
  });

  it('any state + remote applied: clean, timers cleared', () => {
    for (const state of [
      CLEAN,
      { status: 'dirty', firstEdit: 0 },
      { status: 'failed', attempt: 1 },
    ] satisfies SaveState[]) {
      expect(step(state, { type: 'remote-applied' }, timing).state).toEqual(CLEAN);
    }
  });
});
