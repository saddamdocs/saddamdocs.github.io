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
