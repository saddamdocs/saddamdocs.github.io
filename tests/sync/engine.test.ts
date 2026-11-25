/**
 * Sync tests in Node.js against the Realtime Database emulator (PLAN 8, "Sync"): two devices, each
 * with its own IndexedDB (fake-indexeddb) and engine, sharing one vault key. Covers push and pull
 * for every kind of item with blobs, offline changes, a page closed in mid-upload, refusals, and
 * the invariants I1, I3, I6 and I7. Merges are M3b; here a conflicting record waits.
 *
 * Run with `npm run test:sync` (inside the emulator).
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openVault } from '../../src/lib/store/db.ts';
import { deriveKey, makeCheck, newSalt, toBase64 } from '../../src/lib/sync/crypto.ts';
import { SV } from '../../src/lib/sync/format.ts';
import { REFUSED_MESSAGE, SyncEngine, type EngineTiming } from '../../src/lib/sync/engine.ts';
import { Rest } from '../../src/lib/sync/rest.ts';
import { Vault } from '../../src/lib/vault/operations.ts';
import {
  EMULATOR_URL,
  LOCKED_RULES,
  RULES,
  loadRules,
  namespace,
  randomKey,
  rest,
} from '../support/emulator.ts';

const FAST: EngineTiming = {
  quiet: 20,
  maxWait: 100,
  openNoteCatchUp: 10,
  otherCatchUp: 30,
  retries: [30, 60],
  hiddenClose: 1000,
  ownMemory: 60_000,
};

const ns = namespace('sync');
let key: string;
let cryptoKey: CryptoKey;
let dbCount = 0;
const requests: string[] = [];
const realFetch = globalThis.fetch;

/** One simulated device. */
interface Device {
  vault: Vault;
  engine: SyncEngine;
  rest: Rest;
  online: { value: boolean };
}

async function device(name: string): Promise<Device> {
  dbCount += 1;
  const opened = await openVault(`sync-${name}-${String(dbCount)}`);
  if (opened.kind !== 'ok') throw new Error(opened.kind);
  const vault = await Vault.load(opened.db, () => name);
  const online = { value: true };
  const r = new Rest({ databaseUrl: EMULATOR_URL, namespace: ns, key }, () => online.value);
  const engine = new SyncEngine(
    vault,
    r,
    cryptoKey,
    { isOpen: () => false, applyToEditor: () => true, saveCursor: () => Promise.resolve() },
    0,
    FAST,
  );
  return { vault, engine, rest: r, online };
}

function ok<T>(result: { ok: true; value: T } | { ok: false; problem: string }): T {
  if (!result.ok) throw new Error(result.problem);
  return result.value;
}

/** Everything a vault holds that devices must agree on (PLAN I4): items and texts. */
async function snapshot(vault: Vault): Promise<string[]> {
  const out: string[] = [];
  for (const item of vault.index.byId.values()) {
    if (item.kind === 'settings') continue;
    const text = item.kind === 'note' ? await vault.readText(item.id) : '';
    out.push(`${vault.index.path(item.id)}|${item.kind}|${String(item.deleted)}|${text ?? ''}`);
  }
  return out.sort();
}

beforeAll(async () => {
  await loadRules(ns, RULES);
  // Record every request URL for I6.
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(String(input instanceof Request ? input.url : input));
    return realFetch(input, init);
  };
});

beforeEach(async () => {
  key = randomKey();
  const salt = newSalt();
  cryptoKey = await deriveKey('test passphrase, not a real one', salt);
  // A vault exists once `info` is written ("Start a new synced vault", PLAN 4.5).
  const res = await rest(
    'PUT',
    `/tamandua/${key}/info`,
    { format: 1, salt: toBase64(salt), check: await makeCheck(cryptoKey), created: SV },
    { ns },
  );
  expect(res.status).toBe(200);
});

afterEach(() => {
  requests.length = 0;
});

describe('push and pull (PLAN 6.3)', () => {
  it('folders, notes, text, renames and moves made on A appear on B', async () => {
    const a = await device('A');
    const b = await device('B');
    const folder = ok(await a.vault.createFolder('', 'Ideias'));
    const note = ok(await a.vault.createNote(folder.id, 'Plano'));
    await a.vault.saveText(note.id, 'Olá, ação!');
    await a.engine.syncNow();
    expect(a.vault.dirtyItems()).toEqual([]);

    await b.engine.syncNow();
    expect(await snapshot(b.vault)).toEqual(await snapshot(a.vault));

    await a.vault.rename(note.id, 'Plano de ação');
    await a.vault.saveText(note.id, 'Segunda versão.');
    await a.vault.move(note.id, '');
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await snapshot(b.vault)).toEqual(await snapshot(a.vault));
    expect(b.vault.index.get(note.id)).toMatchObject({
      // One upload sends the whole item: rename, text and move went up together (PLAN 5.8).
      rev: 2,
      dirty: false,
      name: 'Plano de ação',
      parent: '',
    });
  });

  it('an imported image uploads with its blob, and B downloads the same bytes', async () => {
    const a = await device('A');
    const b = await device('B');
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const [id] = await a.vault.importItems('', [
      { kind: 'file', name: 'mapa.png', parent: -1, bytes, mime: 'image/png' },
    ]);
    await a.engine.syncNow();
    const blob = await rest('GET', `/tamandua/${key}/blobs/${id!}`, undefined, { ns });
    expect(typeof blob.body).toBe('string');
    await b.engine.syncNow();
    await b.engine.blobsDone();
    const got = await b.vault.readFile(id!);
    expect(new Uint8Array(await got!.arrayBuffer())).toEqual(bytes);
    expect(b.vault.index.get(id!)).toMatchObject({
      mime: 'image/png',
      sha256: a.vault.index.get(id!)!.sha256,
    });
  });

  it('the settings item syncs like a note', async () => {
    const a = await device('A');
    await a.vault.ensureSettingsItem('{"fontSize":20}');
    await a.engine.syncNow();
    const b = await device('B');
    await b.engine.syncNow();
    expect(await b.vault.readText('settings000000000000')).toBe('{"fontSize":20}');
  });
});

describe('offline and interrupted (PLAN 4.5, 6.3)', () => {
  it('changes made offline wait, with the chip counting them, and upload when online', async () => {
    const a = await device('A');
    a.online.value = false;
    const n = ok(await a.vault.createNote('', 'offline'));
    await a.vault.saveText(n.id, 'typed offline');
    await a.engine.syncNow();
    expect(a.engine.chip).toEqual({ kind: 'offline', waiting: 1 });
    expect(
      (await rest('GET', `/tamandua/${key}/items/${n.id}`, undefined, { ns })).body,
    ).toBeNull();
    a.online.value = true;
    await a.engine.syncNow();
    expect(a.vault.dirtyItems()).toEqual([]);
    expect(
      (await rest('GET', `/tamandua/${key}/items/${n.id}`, undefined, { ns })).body,
    ).toMatchObject({ rev: 1 });
  });

  it('a page closed between an upload and its local commit finishes later without a duplicate', async () => {
    const a = await device('A');
    const n = ok(await a.vault.createNote('', 'half-way'));
    await a.vault.saveText(n.id, 'uploaded, but the page died');
    // The upload reaches the database, then the page dies before marking the item clean.
    const putItem = a.rest.putItem.bind(a.rest);
    a.rest.putItem = async (...args) => {
      await putItem(...args);
      throw new Error('page closed');
    };
    await a.engine.syncNow();
    expect(a.vault.index.get(n.id)?.dirty).toBe(true);

    // The next session: a new engine on the same storage.
    const again = new SyncEngine(
      a.vault,
      new Rest({ databaseUrl: EMULATOR_URL, namespace: ns, key }),
      cryptoKey,
      { isOpen: () => false, applyToEditor: () => true, saveCursor: () => Promise.resolve() },
      0,
      FAST,
    );
    await again.syncNow();
    expect(a.vault.index.get(n.id)).toMatchObject({ dirty: false, rev: 1 });
    const remote = await rest('GET', `/tamandua/${key}/items`, undefined, { ns, owner: true });
    expect(Object.keys(remote.body as object)).toEqual([n.id]);
  });
});

describe('invariants', () => {
  it('I1: every saved edit is in the database or marked dirty', async () => {
    const a = await device('A');
    const n = ok(await a.vault.createNote('', 'i1'));
    await a.vault.saveText(n.id, 'one');
    await a.engine.syncNow();
    await a.vault.saveText(n.id, 'two');
    expect(a.vault.index.get(n.id)?.dirty).toBe(true);
    await a.engine.syncNow();
    const b = await device('B');
    await b.engine.syncNow();
    expect(await b.vault.readText(n.id)).toBe('two');
  });

  it('I3: applying the same records twice, or catching up twice, changes nothing', async () => {
    const a = await device('A');
    const n = ok(await a.vault.createNote('', 'i3'));
    await a.vault.saveText(n.id, 'x');
    await a.engine.syncNow();
    const b = await device('B');
    await b.engine.syncNow();
    const before = JSON.stringify([...b.vault.index.byId.values()]);
    await b.engine.syncNow();
    await b.engine.downloadAll();
    expect(JSON.stringify([...b.vault.index.byId.values()])).toBe(before);
  });

  it('I6: nothing is ever requested outside /tamandua/<key>', async () => {
    const a = await device('A');
    ok(await a.vault.createNote('', 'i6'));
    await a.engine.syncNow();
    const mine = requests.filter(
      (u) => u.startsWith(EMULATOR_URL) && !u.includes('/.settings/') && !u.includes('ns=rules-'),
    );
    expect(mine.length).toBeGreaterThan(0);
    for (const url of mine) expect(url.startsWith(`${EMULATOR_URL}/tamandua/`), url).toBe(true);
  });

  it('I7: a record overwritten with garbage is never applied, and is reported', async () => {
    const a = await device('A');
    const b = await device('B');
    const n = ok(await a.vault.createNote('', 'i7'));
    await a.vault.saveText(n.id, 'the real text');
    await a.engine.syncNow();
    await b.engine.syncNow();
    // Someone with the key, but not the passphrase, writes garbage as the next revision.
    await rest(
      'PUT',
      `/tamandua/${key}/items/${n.id}`,
      { rev: 2, ts: SV, kind: 'note', enc: 1, meta: 'AAAA', body: 'AAAA', size: 1 },
      { ns, owner: true },
    );
    await b.engine.syncNow();
    expect(await b.vault.readText(n.id)).toBe('the real text');
    expect(b.vault.index.get(n.id)).toMatchObject({ rev: 1, unreadable: true });
    expect(b.engine.details.unreadable).toEqual([n.id]);
  });
});

describe('conflicts wait for M3b; refusals stop', () => {
  it('a record that meets unsynced edits waits, and the item is held', async () => {
    const a = await device('A');
    const b = await device('B');
    const n = ok(await a.vault.createNote('', 'both'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.vault.saveText(n.id, 'from A');
    await b.vault.saveText(n.id, 'from B');
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.engine.details.waitingForMerge).toEqual([n.id]);
    expect(await b.vault.readText(n.id)).toBe('from B');
    const remote = await rest('GET', `/tamandua/${key}/items/${n.id}`, undefined, { ns });
    expect(remote.body).toMatchObject({ rev: 2 });
  });

  it('a write the rules refuse stops sync with the message, without a loop', async () => {
    const a = await device('A');
    ok(await a.vault.createNote('', 'refused'));
    await loadRules(ns, LOCKED_RULES);
    try {
      const before = requests.length;
      await a.engine.syncNow();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(a.engine.chip).toEqual({ kind: 'problem', message: REFUSED_MESSAGE });
      expect(requests.length - before).toBeLessThan(5);
    } finally {
      await loadRules(ns, RULES);
    }
  });
});

describe('keys and passphrases (PLAN 4.5)', () => {
  it('creates a vault, refuses a second one under the same key, and checks passphrases', async () => {
    const { createVault, unlockVault, newSyncKey, readSyncKey, formatSyncKey } =
      await import('../../src/lib/sync/keys.ts');
    const fresh = newSyncKey();
    expect(fresh).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(readSyncKey(formatSyncKey(fresh))).toBe(fresh);
    expect(readSyncKey(`${fresh.slice(0, 8)}-${fresh.slice(8)}`)).toBe(fresh);
    expect(readSyncKey('too short')).toBeNull();

    const r = new Rest({ databaseUrl: EMULATOR_URL, namespace: ns, key: fresh });
    await expect(createVault(r, 'short')).rejects.toBeInstanceOf(RangeError);
    await createVault(r, 'quatro palavras ao acaso');
    await expect(createVault(r, 'quatro palavras ao acaso')).rejects.toMatchObject({
      kind: 'refused',
    });
    expect(await unlockVault(r, 'not the passphrase')).toEqual({ problem: 'wrong-passphrase' });
    const unlocked = await unlockVault(r, 'quatro palavras ao acaso');
    expect('key' in unlocked).toBe(true);
    const nowhere = new Rest({ databaseUrl: EMULATOR_URL, namespace: ns, key: newSyncKey() });
    expect(await unlockVault(nowhere, 'anything at all here')).toEqual({ problem: 'no-vault' });
  });

  it('a device with no notes connects and downloads the whole vault', async () => {
    const a = await device('A');
    const f = ok(await a.vault.createFolder('', 'Diário'));
    for (let i = 0; i < 5; i += 1) {
      const n = ok(await a.vault.createNote(f.id, `dia ${String(i)}`));
      await a.vault.saveText(n.id, `texto ${String(i)}`);
    }
    await a.engine.syncNow();
    const b = await device('B');
    const seen: number[] = [];
    await b.engine.downloadAll((done) => seen.push(done));
    expect(await snapshot(b.vault)).toEqual(await snapshot(a.vault));
    expect(seen.length).toBeGreaterThan(0);
  });
});
