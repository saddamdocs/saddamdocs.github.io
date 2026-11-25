/**
 * Tests of `tools/recover.mjs` (PLAN 4.15, R12) against the format-1 fixture of PLAN 8: the tool
 * rebuilds exactly the folders "Export vault" would write, refuses a wrong passphrase, and never
 * writes into a folder that is not empty. The passphrase goes in on standard input, never as an
 * argument.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const TOOL = fileURLToPath(new URL('../../tools/recover.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../fixtures/format1/', import.meta.url));
const PASSPHRASE = 'test passphrase for the format 1 fixture';
const dirs: string[] = [];

/** Runs the tool with a passphrase on standard input. */
function recover(
  args: string[],
  passphrase: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [TOOL, ...args], {
    input: `${passphrase}\n`,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A new empty folder for the output. */
function emptyDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tamandua-recover-'));
  dirs.push(dir);
  return dir;
}

/** A folder as a manifest: path → base64 bytes, or null for a folder. */
function manifest(dir: string): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const rel = relative(dir, full);
      if (statSync(full).isDirectory()) {
        out[rel] = null;
        walk(full);
      } else out[rel] = readFileSync(full).toString('base64');
    }
  };
  walk(dir);
  return out;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('tools/recover.mjs (PLAN 4.15)', () => {
  it('rebuilds the fixture vault exactly, Trash under .trash/, and reports what it wrote', () => {
    const out = emptyDir();
    const result = recover(['--file', join(FIXTURE, 'vault.json'), '--out', out], PASSPHRASE);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Recovered 6 notes, 5 folders and 1 images');
    expect(result.stdout).toContain('1 deleted forever, skipped');
    const expected = JSON.parse(readFileSync(join(FIXTURE, 'expected.json'), 'utf8')) as Record<
      string,
      string | null
    >;
    expect(manifest(out)).toEqual(expected);
  });

  it('refuses a wrong passphrase and writes nothing', () => {
    const out = emptyDir();
    const result = recover(
      ['--file', join(FIXTURE, 'vault.json'), '--out', out],
      'not the passphrase',
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('does not open this vault');
    expect(readdirSync(out)).toEqual([]);
  });

  it('never writes into a folder that is not empty', () => {
    const out = emptyDir();
    writeFileSync(join(out, 'keep.txt'), 'mine');
    const result = recover(['--file', join(FIXTURE, 'vault.json'), '--out', out], PASSPHRASE);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not empty');
    expect(readdirSync(out)).toEqual(['keep.txt']);
  });

  it('reports a damaged item and recovers the rest', () => {
    const vault = JSON.parse(readFileSync(join(FIXTURE, 'vault.json'), 'utf8')) as {
      items: Record<string, { meta: string }>;
    };
    const first = Object.keys(vault.items)[6]!;
    vault.items[first]!.meta = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const damaged = join(emptyDir(), 'vault.json');
    writeFileSync(damaged, JSON.stringify(vault));
    const out = emptyDir();
    const result = recover(['--file', damaged, '--out', out], PASSPHRASE);
    expect(result.status).toBe(3);
    expect(result.stdout).toContain('1 item(s) could not be recovered');
    expect(result.stdout).toContain(first);
  });
});
