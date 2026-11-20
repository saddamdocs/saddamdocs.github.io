/**
 * One window at a time (PLAN 4.16, 5.10): the page that edits holds the Web Lock
 * `<prefix>-instance` for its lifetime. A second page that cannot get it shows "Tamanduá is open
 * in another window" with "Use it here", which asks the holder, over the BroadcastChannel
 * `<prefix>`, to save and step aside. If the holder does not let go within 2 s, the new page takes
 * the lock with `steal`.
 *
 * Owns the lock and the channel. Saving before stepping aside is the caller's job, through the
 * `onYield` callback.
 *
 * Talks to: `navigator.locks`, `BroadcastChannel`, `channel.ts` for the names, `config.ts`.
 */

import { storageName } from '../channel.ts';
import { LOCK_YIELD_TIMEOUT_MS } from '../config.ts';

/** Message asking the holder to step aside. */
interface YieldMessage {
  readonly type: 'yield';
}

/** Callbacks of the lock's owner. */
export interface LockHandlers {
  /** Another page asked for the lock: save everything and close the stream before it returns. */
  onYield: () => Promise<void>;
  /** This page lost the lock (it yielded, or the lock was stolen): show the "open elsewhere" screen. */
  onLost: () => void;
}

/** The one-window lock of this channel. */
export class InstanceLock {
  private readonly lockName = storageName('instance');
  private readonly channelName = storageName();
  private release: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;
  private handlers: LockHandlers | null = null;

  /**
   * Tries to take the lock without waiting.
   *
   * @param handlers - What to do when another page asks for the lock, and when it is lost.
   * @returns True when this page now holds the lock; false when another page holds it.
   */
  async acquire(handlers: LockHandlers): Promise<boolean> {
    this.handlers = handlers;
    return this.request({ ifAvailable: true });
  }

  /**
   * "Use it here": asks the holder to step aside, waits up to 2 s, then takes the lock by force.
   *
   * @param handlers - As for `acquire`.
   * @returns Resolves when this page holds the lock.
   */
  async takeOver(handlers: LockHandlers): Promise<void> {
    this.handlers = handlers;
    const channel = new BroadcastChannel(this.channelName);
    channel.postMessage({ type: 'yield' } satisfies YieldMessage);
    channel.close();
    const signal = AbortSignal.timeout(LOCK_YIELD_TIMEOUT_MS);
    try {
      if (await this.request({ signal })) return;
    } catch (error) {
      // A timeout means the holder did not answer: steal, as PLAN 5.10 says. Anything else is real.
      if (!(
        error instanceof DOMException &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      )) {
        throw error;
      }
    }
    await this.request({ steal: true });
  }

  /**
   * Requests the lock and, once granted, holds it until `release` is called or it is stolen.
   *
   * @returns True once the lock is held; false when `ifAvailable` found it taken.
   */
  private request(options: LockOptions): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      navigator.locks
        .request(this.lockName, options, (lock) => {
          if (lock === null) {
            resolve(false);
            return undefined;
          }
          resolve(true);
          this.listen();
          // Hold the lock until released.
          return new Promise<void>((done) => {
            this.release = done;
          });
        })
        .catch((error: unknown) => {
          if (this.release !== null) {
            // The lock was held and another page stole it.
            this.lost();
          } else {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
    });
  }

  /** Listens for "yield" requests while holding the lock. */
  private listen(): void {
    this.channel?.close();
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.onmessage = (event: MessageEvent<YieldMessage>) => {
      if (event.data.type !== 'yield' || this.release === null) return;
      const handlers = this.handlers;
      void (handlers?.onYield() ?? Promise.resolve())
        .catch((error: unknown) => {
          // Step aside anyway: the other page would steal the lock after 2 s regardless, and the
          // failed save has already shown its own banner.
          console.error('Tamanduá yield-save-failed', error instanceof Error ? error.name : error);
        })
        .finally(() => {
          this.release?.();
          this.lost();
        });
    };
  }

  /** Forgets the lock and tells the owner. */
  private lost(): void {
    this.release = null;
    this.channel?.close();
    this.channel = null;
    this.handlers?.onLost();
  }
}
