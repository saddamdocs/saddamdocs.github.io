/**
 * The export reminder (PLAN 4.15): when the vault changed since the last export, and that export
 * is older than "Remind me to export after" (7 days by default), a banner offers "Export now" and
 * "Later", which waits a day. A vault that was never exported counts as overdue once it holds ten
 * notes.
 *
 * Talks to: nothing. Pure; the session supplies the facts.
 */

/** Milliseconds in a day. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Ten notes make a never-exported vault overdue (PLAN 4.15). */
export const NEVER_EXPORTED_NOTES = 10;

/** What the reminder needs to know. */
export interface ReminderFacts {
  readonly now: number;
  /** Device time of the last export of the whole vault from this device, or null. */
  readonly lastExport: number | null;
  /** "Later" was pressed: no reminder before this time. */
  readonly snoozedUntil: number | null;
  /** Device time of the latest change to any item. */
  readonly lastChange: number;
  /** Live notes in the vault. */
  readonly noteCount: number;
  /** The setting, in days; 0 means never remind. */
  readonly days: number;
}

/**
 * Tells whether the reminder banner shows.
 *
 * @param facts - The current facts.
 * @returns True when the banner shows.
 */
export function reminderDue(facts: ReminderFacts): boolean {
  if (facts.days <= 0) return false;
  if (facts.snoozedUntil !== null && facts.now < facts.snoozedUntil) return false;
  if (facts.lastExport === null) return facts.noteCount >= NEVER_EXPORTED_NOTES;
  return facts.lastChange > facts.lastExport && facts.now - facts.lastExport >= facts.days * DAY_MS;
}
