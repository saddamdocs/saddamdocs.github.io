/**
 * Every text shown to the user (PLAN 7, "One strings file"), so wording can change in one place.
 *
 * Talks to: nothing. Components and modules import the entries they display.
 */

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

/** Texts of the start-up screens (PLAN 4.1, 4.16, 5.10). */
export const screens = {
  welcomeTitle: 'Tamanduá',
  welcomeIntro: 'Markdown notes that live on this device and work offline.',
  startSynced: 'Start a new synced vault',
  connect: 'Connect to my vault',
  localOnly: 'Use only on this device for now',
  syncLater: 'Sync arrives in a later version. You can connect this vault then.',
  elsewhereTitle: 'Tamanduá is open in another window',
  elsewhereBody: 'Only one window can edit at a time, so nothing is ever saved twice.',
  useHere: 'Use it here',
  newerTitle: "This device's notes were saved by a newer version of Tamanduá",
  newerBody: 'Nothing was changed. Reload to fetch the current version.',
  reload: 'Reload',
  unavailableTitle: 'Tamanduá cannot open its storage',
  unavailableBody:
    "The browser refused access to this site's storage. Check that site data is allowed for this site in Brave's settings, then reload.",
  loading: 'Opening your notes…',
} as const;

/** Texts of the sidebar, the tree and the Trash (PLAN 4.1, 4.3). */
export const sidebar = {
  newNote: 'New note',
  newFolder: 'New folder',
  newSubfolder: 'New folder inside',
  search: 'Search all notes (coming in M7)',
  calendar: 'Calendar (coming in M9)',
  trash: 'Trash',
  settings: 'Settings (coming in M8)',
  vaultName: 'Notes',
  emptyVault: 'No notes yet. Create one with the first button above.',
  resize: 'Resize the sidebar',
  tree: 'Notes and folders',
  openInNewTab: 'Open in new tab',
  rename: 'Rename',
  duplicate: 'Duplicate',
  copyPath: 'Copy path',
  delete: 'Delete',
  pathCopied: 'Path copied',
  sameName: 'Another item here has the same name, apart from letter case',
  trashTitle: 'Trash',
  trashEmpty: 'The Trash is empty.',
  backToNotes: 'Back to notes',
  restore: 'Restore',
  deleteForever: 'Delete forever',
  emptyTrash: 'Empty Trash',
  deletedOn: (date: string, device: string) => `Deleted ${date} on ${device}`,
  items: (n: number) => (n === 1 ? '1 item inside' : `${String(n)} items inside`),
  trashKeeps: (days: number) => `Items are deleted forever after ${String(days)} days.`,
} as const;

/** Texts of notices, confirmations and errors (PLAN 4.1, 4.3). */
export const notices = {
  undo: 'Undo',
  movedToTrash: (name: string) => `“${name}” moved to the Trash`,
  moved: (name: string) => `“${name}” moved`,
  restored: (name: string) => `“${name}” restored`,
  deletedForever: (n: number) =>
    n === 1 ? 'Deleted forever' : `${String(n)} items deleted forever`,
  confirmDeleteForever: (name: string) => `Delete “${name}” forever? This cannot be undone.`,
  confirmEmptyTrash: 'Delete everything in the Trash forever? This cannot be undone.',
  cancel: 'Cancel',
  operationFailed: 'That did not work: ',
  saveFailed: 'This note could not be saved. Tamanduá keeps your text and tries again.',
  retry: 'Retry',
} as const;

/** Why a name or an operation was refused (PLAN 4.3). */
export const problems = {
  empty: 'A name cannot be empty.',
  'too-long': 'Names can have at most 200 characters.',
  'forbidden-character': 'Names cannot contain < > : " / \\ | ? *',
  'control-character': 'Names cannot contain control characters.',
  'trailing-dot-or-space': 'Names cannot end with a dot or a space.',
  reserved: 'Windows reserves this name (CON, PRN, AUX, NUL, COM1–9, LPT1–9).',
  'dot-name': 'Names cannot start with a dot.',
  'sibling-clash': 'Another item here already has this name.',
  'not-found': 'That item no longer exists.',
  'not-a-folder': 'Items can only go into a folder.',
  'into-itself': 'A folder cannot go inside itself.',
  'not-a-note': 'Only notes can be duplicated.',
} as const;

/** Texts of the status bar and the tab bar (PLAN 4.1). */
export const status = {
  saving: 'Saving',
  saved: 'Saved',
  notSaved: 'Not saved',
  words: (n: number) => (n === 1 ? '1 word' : `${String(n)} words`),
  closeTab: 'Close',
  noNote: 'No note open',
  emptyPane: 'Open a note from the sidebar, or create one with New note.',
  openFailed: 'Could not open the note: ',
} as const;
