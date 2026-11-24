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
  settings: 'Settings',
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
  exportNow: 'Export now',
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

/** Texts of files in the vault (PLAN 4.3). */
export const files = {
  notOnDevice: "This device does not have this file's contents.",
  size: (bytes: number) =>
    bytes < 1024
      ? `${String(bytes)} bytes`
      : bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / 1024 / 1024).toFixed(1)} MB`,
} as const;

/** Texts of the History view (PLAN 4.3, "Local snapshots"). */
export const history = {
  menu: 'History',
  title: 'History on this device',
  close: 'Close',
  empty:
    'No snapshots yet. One is kept when a note was edited and then left alone for 5 minutes, and when its tab closes.',
  restore: 'Restore this version',
  restored: (when: string) => `Restored the version of ${when}. Ctrl+Z undoes it.`,
  reasons: {
    idle: 'after editing',
    close: 'tab closed',
    remote: 'before a change from another device',
    merge: 'before a merge',
    restore: 'before a restore',
  },
} as const;

/** Texts of export, import and the reminder (PLAN 4.15). */
export const transfer = {
  exported: (name: string) => `Exported ${name}`,
  exportedMissing: (name: string, n: number) =>
    `Exported ${name}. ${String(n)} image(s) were left out: this device does not have their contents.`,
  downloadMd: 'Download as .md',
  exportFolder: 'Export folder',
  importHere: 'Import here',
  reminder: (days: number | null) =>
    days === null
      ? 'Your notes have never been exported. An export is a plain copy that needs neither Tamanduá nor a passphrase.'
      : `Your notes were last exported ${String(days)} days ago, and they have changed since.`,
  later: 'Later',
  summaryTitle: 'Import finished',
  summaryCounts: (notes: number, files: number, folders: number) =>
    `${String(notes)} notes, ${String(files)} images and ${String(folders)} folders imported.`,
  renamedTitle: 'Renamed',
  skippedTitle: 'Skipped',
  reasons: {
    hidden: 'starts with a dot',
    'not-utf8': 'not UTF-8 text',
    'too-large': 'larger than 7 MB',
    unsupported: 'not a Markdown note or a supported image',
  },
  undoImport: 'Undo import',
  undone: 'Everything this import created is in the Trash.',
  close: 'Close',
} as const;

/** Texts of the Settings dialog (PLAN 4.13, 4.15). M8 adds the other sections. */
export const settingsText = {
  title: 'Settings',
  close: 'Close',
  sections: { files: 'Files', data: 'Data' },
  showAllFiles: 'Show all files in the tree',
  showAllFilesHint: 'Images in the vault appear in the tree and open in a viewer.',
  exportTitle: 'Export',
  exportWarning:
    'An export is not encrypted: anyone who gets the archive can read your notes. It is also the one backup that needs neither the passphrase nor the database.',
  includeTrash: 'Include the Trash (under .trash/)',
  exportVault: 'Export vault',
  lastExport: (when: string | null) =>
    when === null ? 'Never exported from this device.' : `Last exported from this device: ${when}.`,
  importTitle: 'Import Markdown',
  importHint:
    'Folders keep their structure. .md and .markdown files become notes; PNG, JPEG, GIF, WebP and SVG images up to 7 MB become files. Nothing that exists is changed.',
  importTarget: 'Import into',
  topLevel: '(top level)',
  chooseFiles: 'Choose files or a .zip…',
  chooseFolder: 'Choose a folder…',
  busy: 'Working…',
} as const;
