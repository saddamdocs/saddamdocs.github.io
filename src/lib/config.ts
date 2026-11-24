/**
 * Every tunable value of the app, each with its unit, its sensible range and what changes when it
 * moves (PLAN 10, "Comments and maintainability"). No other module may hold an unexplained number.
 *
 * Talks to: nothing. Imported by any module that needs a delay, a limit or a version number, and by
 * `scripts/release-notes.ts`, which prints the schema version into the release notes (PLAN 9).
 * Keep this file free of imports so Node.js can load it directly.
 */

/**
 * Version of the IndexedDB schema (PLAN 5.3). Raise it only together with a tested migration.
 * An app that meets a higher number refuses to touch the data (PLAN 4.16), and an older release is
 * safe to put back only while this number is unchanged (PLAN 9). M0 has no database yet; the first
 * schema lands in M1 as version 1.
 */
export const SCHEMA_VERSION = 1;

/**
 * How often a running app asks the server for a new version of itself, in milliseconds
 * (PLAN 4.16: "when the app starts and every hour"). Lower values find updates sooner but cost a
 * request each time; anything under a few minutes is wasteful. Range: 15 minutes to 24 hours.
 */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How long the snackbar stays on screen when it has no action, in milliseconds. Notices with an
 * action (such as "Reload") stay until the user acts. Range: 3 to 10 seconds.
 */
export const SNACKBAR_TIMEOUT_MS = 5000;

/**
 * Timeout for a small request to the database, in milliseconds (PLAN 5.8: "small requests are
 * aborted after 20 s"). Lower values give up sooner on slow networks.
 */
export const SMALL_REQUEST_TIMEOUT_MS = 20_000;

/**
 * Length of a sync key in characters (PLAN 4.5). The database rules require at least 32
 * (Appendix B), so never lower it.
 */
export const SYNC_KEY_LENGTH = 32;

/**
 * Delay before a burst of workspace changes (cursor moves, folder toggles) is written, in ms. The
 * workspace is a convenience; a longer delay means fewer writes and, after a crash, a cursor
 * position slightly out of date. Range: 200 ms to 5 s.
 */
export const WORKSPACE_SAVE_DELAY_MS = 1000;

/**
 * Delay before a structural workspace change (a tab opened or closed, a folder expanded) is
 * written, in ms. Short, because a write started while the page unloads may never commit, and an
 * open tab should survive an immediate reload (PLAN 4.6). Range: 0 to 200 ms.
 */
export const WORKSPACE_PROMPT_SAVE_MS = 50;

/**
 * Save delay after the last keystroke, in ms (PLAN 4.4: 300 ms). Lower values write more often;
 * higher values widen the window an abrupt close could lose. Must stay well under 1 s (PLAN R4).
 */
export const SAVE_DEBOUNCE_MS = 300;

/**
 * Longest time an edit may wait during continuous typing, in ms (PLAN 4.4: 2 s after the first
 * unsaved keystroke).
 */
export const SAVE_MAX_DELAY_MS = 2000;

/**
 * How long the snackbar offers Undo after a deletion or a move, in ms (PLAN 4.3: 5 s).
 */
export const UNDO_TIMEOUT_MS = 5000;

/**
 * How long a page that asked the holder of the one-window lock to step aside waits before taking
 * the lock anyway, in ms (PLAN 5.10: 2 s). Shorter risks taking over before the other window has
 * saved; longer makes "Use it here" feel slow.
 */
export const LOCK_YIELD_TIMEOUT_MS = 2000;

/**
 * How often an open app checks for Trash items past their time, in ms (PLAN 6.3: once a day while
 * the app stays open, besides at start).
 */
export const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Snapshots kept per note on this device (PLAN 4.3: 20). More gives a longer history and uses more
 * of the browser's storage.
 */
export const SNAPSHOT_LIMIT = 20;

/**
 * A note edited and then left alone this long gets a snapshot, in ms (PLAN 4.3: 5 minutes).
 */
export const SNAPSHOT_IDLE_MS = 5 * 60 * 1000;

/**
 * Least time between two snapshots of one note, in ms (PLAN 4.3: 10 minutes). Only a merge
 * (PLAN 6.3) may snapshot sooner.
 */
export const SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Largest file the vault takes, in bytes (PLAN 4.2, 4.15, 5.5: 7,000,000, the sync limit).
 */
export const MAX_FILE_BYTES = 7_000_000;
