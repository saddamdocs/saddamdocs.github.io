/**
 * The zip worker (PLAN 4.15: the archive is built by fflate in a worker), so building or reading a
 * large archive never blocks typing. It receives one request at a time from `transfer/zip.ts` and
 * answers with the result, transferring the buffers instead of copying them.
 *
 * Talks to: `transfer/zipCore.ts`, and the page through `postMessage`.
 */

import { unzipEntries, zipEntries, type ZipEntries } from './zipCore.ts';

/** A request from the page. */
export type ZipRequest =
  | { readonly id: number; readonly op: 'zip'; readonly entries: ZipEntries }
  | { readonly id: number; readonly op: 'unzip'; readonly archive: Uint8Array<ArrayBuffer> };

/** The worker's answer. */
export type ZipResponse =
  | { readonly id: number; readonly ok: true; readonly archive: Uint8Array<ArrayBuffer> }
  | { readonly id: number; readonly ok: true; readonly entries: ZipEntries }
  | { readonly id: number; readonly ok: false; readonly error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ZipRequest>) => void) | null;
  postMessage: (message: ZipResponse, transfer: Transferable[]) => void;
};

scope.onmessage = (event: MessageEvent<ZipRequest>) => {
  const request = event.data;
  try {
    if (request.op === 'zip') {
      const archive = zipEntries(request.entries);
      scope.postMessage({ id: request.id, ok: true, archive }, [archive.buffer]);
    } else {
      const entries = unzipEntries(request.archive);
      scope.postMessage(
        { id: request.id, ok: true, entries },
        Object.values(entries).map((b) => b.buffer),
      );
    }
  } catch (error) {
    scope.postMessage(
      { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) },
      [],
    );
  }
};
