/**
 * Every request to the database (PLAN 5.2, 5.8); nothing else calls `fetch` on a database address.
 *
 * Owns the URLs (`<database>/tamandua/<key>/…`, with `?ns=` for the emulator), the classification
 * of answers (PLAN 5.8, "Responses"), timeouts, at most four requests in flight, and no request at
 * all while the browser says it is offline. Retrying is the engine's job; this module only says
 * whether a failure may be retried.
 *
 * Large transfers (the full download, file blobs) use XMLHttpRequest for progress in the browser,
 * aborted when no progress arrives for 30 s; where XMLHttpRequest does not exist (Node.js tests),
 * they use fetch.
 *
 * Talks to: the channel's database through `fetch` and `XMLHttpRequest`; `channel.ts`, `config.ts`.
 */

import { channel } from '../channel.ts';
import { SMALL_REQUEST_TIMEOUT_MS, SYNC_KEY_LENGTH } from '../config.ts';
import { SV, type RemoteInfo, type RemoteItem } from './format.ts';

/** How a request failed (PLAN 5.8, "Responses"). */
export type FailureKind =
  /** 401: a rule refused it. For a write, possibly another device wrote first. */
  | 'refused'
  /** 400: a bug or a missing index. Stop and report. */
  | 'bug'
  /** 429, 5xx, network error or timeout: retry later. */
  | 'retry'
  /** Any other status (403, 404, 413…): stop sync and show it; never retry in a loop. */
  | 'fatal'
  /** The browser is offline: nothing was sent. */
  | 'offline';

/** A request that did not succeed. */
export class RestFailure extends Error {
  /**
   * @param kind - The class of failure.
   * @param request - What was asked, without the key: `GET head`, `PATCH item`.
   * @param status - The HTTP status, or 0 when there was no answer.
   */
  constructor(
    readonly kind: FailureKind,
    readonly request: string,
    readonly status: number,
  ) {
    super(`${request}: ${kind}${status === 0 ? '' : ` (${String(status)})`}`);
    this.name = 'RestFailure';
  }
}

/** Where a vault lives. */
export interface Endpoint {
  /** The database origin, no trailing slash. */
  readonly databaseUrl: string;
  /** `?ns=` value for the emulator, or null for a real database. */
  readonly namespace: string | null;
  /** The sync key: the vault's branch under `/tamandua`. */
  readonly key: string;
}

/** Progress of a large transfer, in bytes. */
export type Progress = (done: number, total: number | null) => void;

/** The head record (PLAN 5.5). */
export interface RemoteHead {
  readonly ts: number;
  readonly id: string;
  readonly rev: number;
}

/** Large transfers stop when no progress arrives for this long, in ms (PLAN 5.8). */
const STALL_TIMEOUT_MS = 30_000;
/** At most this many requests in flight (PLAN 5.8). */
const MAX_IN_FLIGHT = 4;

/** Classifies an HTTP status (PLAN 5.8). */
function classify(status: number): FailureKind | null {
  if (status === 200 || status === 204) return null;
  if (status === 401) return 'refused';
  if (status === 400) return 'bug';
  if (status === 429 || status >= 500) return 'retry';
  return 'fatal';
}

/**
 * The endpoint of this build's channel for a key.
 *
 * @param key - The sync key.
 * @returns The endpoint.
 */
export function channelEndpoint(key: string): Endpoint {
  return { databaseUrl: channel.databaseUrl, namespace: channel.emulatorNamespace, key };
}

/** The REST client of one vault. */
export class Rest {
  private inFlight = 0;
  private readonly waiting: (() => void)[] = [];

  /**
   * @param endpoint - The database, namespace and key.
   * @param online - Tells whether the browser is online; `navigator.onLine` by default.
   */
  constructor(
    readonly endpoint: Endpoint,
    private readonly online: () => boolean = () =>
      // Node.js has a `navigator` without `onLine`; only an explicit false means offline.
      typeof navigator === 'undefined' || (navigator.onLine as boolean | undefined) !== false,
  ) {
    if (endpoint.key.length < SYNC_KEY_LENGTH) throw new Error('sync key too short');
  }

  /**
   * Whether requests may be sent now (PLAN 5.8: none while the browser says it is offline).
   *
   * @returns True when online.
   */
  isOnline(): boolean {
    return this.online();
  }

  /** The URL of a path under the vault's branch, with `.json`, `ns` and query parameters. */
  url(path: string, query: Readonly<Record<string, string>> = {}): string {
    const params = new URLSearchParams(query);
    if (this.endpoint.namespace !== null) params.set('ns', this.endpoint.namespace);
    const qs = params.toString();
    const suffix = path === '' ? '' : `/${path}`;
    return `${this.endpoint.databaseUrl}/tamandua/${this.endpoint.key}${suffix}.json${qs === '' ? '' : `?${qs}`}`;
  }

  /** Waits for a free slot among the four allowed in flight. */
  private async slot<T>(work: () => Promise<T>): Promise<T> {
    if (this.inFlight >= MAX_IN_FLIGHT)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.inFlight += 1;
    try {
      return await work();
    } finally {
      this.inFlight -= 1;
      this.waiting.shift()?.();
    }
  }

  /** Sends a small request with fetch and returns the parsed JSON body (null for none). */
  private request(method: string, url: string, label: string, body?: unknown): Promise<unknown> {
    if (!this.online()) return Promise.reject(new RestFailure('offline', label, 0));
    return this.slot(async () => {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          cache: 'no-store',
          credentials: 'omit',
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(SMALL_REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new RestFailure('retry', label, 0);
      }
      const kind = classify(response.status);
      if (kind !== null) throw new RestFailure(kind, label, response.status);
      const text = await response.text();
      return text === '' ? null : (JSON.parse(text) as unknown);
    });
  }

  /** Sends a large request, with progress where XMLHttpRequest exists (PLAN 5.8). */
  private large(
    method: string,
    url: string,
    label: string,
    body: string | undefined,
    progress?: Progress,
  ): Promise<unknown> {
    if (!this.online()) return Promise.reject(new RestFailure('offline', label, 0));
    if (typeof XMLHttpRequest === 'undefined') {
      return this.slot(async () => {
        let response: Response;
        try {
          response = await fetch(url, { method, cache: 'no-store', credentials: 'omit', body });
        } catch {
          throw new RestFailure('retry', label, 0);
        }
        const kind = classify(response.status);
        if (kind !== null) throw new RestFailure(kind, label, response.status);
        const text = await response.text();
        progress?.(text.length, text.length);
        return text === '' ? null : (JSON.parse(text) as unknown);
      });
    }
    return this.slot(
      () =>
        new Promise<unknown>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          let watchdog: ReturnType<typeof setTimeout> | undefined;
          const arm = (): void => {
            clearTimeout(watchdog);
            // PLAN 5.8: a large transfer is aborted when no progress arrives for 30 s.
            watchdog = setTimeout(() => xhr.abort(), STALL_TIMEOUT_MS);
          };
          xhr.open(method, url);
          xhr.withCredentials = false;
          xhr.upload.onprogress = (e) => {
            arm();
            progress?.(e.loaded, e.lengthComputable ? e.total : null);
          };
          xhr.onprogress = (e) => {
            arm();
            if (body === undefined) progress?.(e.loaded, e.lengthComputable ? e.total : null);
          };
          xhr.onload = () => {
            clearTimeout(watchdog);
            const kind = classify(xhr.status);
            if (kind !== null) reject(new RestFailure(kind, label, xhr.status));
            else
              resolve(xhr.responseText === '' ? null : (JSON.parse(xhr.responseText) as unknown));
          };
          xhr.onerror = () => {
            clearTimeout(watchdog);
            reject(new RestFailure('retry', label, 0));
          };
          xhr.onabort = () => reject(new RestFailure('retry', label, 0));
          arm();
          xhr.send(body ?? null);
        }),
    );
  }

  /**
   * Reads the vault's `info` (connecting, and once per session).
   *
   * @returns The record, or null when no vault exists under this key.
   */
  async getInfo(): Promise<Record<string, unknown> | null> {
    return (await this.request('GET', this.url('info'), 'GET info')) as Record<
      string,
      unknown
    > | null;
  }

  /**
   * Writes `info` when creating a vault. The rules refuse it if `info` exists.
   *
   * @param info - The new record.
   */
  async putInfo(info: RemoteInfo): Promise<void> {
    await this.request('PUT', this.url('info', { print: 'silent' }), 'PUT info', info);
  }

  /**
   * Reads `moved` (PLAN 5.8: at each catch-up; checked from M3c).
   *
   * @returns The record, or null.
   */
  async getMoved(): Promise<Record<string, unknown> | null> {
    return (await this.request('GET', this.url('moved'), 'GET moved')) as Record<
      string,
      unknown
    > | null;
  }

  /**
   * Reads `head`, used when the stream keeps failing (PLAN 5.8) to show the cause.
   *
   * @returns The head, or null.
   */
  async getHead(): Promise<unknown> {
    return this.request('GET', this.url('head'), 'GET head');
  }

  /**
   * Catch-up: every item changed since the cursor, with a minute of overlap (PLAN 5.8).
   *
   * @param cursor - The latest database time this device has seen, in ms; 0 for everything.
   * @returns Records by id.
   */
  async itemsSince(cursor: number): Promise<Record<string, unknown>> {
    const url = this.url('items', {
      orderBy: '"ts"',
      startAt: String(Math.max(0, cursor - 60_000)),
    });
    return ((await this.request('GET', url, 'GET items since')) ?? {}) as Record<string, unknown>;
  }

  /**
   * The full download, with progress (connecting; Repair sync from M3c).
   *
   * @param progress - Called as bytes arrive.
   * @returns Records by id.
   */
  async allItems(progress?: Progress): Promise<Record<string, unknown>> {
    return ((await this.large('GET', this.url('items'), 'GET items', undefined, progress)) ??
      {}) as Record<string, unknown>;
  }

  /**
   * Reads one item (after a 401 on upload, PLAN 6.3 "Push" step 5).
   *
   * @param id - The item.
   * @returns The record, or null.
   */
  getItem(id: string): Promise<unknown> {
    return this.request('GET', this.url(`items/${id}`), 'GET item');
  }

  /**
   * Uploads one item and `head` in one atomic multi-path write (PLAN 5.8), with a new file's blob
   * when given, or the removal of a blob.
   *
   * @param id - The item.
   * @param item - The sealed record.
   * @param blob - A new file's sealed bytes, `null` to remove the blob, or undefined for neither.
   * @param progress - Upload progress, for a blob.
   */
  async putItem(
    id: string,
    item: RemoteItem,
    blob?: string | null,
    progress?: Progress,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      [`items/${id}`]: item,
      head: { ts: SV, id, rev: item.rev },
    };
    if (blob !== undefined) update[`blobs/${id}`] = blob;
    const url = this.url('', { print: 'silent' });
    if (typeof blob === 'string')
      await this.large('PATCH', url, 'PATCH item+blob', JSON.stringify(update), progress);
    else await this.request('PATCH', url, 'PATCH item', update);
  }

  /**
   * Downloads a file's sealed bytes, with progress.
   *
   * @param id - The file.
   * @param progress - Called as bytes arrive.
   * @returns The sealed blob, or null when it is not there.
   */
  async getBlob(id: string, progress?: Progress): Promise<string | null> {
    const value = await this.large('GET', this.url(`blobs/${id}`), 'GET blob', undefined, progress);
    return typeof value === 'string' ? value : null;
  }
}

/**
 * Spike D (PLAN 7, M0): sends one `GET` for `/tamandua/<random key>/head.json` to this channel's
 * database. While the database is locked, a 401 proves that Brave's Shields and the content
 * security policy let the request through. It never writes anything.
 *
 * @returns The HTTP status, or the error message when the request did not complete.
 */
export async function probeLockedDatabase(): Promise<
  | { readonly kind: 'status'; readonly status: number }
  | { readonly kind: 'network'; readonly message: string }
> {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(SYNC_KEY_LENGTH));
  const key = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  const url = new Rest(channelEndpoint(key)).url('head');
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(SMALL_REQUEST_TIMEOUT_MS),
    });
    return { kind: 'status', status: response.status };
  } catch (error) {
    return { kind: 'network', message: error instanceof Error ? error.message : String(error) };
  }
}
