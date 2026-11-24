/**
 * Unit tests for the save controller (`src/lib/autosave/controller.ts`) with fake timers and a fake
 * vault: the delays of PLAN 4.4 in real time, retries after a failed save, and waiting for a
 * flush. The pure state machine is tested in autosave.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteSaver, SaveRegistry } from '../../src/lib/autosave/controller.ts';
import type { SaveState } from '../../src/lib/autosave/machine.ts';
import type { Vault } from '../../src/lib/vault/operations.ts';

/** A vault whose saveText records calls and can be told to fail. */
function fakeVault(): { vault: Vault; writes: string[]; fail: { next: number } } {
  const writes: string[] = [];
  const fail = { next: 0 };
  const vault = {
    db: null,
    saveText: (_id: string, text: string): Promise<boolean> => {
      if (fail.next > 0) {
        fail.next -= 1;
        return Promise.reject(new DOMException('full', 'QuotaExceededError'));
      }
      writes.push(text);
      return Promise.resolve(true);
    },
  } as unknown as Vault;
  return { vault, writes, fail };
}

let text = '';
let states: SaveState['status'][] = [];

beforeEach(() => {
  vi.useFakeTimers();
  text = '';
  states = [];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Types a character: changes the text and reports the edit. */
function type(saver: NoteSaver, char: string): void {
  text += char;
  saver.edit();
}

function makeSaver(vault: Vault): NoteSaver {
  return new NoteSaver(
    'note',
    vault,
    () => text,
    (s) => states.push(s.status),
    () => Date.now(),
  );
}

describe('NoteSaver (PLAN 4.4, 6.2)', () => {
  it('stores an edit 300 ms after the last keystroke', async () => {
    const { vault, writes } = fakeVault();
    const saver = makeSaver(vault);
    type(saver, 'a');
    await vi.advanceTimersByTimeAsync(299);
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual(['a']);
    expect(saver.current.status).toBe('clean');
  });

  it('stores no later than 2 s after the first unsaved keystroke during continuous typing', async () => {
    const { vault, writes } = fakeVault();
    const saver = makeSaver(vault);
    for (let i = 0; i < 20; i += 1) {
      type(saver, 'x');
      await vi.advanceTimersByTimeAsync(150);
    }
    // 20 keystrokes 150 ms apart: the first write must come at 2 s, not after the typing stops.
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(writes[0]?.length).toBeLessThanOrEqual(14);
  });

  it('flush writes at once; a clean note is not written', async () => {
    const { vault, writes } = fakeVault();
    const saver = makeSaver(vault);
    saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual([]);
    type(saver, 'b');
    saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual(['b']);
  });

  it('retries a failed save after 2 s and 5 s, keeping the latest text', async () => {
    const { vault, writes, fail } = fakeVault();
    fail.next = 2;
    const saver = makeSaver(vault);
    type(saver, 'c');
    await vi.advanceTimersByTimeAsync(300);
    expect(saver.current.status).toBe('failed');
    type(saver, 'd');
    await vi.advanceTimersByTimeAsync(2000);
    expect(saver.current.status).toBe('failed');
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes).toEqual(['cd']);
    expect(saver.current.status).toBe('clean');
    expect(states).toContain('failed');
  });

  it('flushAndWait resolves once the note is clean', async () => {
    const { vault, writes } = fakeVault();
    const saver = makeSaver(vault);
    type(saver, 'e');
    const done = saver.flushAndWait();
    await vi.advanceTimersByTimeAsync(0);
    await done;
    expect(writes).toEqual(['e']);
  });
});

describe('SaveRegistry', () => {
  it('knows when anything is unsaved, and flushes every note', async () => {
    const { vault, writes } = fakeVault();
    const registry = new SaveRegistry();
    const saver = makeSaver(vault);
    registry.add(saver);
    expect(registry.anyUnsaved()).toBe(false);
    type(saver, 'f');
    expect(registry.anyUnsaved()).toBe(true);
    const all = registry.flushAll();
    await vi.advanceTimersByTimeAsync(0);
    await all;
    expect(writes).toEqual(['f']);
    expect(registry.anyUnsaved()).toBe(false);
  });
});
