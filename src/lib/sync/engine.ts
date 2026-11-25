/**
 * The sync engine (PLAN 6.3), part 1 (M3a): the upload schedule of PLAN 5.8, push and pull for
 * every kind of item with file blobs, catch-up, the stream, own uploads, retries, and the chip's
 * state. It runs in the page that holds the one-window lock and never blocks the interface.
 *
 * Until M3b, a record from the database that meets local changes not yet uploaded is not applied:
 * the item is listed as waiting for a merge and is neither pulled nor pushed. One case is settled at
 * once: when the record's content equals the local copy (a page closed between an upload and its
 * local commit), the record is adopted, so nothing uploads twice.
 *
 * Talks to: `sync/rest.ts` (requests), `sync/stream.ts` (head events), `sync/format.ts` and
 * `sync/crypto.ts` (seals), `vault/operations.ts` (local items), and its host (open editors,
 * the cursor).
 */

import { logEvent } from '../store/log.ts';
import type { ItemRecord } from '../store/schema.ts';
import type { Vault, VaultChange } from '../vault/operations.ts';
import { OpenError } from './crypto.ts';
import {
  FormatError,
  decodeItem,
  encodeItem,
  encodeTombstone,
  openBlob,
  sealBlob,
} from './format.ts';
import { RestFailure, type Rest, type RemoteHead } from './rest.ts';
import { HeadStream } from './stream.ts';

/** The sync chip (PLAN 4.5). */
export type ChipState =
  | { readonly kind: 'off' }
  | { readonly kind: 'synced' }
  | { readonly kind: 'syncing'; readonly count: number }
  | { readonly kind: 'offline'; readonly waiting: number }
  | { readonly kind: 'paused' }
  | { readonly kind: 'problem'; readonly message: string };

/** What the chip's details show. */
export interface SyncDetails {
  /** Items whose newer remote version waits for the merge of M3b. */
  readonly waitingForMerge: readonly string[];
  /** Items whose remote version does not open (PLAN 5.6, I7). */
  readonly unreadable: readonly string[];
  /** Notes over 4,000,000 bytes, kept on this device only (PLAN 5.5). */
  readonly tooLarge: readonly string[];
  /** The last failure, as "request: kind (status)". */
  readonly lastError: string | null;
  /** The answer of `GET head` after the stream failed three times (PLAN 5.8). */
  readonly streamCheck: string | null;
  /** Device time of the last successful catch-up or upload. */
  readonly lastSync: number | null;
}

/** What the engine needs from the page around it. */
export interface EngineHost {
  /** Whether a note is open in an editor (a change to it is caught up after 250 ms, PLAN 5.8). */
  isOpen: (id: string) => boolean;
  /**
   * Puts a remote text into an open note's editor (PLAN 6.3, "Applying to an open note").
   * Returns false when the editor holds edits not yet saved; the engine then leaves the note.
   */
  applyToEditor: (id: string, text: string) => boolean;
  /** Stores the cursor, the latest database time seen. */
  saveCursor: (cursor: number) => Promise<void>;
}

/** Timing of PLAN 5.8, in ms. */
export interface EngineTiming {
  /** An item uploads once no new save reached it for this long. */
  readonly quiet: number;
  /** …and no later than this after its oldest change not uploaded. */
  readonly maxWait: number;
  /** Catch-up after a head event for a note open in an editor. */
  readonly openNoteCatchUp: number;
  /** Catch-up after any other head event; further events join it. */
  readonly otherCatchUp: number;
  /** Retries after 429, 5xx and network errors; the last one repeats. */
  readonly retries: readonly number[];
  /** Close the stream after the page has been hidden this long. */
  readonly hiddenClose: number;
  /** How long an upload is remembered as this device's own. */
  readonly ownMemory: number;
}

/** The timing of PLAN 5.8. */
export const TIMING: EngineTiming = {
  quiet: 1000,
  maxWait: 10_000,
  openNoteCatchUp: 250,
  otherCatchUp: 20_000,
  retries: [2000, 5000, 15_000, 30_000, 60_000],
  hiddenClose: 60_000,
  ownMemory: 60_000,
};

/** Message of a write the rules refused for another reason than a conflict (PLAN 5.8). */
export const REFUSED_MESSAGE = 'The database refused a change: check the rules and the key';

/** At most this many blobs download at a time (PLAN 6.3, "Pull" step 3). */
const BLOB_PARALLEL = 2;

/** The sync engine of one vault on this device. */
export class SyncEngine {
  private cursor: number;
  private stopped = false;
  private problem: string | null = null;
  private running = false;
  private rerun = false;
  private catchUpWanted = true;
  private uploadAll = false;
  private wakeTimer: ReturnType<typeof setTimeout> | undefined;
  private catchUpTimer: ReturnType<typeof setTimeout> | undefined;
  private catchUpAt = Infinity;
  private retryIndex = 0;
  private retryUntil = 0;
  private streamConnected = false;
  private hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly lastChange = new Map<string, number>();
  private readonly own = new Map<string, number>();
  private readonly waiting = new Set<string>();
  private readonly unreadable = new Set<string>();
  private readonly tooLarge = new Set<string>();
  private readonly blobQueue: string[] = [];
  private blobsRunning = 0;
  private lastError: string | null = null;
  private streamCheck: string | null = null;
  private lastSync: number | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly stream: HeadStream;
  private unsubscribe: (() => void) | null = null;

  /**
   * @param vault - The vault on this device.
   * @param rest - The REST client of the vault's branch.
   * @param key - The derived vault key.
   * @param host - Open editors and cursor storage.
   * @param cursor - The cursor stored on this device.
   * @param timing - Delays; PLAN 5.8's by default, shorter in tests.
   * @param clock - Device time in ms.
   */
  constructor(
    private readonly vault: Vault,
    private readonly rest: Rest,
    private readonly key: CryptoKey,
    private readonly host: EngineHost,
    cursor: number,
    private readonly timing: EngineTiming = TIMING,
    private readonly clock: () => number = Date.now,
  ) {
    this.cursor = cursor;
    this.stream = new HeadStream(rest.url('head'), {
      onHead: (head) => this.onHead(head),
      onCancel: () => this.fail('The database closed the change stream; reload to reconnect'),
      onTrouble: () => void this.checkHead(),
      onConnected: (connected) => {
        this.streamConnected = connected;
        this.emit();
      },
    });
  }

  // ----- life cycle ---------------------------------------------------------------------------

  /** Starts syncing: listens to the vault, opens the stream, catches up and uploads. */
  start(): void {
    this.unsubscribe = this.vault.subscribe((change) => this.onVaultChange(change));
    // Files whose bytes this device does not have yet (an earlier session was interrupted).
    for (const item of this.vault.index.byId.values()) {
      if (item.kind === 'file' && !item.gone && item.rev > 0) this.blobQueue.push(item.id);
    }
    this.pumpBlobs();
    if (typeof document === 'undefined' || document.visibilityState === 'visible')
      this.stream.open();
    this.requestCatchUp(0);
  }

  /** Stops syncing: closes the stream and every timer. The vault stays as it is. */
  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    this.stream.close();
    clearTimeout(this.wakeTimer);
    clearTimeout(this.catchUpTimer);
    clearTimeout(this.hiddenTimer);
    this.emit();
  }

  /**
   * Calls a function whenever the chip's state or details change.
   *
   * @param listener - Called with no arguments.
   * @returns A function that stops the calls.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** The chip's state (PLAN 4.5). */
  get chip(): ChipState {
    if (this.problem !== null) return { kind: 'problem', message: this.problem };
    if (this.stopped) return { kind: 'off' };
    const dirty = this.vault.dirtyItems().filter((i) => this.uploadable(i)).length;
    if (!this.isOnline()) return { kind: 'offline', waiting: dirty };
    if (this.running || dirty > 0 || this.catchUpWanted || this.blobsRunning > 0) {
      return { kind: 'syncing', count: dirty };
    }
    return this.streamConnected || typeof EventSource === 'undefined'
      ? { kind: 'synced' }
      : { kind: 'syncing', count: 0 };
  }

  /** The chip's details. */
  get details(): SyncDetails {
    return {
      waitingForMerge: [...this.waiting],
      unreadable: [...this.unreadable],
      tooLarge: [...this.tooLarge],
      lastError: this.lastError,
      streamCheck: this.streamCheck,
      lastSync: this.lastSync,
    };
  }

  private isOnline(): boolean {
    return this.rest.isOnline();
  }

  // ----- events -------------------------------------------------------------------------------

  /** A local change: remember when, so the upload waits for a quiet second (PLAN 5.8). */
  private onVaultChange(change: VaultChange): void {
    if (change.origin !== 'local') {
      this.emit();
      return;
    }
    const now = this.clock();
    for (const id of change.ids) this.lastChange.set(id, now);
    this.wake();
  }

  /** Ctrl+S, the window losing focus, the page hidden, a tab closed: upload now (PLAN 5.8). */
  uploadNow(): void {
    this.uploadAll = true;
    this.wake(0);
  }

  /**
   * Catches up and uploads everything dirty now, and waits until done (Ctrl+S; tests).
   *
   * @returns Resolves when the run finished, or failed and was reported.
   */
  async syncNow(): Promise<void> {
    this.catchUpWanted = true;
    this.uploadAll = true;
    this.retryUntil = 0;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 5));
    await this.pump();
  }

  /**
   * Waits until no file bytes are downloading or queued.
   *
   * @returns Resolves when the blob queue is empty.
   */
  async blobsDone(): Promise<void> {
    while (this.blobsRunning > 0 || this.blobQueue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /** The page became visible, regained focus, or came back online: catch up (PLAN 5.8). */
  resume(): void {
    clearTimeout(this.hiddenTimer);
    if (this.stopped) return;
    this.stream.open();
    this.pumpBlobs();
    this.requestCatchUp(0);
  }

  /** The page was hidden: upload now, and close the stream after 60 s (PLAN 5.8). */
  hidden(): void {
    this.uploadNow();
    clearTimeout(this.hiddenTimer);
    this.hiddenTimer = setTimeout(() => this.stream.close(), this.timing.hiddenClose);
  }

  /** A head event: another device's upload starts a catch-up; this device's own is ignored. */
  private onHead(head: RemoteHead | null): void {
    if (head !== null && this.own.has(`${head.id}:${String(head.rev)}`)) return;
    const delay =
      head !== null && this.host.isOpen(head.id)
        ? this.timing.openNoteCatchUp
        : this.timing.otherCatchUp;
    this.requestCatchUp(delay);
  }

  /** Asks for a catch-up after a delay; an earlier request wins, later events join it. */
  requestCatchUp(delay: number): void {
    const at = this.clock() + delay;
    if (at >= this.catchUpAt) return;
    this.catchUpAt = at;
    clearTimeout(this.catchUpTimer);
    this.catchUpTimer = setTimeout(() => {
      this.catchUpAt = Infinity;
      this.catchUpWanted = true;
      this.wake(0);
    }, delay);
  }

  /** After three stream failures, one plain `GET head` shows the cause (PLAN 5.8). */
  private async checkHead(): Promise<void> {
    try {
      await this.rest.getHead();
      this.streamCheck = 'GET head answered; the stream itself is blocked';
    } catch (error) {
      this.streamCheck = error instanceof Error ? error.message : String(error);
    }
    this.emit();
  }

  // ----- the pump -----------------------------------------------------------------------------

  /** Runs the pump after a delay, or at the next due upload. */
  private wake(delay?: number): void {
    if (this.stopped) return;
    clearTimeout(this.wakeTimer);
    const wait = delay ?? this.nextDue();
    if (wait === Infinity) {
      this.emit();
      return;
    }
    this.wakeTimer = setTimeout(() => void this.pump(), Math.max(0, wait));
    this.emit();
  }

  /** Milliseconds until the next item is due to upload, or Infinity. */
  private nextDue(): number {
    const now = this.clock();
    let next = Infinity;
    for (const item of this.vault.dirtyItems()) {
      if (!this.uploadable(item)) continue;
      next = Math.min(next, this.dueAt(item) - now);
    }
    return Math.max(0, next);
  }

  /** When an item is due: a quiet second after its last change, at most 10 s after its oldest. */
  private dueAt(item: ItemRecord): number {
    if (this.uploadAll) return 0;
    const since = item.dirtySince ?? this.clock();
    const last = this.lastChange.get(item.id) ?? since;
    return Math.min(last + this.timing.quiet, since + this.timing.maxWait);
  }

  /** Whether an item may be uploaded now (not held, not unreadable, not too large). */
  private uploadable(item: ItemRecord): boolean {
    return (
      !this.waiting.has(item.id) && !this.unreadable.has(item.id) && !this.tooLarge.has(item.id)
    );
  }

  /** Catches up if wanted, then uploads what is due, in order. One run at a time. */
  async pump(): Promise<void> {
    if (this.stopped || this.problem !== null) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (!this.isOnline()) {
      this.emit();
      return;
    }
    if (this.clock() < this.retryUntil) return;
    this.running = true;
    this.emit();
    try {
      do {
        this.rerun = false;
        if (this.catchUpWanted) {
          this.catchUpWanted = false;
          await this.catchUp();
        }
        await this.pushDue();
      } while (this.rerun && !this.stopped);
      this.retryIndex = 0;
      this.lastSync = this.clock();
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.running = false;
      this.uploadAll = false;
      if (this.problem === null) this.wake();
      this.emit();
    }
  }

  /** Turns a failure into a retry, a stop, or a report (PLAN 5.8, "Responses"). */
  private handleFailure(error: unknown): void {
    if (error instanceof RestFailure) {
      this.lastError = error.message;
      if (error.kind === 'offline') return;
      if (error.kind === 'retry') {
        const delay =
          this.timing.retries[Math.min(this.retryIndex, this.timing.retries.length - 1)] ?? 60_000;
        this.retryIndex += 1;
        this.retryUntil = this.clock() + delay;
        this.catchUpWanted = true;
        clearTimeout(this.wakeTimer);
        this.wakeTimer = setTimeout(() => void this.pump(), delay);
        return;
      }
      this.fail(error.kind === 'refused' ? REFUSED_MESSAGE : `Sync stopped: ${error.message}`);
      return;
    }
    this.fail(`Sync stopped: ${error instanceof Error ? error.message : String(error)}`);
  }

  /** Stops sync with a problem that needs the user (PLAN 5.8: never retried in a loop). */
  private fail(message: string): void {
    this.problem = message;
    void logEvent(
      this.vault.db,
      'error',
      'sync-stopped',
      message.replace(/[A-Za-z0-9]{32,}/g, '<key>'),
    );
    this.emit();
  }

  // ----- push ---------------------------------------------------------------------------------

  /** Uploads every due item, oldest change first (PLAN 5.8, "Order of uploads"). */
  private async pushDue(): Promise<void> {
    for (;;) {
      const now = this.clock();
      const due = this.vault
        .dirtyItems()
        .filter((i) => this.uploadable(i) && this.dueAt(i) <= now && !this.deletionMustWait(i))
        .sort((a, b) => (a.dirtySince ?? 0) - (b.dirtySince ?? 0));
      const next = due[0];
      if (next === undefined) return;
      await this.pushOne(next.id);
    }
  }

  /**
   * PLAN 5.8: a folder's deletion is never uploaded while this device still has changes to upload
   * for items inside that folder (rule F3 of PLAN 6.3 relies on it).
   */
  private deletionMustWait(item: ItemRecord): boolean {
    if (item.kind !== 'folder' || !item.deleted || item.base?.deleted === true) return false;
    return this.vault.index
      .descendantsDeepestFirst(item.id)
      .some((d) => d.dirty && this.uploadable(d));
  }

  /** Uploads one item (PLAN 6.3, "Push"). */
  private async pushOne(id: string): Promise<void> {
    const source = await this.vault.readForUpload(id);
    if (source === null || !source.item.dirty) return;
    const { item } = source;
    const rev = item.rev + 1;
    let blob: string | null | undefined;
    let record;
    try {
      if (item.gone) {
        record = await encodeTombstone(this.key, id, item.kind, rev);
        if (item.kind === 'file') blob = null;
      } else {
        record = await encodeItem(this.key, item, source.text, rev);
        if (item.kind === 'file' && item.rev === 0) {
          if (source.bytes === null) return; // Bytes not on this device: nothing to upload yet.
          blob = await sealBlob(this.key, id, source.bytes);
        }
      }
    } catch (error) {
      if (error instanceof RangeError) {
        // PLAN 5.5: a note over the limit stays on this device and the chip says so.
        this.tooLarge.add(id);
        return;
      }
      throw error;
    }
    this.own.set(`${id}:${String(rev)}`, this.clock());
    this.forgetOldOwn();
    try {
      await this.rest.putItem(id, record, blob);
    } catch (error) {
      if (error instanceof RestFailure && error.kind === 'refused') {
        await this.resolveRefusal(id, item);
        return;
      }
      throw error;
    }
    await this.vault.markUploaded(id, rev, item.seq, source);
  }

  /** After a 401: another device wrote first, or the rules refused (PLAN 6.3, "Push" step 5). */
  private async resolveRefusal(id: string, item: ItemRecord): Promise<void> {
    const raw = await this.rest.getItem(id);
    const remoteRev =
      raw !== null && typeof raw === 'object' ? (raw as { rev?: unknown }).rev : undefined;
    if (typeof remoteRev === 'number' && remoteRev !== item.rev) {
      await this.pull(id, raw);
      return;
    }
    throw new RestFailure('refused', 'PATCH item', 401);
  }

  /** Forgets own uploads older than a minute (PLAN 5.8, "Own uploads"). */
  private forgetOldOwn(): void {
    const limit = this.clock() - this.timing.ownMemory;
    for (const [k, at] of this.own) if (at < limit) this.own.delete(k);
  }

  // ----- pull ---------------------------------------------------------------------------------

  /** Catch-up (PLAN 6.3): every item changed since the cursor, in `ts` order. */
  private async catchUp(): Promise<void> {
    const records = await this.rest.itemsSince(this.cursor);
    await this.applyAll(records);
  }

  /**
   * The full download used when connecting (PLAN 6.3, "Reconcile", for a device with no notes).
   *
   * @param progress - Bytes received so far, and the total when known.
   * @returns Resolves when every record is applied.
   */
  async downloadAll(progress?: (done: number, total: number | null) => void): Promise<void> {
    await this.applyAll(await this.rest.allItems(progress));
  }

  /** Applies records in `ts` order, in chunks that yield, and moves the cursor. */
  private async applyAll(records: Record<string, unknown>): Promise<void> {
    const entries = Object.entries(records).sort(([, a], [, b]) => tsOf(a) - tsOf(b));
    let count = 0;
    for (const [id, raw] of entries) {
      await this.pull(id, raw);
      count += 1;
      // PLAN 6.3, "Performance": yield every 50 items so no task blocks input.
      if (count % 50 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const max = entries.reduce((m, [, raw]) => Math.max(m, tsOf(raw)), this.cursor);
    if (max > this.cursor) {
      this.cursor = max;
      await this.host.saveCursor(max);
    }
  }

  /**
   * Applies one record from the database (PLAN 6.3, "Pull").
   *
   * @param id - The item.
   * @param raw - The record as parsed.
   * @returns Resolves when applied, skipped or reported.
   */
  async pull(id: string, raw: unknown): Promise<void> {
    if (raw === null || typeof raw !== 'object') return;
    const rec = raw as { rev?: unknown; ts?: unknown };
    const rev = typeof rec.rev === 'number' ? rec.rev : 0;
    const ts = typeof rec.ts === 'number' ? rec.ts : 0;
    const local = this.vault.index.get(id);
    if (local !== undefined && rev < local.rev) return;
    if (local !== undefined && rev === local.rev) {
      // Step 1: applying a record twice changes nothing; only the server time is new to us.
      if (local.ts !== ts) await this.vault.setSyncFields(id, { ts });
      return;
    }
    let decoded;
    try {
      decoded = await decodeItem(this.key, id, raw);
    } catch (error) {
      if (error instanceof OpenError || error instanceof FormatError) {
        // Step 2 and I7: never applied; the local copy stays and the chip reports it.
        this.unreadable.add(id);
        if (local !== undefined) await this.vault.setSyncFields(id, { unreadable: true });
        void logEvent(this.vault.db, 'warn', 'record-unreadable', `${id} ${error.name}`);
        this.emit();
        return;
      }
      throw error;
    }
    this.unreadable.delete(id);
    if (decoded.gone) {
      // Deletions forever are applied by the rules of M3b (PLAN 6.3).
      if (local === undefined || local.dirty) this.waiting.add(id);
      return;
    }
    if (local !== undefined && local.dirty) {
      if (await this.sameAsLocal(local, decoded.meta, decoded.text)) {
        // A page closed between an upload and its local commit: this record is that upload.
        await this.vault.applyRemote(
          id,
          decoded.kind,
          rev,
          ts,
          decoded.meta,
          decoded.text,
          decoded.size,
        );
        this.waiting.delete(id);
        return;
      }
      // M3b merges this; until then the record waits and the item neither pulls nor pushes.
      this.waiting.add(id);
      this.emit();
      return;
    }
    if (decoded.text !== null && local !== undefined && this.host.isOpen(id)) {
      // An open note with no unsynced edits updates in place (PLAN 4.5).
      if (!this.host.applyToEditor(id, decoded.text)) {
        this.waiting.add(id);
        this.emit();
        return;
      }
    }
    await this.vault.applyRemote(
      id,
      decoded.kind,
      rev,
      ts,
      decoded.meta,
      decoded.text,
      decoded.size,
    );
    this.waiting.delete(id);
    if (decoded.kind === 'file') {
      this.blobQueue.push(id);
      this.pumpBlobs();
    }
  }

  /** Whether a remote version equals the local item's name, place, deletion state and text. */
  private async sameAsLocal(
    local: ItemRecord,
    meta: { name: string; parent: string; deleted: boolean },
    text: string | null,
  ): Promise<boolean> {
    if (local.name !== meta.name || local.parent !== meta.parent || local.deleted !== meta.deleted)
      return false;
    if (text === null) return true;
    return (await this.vault.readText(local.id)) === text;
  }

  /** Downloads files' bytes in the background, two at a time (PLAN 6.3, "Pull" step 3). */
  private pumpBlobs(): void {
    if (!this.isOnline()) return;
    while (this.blobsRunning < BLOB_PARALLEL && this.blobQueue.length > 0) {
      const id = this.blobQueue.shift();
      if (id === undefined) return;
      // Counted as running from the moment it leaves the queue, so "nothing pending" is never
      // reported while a download is about to start.
      this.blobsRunning += 1;
      this.emit();
      void this.fetchBlob(id).finally(() => {
        this.blobsRunning -= 1;
        this.emit();
        this.pumpBlobs();
      });
    }
  }

  /** Downloads, opens and stores one file's bytes. A failure leaves it for the next session. */
  private async fetchBlob(id: string): Promise<void> {
    const item = this.vault.index.get(id);
    if (item === undefined || item.gone || (await this.vault.readFile(id)) !== null) return;
    try {
      const sealed = await this.rest.getBlob(id);
      if (sealed === null) return;
      const bytes = await openBlob(this.key, id, sealed, item.sha256);
      await this.vault.putFileBytes(id, new Blob([bytes], { type: item.mime ?? '' }));
    } catch (error) {
      void logEvent(
        this.vault.db,
        'warn',
        'blob-download-failed',
        `${id} ${error instanceof Error ? error.name : ''}`,
      );
    }
  }
}

/** The `ts` of a raw record, or 0. */
function tsOf(raw: unknown): number {
  return raw !== null && typeof raw === 'object' && typeof (raw as { ts?: unknown }).ts === 'number'
    ? (raw as { ts: number }).ts
    : 0;
}
