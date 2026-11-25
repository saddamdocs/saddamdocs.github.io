/**
 * Writes the format-1 fixture of PLAN 8: a database export of a small vault, sealed with the test
 * passphrase by the app's own code, and the files the recovery tool must rebuild from it.
 *
 * - `tests/fixtures/format1/vault.json`: the `/tamandua/<key>` node as the Firebase console exports
 *   it: `info`, `head`, `items`, `blobs`.
 * - `tests/fixtures/format1/expected.json`: every path the recovery must write, with its bytes in
 *   base64 (null for a folder). Made with the app's export planner, so the test compares two
 *   independent implementations. A manifest rather than a folder, because Git keeps no empty folder.
 *
 * Old data must keep opening in every later version (PLAN 8): never regenerate this fixture to make
 * a failing test pass. Usage: `node --experimental-transform-types scripts/format1-fixture.ts`
 * (the sync modules use parameter properties, which plain type stripping cannot run).
 *
 * Talks to: `src/lib/sync/` (sealing), `src/lib/transfer/exportZip.ts` and `src/lib/vault/tree.ts`
 * (the expected layout), the file system.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ItemKind, ItemRecord } from '../src/lib/store/schema.ts';
import { deriveKey, makeCheck, toBase64 } from '../src/lib/sync/crypto.ts';
import { encodeItem, encodeTombstone, sealBlob } from '../src/lib/sync/format.ts';
import { planExport } from '../src/lib/transfer/exportZip.ts';
import { VaultIndex } from '../src/lib/vault/tree.ts';

/** The test passphrase the fixture is sealed with (never a real one). */
export const PASSPHRASE = 'test passphrase for the format 1 fixture';
const OUT = new URL('../tests/fixtures/format1/', import.meta.url);
const salt = new Uint8Array(Array.from({ length: 16 }, (_, i) => 100 + i));
const key = await deriveKey(PASSPHRASE, salt);
const png = new Uint8Array(
  readFileSync(new URL('../tests/fixtures/import/source/images/img.png', import.meta.url)),
);
const pngHash = Buffer.from(await crypto.subtle.digest('SHA-256', png)).toString('hex');

/** One item of the fixture vault. */
interface Spec {
  id: string;
  kind: ItemKind;
  name: string;
  parent: string;
  created: number;
  text?: string;
  deleted?: boolean;
  rev?: number;
}

const T = Date.UTC(2026, 10, 25, 12);
const id = (n: number): string => `0fixture${String(n).padStart(12, '0')}`;
const specs: Spec[] = [
  { id: id(1), kind: 'folder', name: 'Projetos', parent: '', created: T },
  { id: id(2), kind: 'folder', name: 'Tamanduá', parent: id(1), created: T + 1 },
  { id: id(3), kind: 'folder', name: 'Profundo', parent: id(2), created: T + 2 },
  {
    id: id(4),
    kind: 'note',
    name: 'Plano de ação',
    parent: id(3),
    created: T + 3,
    text: '# Plano\n\nAção, coração, pão.\n![](../mapa.png)\n',
    rev: 3,
  },
  { id: id(5), kind: 'file', name: 'mapa.png', parent: id(2), created: T + 4 },
  { id: id(6), kind: 'folder', name: 'Vazia', parent: '', created: T + 5 },
  { id: id(7), kind: 'note', name: 'Plan', parent: '', created: T + 6, text: 'first' },
  {
    id: id(8),
    kind: 'note',
    name: 'plan',
    parent: '',
    created: T + 7,
    text: 'second, same name ignoring case',
  },
  {
    id: id(9),
    kind: 'note',
    name: 'Apagada',
    parent: '',
    created: T + 8,
    text: 'in the Trash',
    deleted: true,
  },
  { id: id(10), kind: 'folder', name: 'Velha', parent: '', created: T + 9, deleted: true },
  {
    id: id(11),
    kind: 'note',
    name: 'dentro',
    parent: id(10),
    created: T + 10,
    text: 'inside a deleted folder',
  },
  {
    id: id(12),
    kind: 'note',
    name: '日本語',
    parent: id(1),
    created: T + 11,
    text: 'Non-Latin script.\n',
  },
];

const records: ItemRecord[] = specs.map((s) => ({
  id: s.id,
  kind: s.kind,
  name: s.name,
  parent: s.parent,
  created: s.created,
  updated: s.created + 1000,
  device: 'Linux · Brave',
  deleted: s.deleted === true,
  deletedAt: s.deleted === true ? s.created + 5000 : null,
  mime: s.kind === 'file' ? 'image/png' : null,
  sha256: s.kind === 'file' ? pngHash : null,
  extra: {},
  size: s.kind === 'file' ? png.length : new TextEncoder().encode(s.text ?? '').length,
  gone: false,
  rev: s.rev ?? 1,
  ts: T,
  dirty: false,
  dirtySince: null,
  seq: 1,
  base: null,
  unreadable: false,
}));

const items: Record<string, unknown> = {};
const blobs: Record<string, string> = {};
for (const [i, rec] of records.entries()) {
  const sealed = await encodeItem(key, rec, specs[i]?.text ?? null, rec.rev);
  items[rec.id] = { ...sealed, ts: T + i };
  if (rec.kind === 'file') blobs[rec.id] = await sealBlob(key, rec.id, png);
}
// A tombstone (deleted forever) and the settings item: the recovery writes neither.
items[id(13)] = { ...(await encodeTombstone(key, id(13), 'note', 4)), ts: T + 20 };
const settings = {
  ...records[6]!,
  id: 'settings000000000000',
  kind: 'settings' as const,
  name: 'settings',
  parent: '',
};
items.settings000000000000 = {
  ...(await encodeItem(key, settings, '{"fontSize":18}', 1)),
  ts: T + 21,
};

const vault = {
  info: { format: 1, salt: toBase64(salt), check: await makeCheck(key), created: T },
  head: { ts: T + 21, id: 'settings000000000000', rev: 1 },
  items,
  blobs,
};

// What "Export vault" with the Trash would write: the recovery tool must produce exactly this.
const plan = planExport(new VaultIndex(records), '', true);
const expected: Record<string, string | null> = {};
for (const { path, item } of plan) {
  if (path.endsWith('/')) expected[path.slice(0, -1)] = null;
  else if (item.kind === 'file') expected[path] = toBase64(png);
  else
    expected[path] = toBase64(
      new TextEncoder().encode(specs.find((s) => s.id === item.id)?.text ?? ''),
    );
}

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('vault.json', OUT), `${JSON.stringify(vault, null, 2)}\n`);
writeFileSync(new URL('expected.json', OUT), `${JSON.stringify(expected, null, 2)}\n`);
console.log(
  `wrote vault.json (${String(Object.keys(items).length)} items) and expected.json (${String(Object.keys(expected).length)} paths)`,
);
