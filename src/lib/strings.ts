/**
 * Every text shown to the user (PLAN 7, "One strings file"), so wording can change in one place.
 *
 * Talks to: nothing. Components and modules import the entries they display.
 */

/** Texts of the M0 skeleton screen. */
export const skeleton = {
  tagline: 'Offline-first Markdown notes. This is the M0 skeleton: nothing to edit yet.',
  online: 'Online',
  offline: 'Offline: the app still opens from this device.',
  version: 'Version',
  channel: 'Channel',
  commit: 'Commit',
  built: 'Built',
  probeLink: 'Open the shortcut and database probe',
} as const;

/** Texts about updates and offline readiness (PLAN 4.16). */
export const updates = {
  ready: 'A new version is ready',
  reload: 'Reload',
  offlineReady: 'Tamanduá is ready to work offline',
  registerFailed: 'Offline support could not start: ',
} as const;

/** Texts of the spike B and D probe page (PLAN 7, M0). */
export const probe = {
  title: 'Shortcut and database probe',
  intro:
    'Press each shortcut below once, in a Brave tab and again in the installed window. A cell turns gold when the key press reaches the page. If Brave also did something of its own (opened a menu, a dialog, a new tab), tick the last box.',
  mode: 'Display mode',
  shortcut: 'Shortcut',
  action: 'Action',
  reached: 'Reached the page',
  fallback: 'Fallback',
  browserActed: 'Brave also acted',
  copy: 'Copy results',
  copied: 'Copied',
  reset: 'Clear',
  lastKey: 'Last key press',
  dbTitle: 'Database probe (spike D)',
  dbIntro:
    'Sends one read-only GET to the test database, which is still locked. Expected answer: 401 (permission denied), which proves that Brave and the content security policy let the request through.',
  dbButton: 'Send the probe request',
  dbRunning: 'Waiting for an answer…',
  dbPass: 'PASS: the database answered 401, as expected for a locked database.',
  dbOther: 'UNEXPECTED: the database answered with status ',
  dbNetwork: 'FAIL: the request did not reach the database (network error or blocked). ',
  dbCsp: 'FAIL: the content security policy blocked the request. ',
  back: 'Back',
} as const;
