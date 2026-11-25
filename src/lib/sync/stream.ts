/**
 * The stream on `head` (PLAN 5.8): one `EventSource` that tells this device when anything in the
 * vault changed. `put` and `patch` carry the new head; `keep-alive` needs nothing; `cancel` and
 * `auth_revoked` close the stream and are a sync problem. The browser reconnects by itself after
 * an error; after three failures in a row the owner is told, so it can show the cause.
 *
 * Talks to: the database through `EventSource`; the URL comes from `sync/rest.ts`.
 */

import type { RemoteHead } from './rest.ts';

/** What the stream reports. */
export interface StreamHandlers {
  /** The head changed; null when the event did not carry a whole head. */
  onHead: (head: RemoteHead | null) => void;
  /** The server cancelled the stream (rules changed, or revoked). */
  onCancel: () => void;
  /** The connection failed three times in a row (PLAN 5.8). */
  onTrouble: () => void;
  /** The stream is open, or not. */
  onConnected: (connected: boolean) => void;
}

/** Reconnection failures in a row before the owner is told (PLAN 5.8). */
const TROUBLE_AFTER = 3;

/** Reads a head from an event's data, if it carries one. */
function headOf(data: string): RemoteHead | null {
  try {
    const parsed = JSON.parse(data) as { path?: unknown; data?: unknown };
    const value = parsed.data as Partial<RemoteHead> | null | undefined;
    if (parsed.path === '/' && value !== null && typeof value === 'object') {
      if (
        typeof value.ts === 'number' &&
        typeof value.id === 'string' &&
        typeof value.rev === 'number'
      ) {
        return { ts: value.ts, id: value.id, rev: value.rev };
      }
    }
  } catch {
    // An event that is not JSON is treated as "something changed".
  }
  return null;
}

/** The stream on `head`. */
export class HeadStream {
  private source: EventSource | null = null;
  private failures = 0;

  /**
   * @param url - The URL of `head.json`, from `Rest.url('head')`.
   * @param handlers - What to do with events.
   */
  constructor(
    private readonly url: string,
    private readonly handlers: StreamHandlers,
  ) {}

  /** Whether the stream is open now. */
  get isOpen(): boolean {
    return this.source !== null;
  }

  /** Opens the stream if it is not open. */
  open(): void {
    if (this.source !== null || typeof EventSource === 'undefined') return;
    const source = new EventSource(this.url);
    this.source = source;
    source.onopen = () => {
      this.failures = 0;
      this.handlers.onConnected(true);
    };
    source.onerror = () => {
      this.handlers.onConnected(false);
      this.failures += 1;
      if (this.failures === TROUBLE_AFTER) this.handlers.onTrouble();
    };
    const onData = (event: MessageEvent<string>): void => this.handlers.onHead(headOf(event.data));
    source.addEventListener('put', onData);
    source.addEventListener('patch', onData);
    const onCancel = (): void => {
      this.close();
      this.handlers.onCancel();
    };
    source.addEventListener('cancel', onCancel);
    source.addEventListener('auth_revoked', onCancel);
  }

  /** Closes the stream (page hidden for 60 s, sync stopped). */
  close(): void {
    this.source?.close();
    this.source = null;
    this.handlers.onConnected(false);
  }
}
