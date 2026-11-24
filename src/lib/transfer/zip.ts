/**
 * The page's side of the zip worker: `zip()` and `unzip()` as promises. The worker starts on first
 * use and stays for the session; it is precached like every other file of the app, so export and
 * import work offline (PLAN 4.15).
 *
 * Talks to: `transfer/zip.worker.ts`.
 */

import type { ZipRequest, ZipResponse } from './zip.worker.ts';
import type { ZipEntries } from './zipCore.ts';

let worker: Worker | null = null;
let counter = 0;
const pending = new Map<
  number,
  { resolve: (r: ZipResponse) => void; reject: (e: Error) => void }
>();

/** Starts the worker once. */
function getWorker(): Worker {
  if (worker !== null) return worker;
  worker = new Worker(new URL('./zip.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<ZipResponse>) => {
    const waiting = pending.get(event.data.id);
    pending.delete(event.data.id);
    waiting?.resolve(event.data);
  };
  worker.onerror = (event) => {
    // A worker that fails to start fails every request waiting on it; the next use starts anew.
    for (const waiting of pending.values())
      waiting.reject(new Error(event.message || 'zip worker failed'));
    pending.clear();
    worker = null;
  };
  return worker;
}

/** A request without its id; distributes over the union of request kinds. */
type Unsent<T> = T extends unknown ? Omit<T, 'id'> : never;

/** Sends one request and waits for its answer. */
function send(request: Unsent<ZipRequest>, transfer: Transferable[]): Promise<ZipResponse> {
  counter += 1;
  const id = counter;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...request, id }, transfer);
  });
}

/**
 * Builds an archive in the worker.
 *
 * @param entries - Paths to bytes; the buffers are transferred to the worker and become unusable here.
 * @returns The archive.
 * @throws When the worker reports an error.
 */
export async function zip(entries: ZipEntries): Promise<Uint8Array<ArrayBuffer>> {
  const answer = await send(
    { op: 'zip', entries },
    Object.values(entries).map((b) => b.buffer),
  );
  if (!answer.ok) throw new Error(answer.error);
  if (!('archive' in answer)) throw new Error('zip worker: unexpected answer');
  return answer.archive;
}

/**
 * Reads an archive in the worker.
 *
 * @param archive - The archive; its buffer is transferred to the worker.
 * @returns Paths to bytes.
 * @throws When the archive is damaged.
 */
export async function unzip(archive: Uint8Array<ArrayBuffer>): Promise<ZipEntries> {
  const answer = await send({ op: 'unzip', archive }, [archive.buffer]);
  if (!answer.ok) throw new Error(answer.error);
  if (!('entries' in answer)) throw new Error('zip worker: unexpected answer');
  return answer.entries;
}
