#!/usr/bin/env node
/**
 * Tamanduá recovery tool (PLAN 4.15, R12): turns the encrypted copy of a vault in the database back
 * into ordinary folders of `.md` files and images, laid out exactly like "Export vault", with the
 * Trash under `.trash/`. It needs Node.js 20 or newer and nothing else: no app, no browser, no
 * packages.
 *
 * It is written from the specification of format 1 (PLAN 5.6) and shares no code with the app, so
 * it also cross-checks the format. It never writes to the database.
 *
 * Usage:
 *   node recover.mjs --file vault.json --out <empty folder>
 *       vault.json: Firebase console → Realtime Database → the /tamandua/<key> node → Export JSON
 *   node recover.mjs --url <database address> --key <sync key> --out <empty folder>
 *       downloads the vault itself (read-only).
 *
 * The passphrase is asked for on the terminal and is never taken as an argument. When the input is
 * not a terminal (a pipe), the first line read from it is the passphrase.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const { subtle } = globalThis.crypto;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** Prints a message and stops with an exit code. */
function stop(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/** Reads `--name value` pairs from the command line. */
function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) stop(`Unexpected argument: ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) stop(`Missing value for ${arg}`);
    args[arg.slice(2)] = value;
    i += 1;
  }
  return args;
}

/** Asks for the passphrase without echoing it; reads the first line when not on a terminal. */
async function askPassphrase() {
  const input = process.stdin;
  if (!input.isTTY) {
    let data = '';
    for await (const chunk of input) {
      data += chunk;
      if (data.includes('\n')) break;
    }
    return data.split(/\r?\n/)[0] ?? '';
  }
  process.stderr.write('Passphrase: ');
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  return new Promise((resolve) => {
    let typed = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          input.setRawMode(false);
          input.pause();
          input.off('data', onData);
          process.stderr.write('\n');
          resolve(typed);
          return;
        }
        if (ch === '\u0003') {
          input.setRawMode(false);
          stop('\nCancelled.', 130);
        }
        if (ch === '\u007f' || ch === '\b') typed = typed.slice(0, -1);
        else typed += ch;
      }
    };
    input.on('data', onData);
  });
}

/** Standard base64 to bytes. */
function fromBase64(text) {
  return new Uint8Array(Buffer.from(text, 'base64'));
}

/** PLAN 5.6: PBKDF2-HMAC-SHA-256, 600,000 iterations, NFC UTF-8 passphrase, AES-GCM 256. */
async function deriveKey(passphrase, salt) {
  const material = await subtle.importKey(
    'raw',
    encoder.encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

/** PLAN 5.6: base64 of nonce (12) ‖ ciphertext ‖ tag (16), AES-GCM with an AAD string. */
async function open(key, sealed, aad) {
  const bytes = fromBase64(sealed);
  if (bytes.length < 28) throw new Error('seal too short');
  return new Uint8Array(
    await subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: encoder.encode(aad) },
      key,
      bytes.subarray(12),
    ),
  );
}

/** Hex SHA-256. */
async function sha256(bytes) {
  return Buffer.from(await subtle.digest('SHA-256', bytes)).toString('hex');
}

/** Loads the vault's JSON from a file or from the database. */
async function loadVault(args) {
  if (args.file !== undefined) {
    const data = JSON.parse(readFileSync(args.file, 'utf8'));
    // An export of a higher node: /tamandua/<key>/… or /tamandua.
    if (data.info === undefined && data.tamandua !== undefined && args.key !== undefined)
      return data.tamandua[args.key];
    if (data.info === undefined && args.key !== undefined && data[args.key] !== undefined)
      return data[args.key];
    return data;
  }
  if (args.url === undefined || args.key === undefined)
    stop('Give --file, or --url and --key. See the comment at the top of this file.');
  // The rules allow reading a vault's parts, not the vault node as a whole (Appendix B), so read
  // `info`, `moved` and `items`, then each file's blob, as the app does.
  const ns = args.ns === undefined ? '' : `?ns=${encodeURIComponent(args.ns)}`;
  const base = `${args.url.replace(/\/$/, '')}/tamandua/${args.key}`;
  const get = async (path) => {
    const response = await fetch(`${base}/${path}.json${ns}`);
    if (!response.ok)
      stop(`The database answered ${response.status} for ${path}; check the address and the key.`);
    return response.json();
  };
  const info = await get('info');
  if (info === null) stop('There is no vault under this key at this address.');
  const moved = await get('moved');
  const items = (await get('items')) ?? {};
  // Every file has its blob, in the Trash too, until it is deleted forever (then there is none).
  const blobs = {};
  for (const [id, record] of Object.entries(items)) {
    if (record === null || record.kind !== 'file') continue;
    const blob = await get(`blobs/${id}`);
    if (typeof blob === 'string') blobs[id] = blob;
  }
  return moved === null ? { info, items, blobs } : { info, moved, items, blobs };
}

/** Adds " (n)" before a file's extension: "map (2).png", "plan (2).md". */
function numbered(name, n) {
  const dot = name.lastIndexOf('.');
  const suffix = ` (${n})`;
  return dot > 0 ? name.slice(0, dot) + suffix + name.slice(dot) : name + suffix;
}

/** Case-insensitive comparison key, as on Windows. */
function nameKey(name) {
  return name.normalize('NFC').toUpperCase().toLowerCase();
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.out === undefined) stop('Give --out, an empty folder for the recovered notes.');
  if (existsSync(args.out) && readdirSync(args.out).length > 0)
    stop(`${args.out} is not empty; give an empty or new folder.`);

  const vault = await loadVault(args);
  if (vault === null || typeof vault !== 'object' || typeof vault.info !== 'object')
    stop('No vault found in the input (no "info" record).');
  if (vault.info.format !== 1)
    stop(
      `This vault is in format ${vault.info.format}; this tool reads format 1. Use a newer recover.mjs.`,
    );
  if (vault.moved !== undefined)
    process.stderr.write(
      'Note: this vault was moved to a new key; the newest notes are under the new key.\n',
    );

  const passphrase = await askPassphrase();
  const key = await deriveKey(passphrase, fromBase64(vault.info.salt));
  try {
    if (
      decoder.decode(await open(key, vault.info.check, 'tamandua:1:check')) !== 'tamandua check v1'
    )
      throw new Error();
  } catch {
    stop('The passphrase does not open this vault.', 2);
  }

  // Open every item (PLAN 5.5, 5.6).
  const items = new Map();
  const problems = [];
  let tombstones = 0;
  for (const [id, record] of Object.entries(vault.items ?? {})) {
    try {
      if (record.enc !== 1) throw new Error(`encryption format ${record.enc}`);
      const meta = JSON.parse(
        decoder.decode(await open(key, record.meta, `tamandua:1:meta:${id}:${record.rev}`)),
      );
      if (meta.gone === true) {
        tombstones += 1;
        continue;
      }
      const item = { id, kind: record.kind, deleted: record.deleted === true, ...meta };
      if (record.kind === 'note' || record.kind === 'settings') {
        item.text = decoder.decode(
          inflateRawSync(await open(key, record.body, `tamandua:1:body:${id}:${record.rev}`)),
        );
      }
      items.set(id, item);
    } catch (error) {
      problems.push(
        `${id}: could not open (${error instanceof Error && error.message !== '' ? error.message : 'wrong key, damaged, or copied from elsewhere'})`,
      );
    }
  }

  /** The folder an item shows in: its parent when that is a known folder, not leading back to it. */
  const parentOf = (item) => {
    const parent = items.get(item.parent);
    if (parent === undefined || parent.kind !== 'folder') return '';
    let cursor = parent;
    for (let steps = 0; cursor !== undefined && steps <= items.size; steps += 1) {
      if (cursor.id === item.id) return '';
      cursor = items.get(cursor.parent);
    }
    return parent.id;
  };
  const children = new Map();
  for (const item of items.values()) {
    if (item.kind === 'settings') continue;
    const p = parentOf(item);
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(item);
  }

  const counts = { notes: 0, folders: 0, images: 0 };
  /** Writes a list of siblings under a folder path, with " (2)" for names that clash ignoring case. */
  const writeAll = async (list, dir, depth) => {
    const ordered = [...list].sort((a, b) => a.created - b.created || (a.id < b.id ? -1 : 1));
    const taken = new Set();
    for (const item of ordered) {
      const base = item.kind === 'note' ? `${item.name}.md` : item.name;
      let name = base;
      for (let n = 2; taken.has(nameKey(name)); n += 1) name = numbered(base, n);
      taken.add(nameKey(name));
      const path = join(dir, name);
      if (item.kind === 'folder') {
        mkdirSync(path, { recursive: true });
        counts.folders += 1;
        if (depth <= items.size) await writeAll(children.get(item.id) ?? [], path, depth + 1);
      } else if (item.kind === 'note') {
        writeFileSync(path, item.text ?? '');
        counts.notes += 1;
      } else if (item.kind === 'file') {
        const sealed = vault.blobs?.[item.id];
        if (typeof sealed !== 'string') {
          problems.push(`${path}: the image's contents are not in the database`);
          continue;
        }
        try {
          const bytes = await open(key, sealed, `tamandua:1:blob:${item.id}`);
          if (typeof item.sha256 === 'string' && (await sha256(bytes)) !== item.sha256)
            throw new Error('checksum differs');
          writeFileSync(path, bytes);
          counts.images += 1;
        } catch (error) {
          problems.push(
            `${path}: could not open (${error instanceof Error && error.message !== '' ? error.message : 'damaged'})`,
          );
        }
      }
    }
  };

  mkdirSync(args.out, { recursive: true });
  // The tree as "Export vault" lays it out: live items, then the Trash under `.trash/`.
  const live = (list) => list.filter((i) => !i.deleted);
  const liveChildren = new Map([...children].map(([k, v]) => [k, live(v)]));
  const trashed = [...items.values()].filter(
    (i) => i.kind !== 'settings' && i.deleted && !hasDeletedAncestor(i),
  );
  function hasDeletedAncestor(item) {
    let p = parentOf(item);
    for (let steps = 0; p !== '' && steps <= items.size; steps += 1) {
      const folder = items.get(p);
      if (folder.deleted) return true;
      p = parentOf(folder);
    }
    return false;
  }
  const allChildren = new Map(children);
  children.clear();
  for (const [k, v] of liveChildren) children.set(k, v);
  await writeAll(children.get('') ?? [], args.out, 0);
  if (trashed.length > 0) {
    // Inside the Trash, a deleted folder keeps everything it held.
    children.clear();
    for (const [k, v] of allChildren) children.set(k, v);
    const trashDir = join(args.out, '.trash');
    mkdirSync(trashDir, { recursive: true });
    await writeAll(trashed, trashDir, 0);
  }

  process.stdout.write(
    `Recovered ${counts.notes} notes, ${counts.folders} folders and ${counts.images} images into ${args.out}`,
  );
  process.stdout.write(tombstones > 0 ? ` (${tombstones} deleted forever, skipped).\n` : '.\n');
  if (problems.length > 0) {
    process.stdout.write(`${problems.length} item(s) could not be recovered:\n`);
    for (const p of problems) process.stdout.write(`  ${p}\n`);
    process.exitCode = 3;
  }
}

await main();
