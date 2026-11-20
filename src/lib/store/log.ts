/**
 * The diagnostic log (PLAN 5.3 `log` store, 5.9 rule 7): the last 500 entries, with ids, codes and
 * error names only. Never note text, names, sync keys or passphrases.
 *
 * Talks to: the `log` store, and the console.
 */

import type { VaultDb } from './db.ts';
import type { LogRecord } from './schema.ts';

/** How many entries the log keeps (PLAN 5.3). */
const LOG_LIMIT = 500;

/**
 * Adds an entry to the log and mirrors it to the console. Logging never throws: a log that cannot
 * be written must not break the action that is being logged.
 *
 * @param db - The open database, or null before it is open (console only).
 * @param level - Severity.
 * @param code - A short code such as `save-failed`.
 * @param detail - Ids, counts and error names only.
 * @returns Resolves when written, or when writing failed and was reported on the console.
 */
export async function logEvent(
  db: VaultDb | null,
  level: LogRecord['level'],
  code: string,
  detail = '',
): Promise<void> {
  const entry: LogRecord = { time: Date.now(), level, code, detail };
  const line = `Tamanduá ${code}${detail === '' ? '' : `: ${detail}`}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
  if (db === null) return;
  try {
    const tx = db.transaction('log', 'readwrite');
    await tx.store.add(entry);
    const count = await tx.store.count();
    if (count > LOG_LIMIT) {
      let cursor = await tx.store.openCursor();
      for (let extra = count - LOG_LIMIT; cursor !== null && extra > 0; extra -= 1) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
    }
    await tx.done;
  } catch (error) {
    console.error('Tamanduá log-write-failed', error instanceof Error ? error.name : error);
  }
}
