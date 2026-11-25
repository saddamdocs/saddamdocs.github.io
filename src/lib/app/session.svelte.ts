/**
 * The running app's state and the actions the interface offers, in one place: the vault index, the
 * workspace, the settings, the focused note's save state, the confirmation dialog,
 * and which sidebar view shows.
 *
 * Components read the `$state` fields and call the methods; they never write to the vault or the
 * workspace themselves. Each action reports a refusal or a failure to the user through the
 * snackbar (PLAN 10: no swallowed errors).
 *
 * Talks to: `vault/operations.ts`, `settings/store.ts`, `workspace/model.ts` and
 * `workspace/store.ts`, `autosave/controller.ts`, `strings.ts`, `config.ts`.
 */

import type { NoteSaver, SaveRegistry } from '../autosave/controller.ts';
import type { PersistState } from '../store/persist.ts';
import { readNumber, writeState } from '../store/state.ts';
import { DAY_MS, reminderDue } from '../transfer/reminder.ts';
import { dateStamp, downloadBlob } from '../transfer/download.ts';
import { planExport, readExport } from '../transfer/exportZip.ts';
import { planImport, type ImportReport, type SourceFile } from '../transfer/importFiles.ts';
import { zip, unzip } from '../transfer/zip.ts';
import { exportName } from '../vault/names.ts';
import type { EditorView } from '@codemirror/view';
import { applyRemoteText } from '../editor/setup.ts';
import type { ChipState, SyncDetails, SyncEngine } from '../sync/engine.ts';
import { countWords } from '../editor/words.ts';
import { CLEAN, type SaveState } from '../autosave/machine.ts';
import { WORKSPACE_PROMPT_SAVE_MS, WORKSPACE_SAVE_DELAY_MS } from '../config.ts';
import { DEFAULT_SETTINGS, type Settings } from '../settings/schema.ts';
import type { SettingsStore } from '../settings/store.ts';
import { logEvent } from '../store/log.ts';
import {
  history as historyText,
  notices as noticeText,
  transfer as transferText,
  problems,
  sidebar as sidebarText,
} from '../strings.ts';
import type { OpProblem, OpResult, Vault } from '../vault/operations.ts';
import { VaultIndex } from '../vault/tree.ts';
import {
  closeMissing,
  closeTab,
  emptyWorkspace,
  openNote,
  rememberPosition,
  setExpanded,
  type Workspace,
} from '../workspace/model.ts';
import type { WorkspaceSaver } from '../workspace/store.ts';
import type { Notices, Snack } from './notices.svelte.ts';

/** How notices write a time. */
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** The sections of the Settings dialog. M8 adds Appearance and the rest; M3c completes Sync. */
export type SettingsSection = 'files' | 'data' | 'sync';

/** A question that needs a yes before a destructive action (PLAN 4.3). */
export interface Confirmation {
  readonly text: string;
  readonly confirmLabel: string;
  readonly run: () => void;
}

/** The running app. */
export class Session {
  /** The vault's index; replaced after every change. */
  index: VaultIndex = $state.raw(new VaultIndex([]));
  /** This device's workspace. */
  workspace: Workspace = $state.raw(emptyWorkspace());
  /** The synced settings. */
  settings: Settings = $state.raw({ ...DEFAULT_SETTINGS });
  /** Save state of the note in the focused pane. */
  saveState: SaveState = $state.raw(CLEAN);
  /** Whether the browser keeps this site's storage (PLAN 4.16); shown in Settings. */
  persistState: PersistState = $state('not-yet');
  /** The saver of the note in the focused pane, for Retry on the failure banner. */
  focusedSaver: NoteSaver | null = null;
  /** The editor of the focused note, for restoring a snapshot as an undoable edit. */
  focusedEditor: { itemId: string; view: EditorView } | null = null;
  /**
   * Raised for a note whose stored text changed outside its editor (image links rewritten by a
   * move, PLAN 4.3); the shell keys the editor on it, so the editor reloads the text.
   */
  textEpoch: Record<string, number> = $state({});
  /** The tab whose History view is open, or null (PLAN 4.3). */
  historyTab: string | null = $state(null);
  /** The section of the Settings dialog that is open, or null when it is closed. */
  settingsSection: SettingsSection | null = $state(null);
  /** The last export of the whole vault from this device, in ms, or null (PLAN 4.15). */
  lastExport: number | null = $state(null);
  /** The export reminder banner shows (PLAN 4.15). */
  reminder = $state(false);
  /** The summary of the last import, shown in a dialog, or null (PLAN 4.15). */
  importResult: { report: ImportReport; created: string[]; undone: boolean } | null = $state(null);
  /** An export or import is running. */
  transferBusy = $state(false);
  /** Folder a new import lands in, chosen in Settings → Data or by "Import here". */
  importTarget = $state('');
  private snoozedUntil: number | null = null;
  /** The sync engine, when sync is on (PLAN 4.5). */
  sync: SyncEngine | null = null;
  /** The sync key of this device, for Settings → Sync; null when sync is off. */
  syncKey: string | null = $state(null);
  /** The sync chip (PLAN 4.5). */
  chip: ChipState = $state.raw({ kind: 'off' });
  /** The chip's details. */
  syncDetails: SyncDetails | null = $state.raw(null);
  /** Word count of the note in the focused pane (PLAN 4.1, status bar). */
  wordCount: number = $state(0);
  confirmation: Confirmation | null = $state(null);
  /** What the sidebar shows below its buttons. */
  sidebarView: 'tree' | 'trash' = $state('tree');
  /** The item whose name is being edited in the tree, or null. */
  renaming: string | null = $state(null);

  /**
   * @param vault - The loaded vault.
   * @param settingsStore - The loaded settings.
   * @param wsSaver - Saves the workspace.
   * @param saves - The savers of the open notes.
   * @param workspace - The workspace restored from storage.
   * @param notices - The snackbar.
   */
  constructor(
    readonly vault: Vault,
    readonly settingsStore: SettingsStore,
    private readonly wsSaver: WorkspaceSaver,
    readonly saves: SaveRegistry,
    workspace: Workspace,
    readonly notices: Notices,
  ) {
    this.index = vault.index;
    this.settings = settingsStore.current;
    // PLAN 4.6: a tab whose note no longer exists is skipped silently on start-up.
    this.workspace = closeMissing(
      workspace,
      (id) => vault.index.isLive(id),
      (id) => exists(vault.index, id),
    ).workspace;
    vault.subscribe(() => {
      this.index = vault.index;
      this.updateReminder();
      const { workspace: next, closed } = closeMissing(
        this.workspace,
        (id) => this.index.isLive(id),
        (id) => exists(this.index, id),
      );
      if (
        closed.length > 0 ||
        next.expanded.length !== this.workspace.expanded.length ||
        next.selected !== this.workspace.selected
      ) {
        this.setWorkspace(next);
      }
    });
    settingsStore.subscribe((s) => (this.settings = s));
  }

  /**
   * Replaces the workspace and schedules its save.
   *
   * @param ws - The new workspace.
   */
  setWorkspace(ws: Workspace): void {
    this.workspace = ws;
    // Tabs and folders change rarely and matter on the next start: write them almost at once.
    this.wsSaver.schedule(ws, WORKSPACE_PROMPT_SAVE_MS);
  }

  /**
   * Writes the workspace now, for example when the page is hidden or closed.
   *
   * @returns Resolves when written.
   */
  flushWorkspace(): Promise<void> {
    return this.wsSaver.flush();
  }

  /**
   * Shows a notice in the snackbar.
   *
   * @param text - The notice.
   * @param action - An optional button, such as Undo, offered for the Undo time.
   */
  notify(text: string, action?: Snack['action']): void {
    this.notices.notify(text, action);
  }

  /** Shows why an operation was refused. */
  private refuse(problem: OpProblem): void {
    this.notify(problems[problem]);
  }

  /** Reports an unexpected failure to the user and the log (PLAN 10). */
  private fail(code: string, error: unknown): void {
    const name = error instanceof Error ? error.name : 'Error';
    void logEvent(this.vault.db, 'error', code, name);
    this.notify(
      noticeText.operationFailed + (error instanceof Error ? error.message : String(error)),
    );
  }

  /** Runs an operation, turning a refusal or a failure into a notice. */
  private async attempt<T>(code: string, op: () => Promise<OpResult<T>>): Promise<T | null> {
    try {
      const result = await op();
      if (!result.ok) {
        this.refuse(result.problem);
        return null;
      }
      return result.value;
    } catch (error) {
      this.fail(code, error);
      return null;
    }
  }

  /** The folder new items go into: the selected folder, the selected note's folder, or the root. */
  private targetFolder(): string {
    const selected =
      this.workspace.selected === null ? undefined : this.index.get(this.workspace.selected);
    if (selected === undefined || !this.index.isLive(selected.id)) return '';
    return selected.kind === 'folder' ? selected.id : this.index.parentOf(selected);
  }

  /**
   * Opens a note in the focused pane (PLAN 4.6).
   *
   * @param itemId - The note.
   * @param newTab - Open in a new tab.
   */
  open(itemId: string, newTab = false): void {
    this.setWorkspace(
      openNote(this.workspace, itemId, {
        newTab: newTab !== this.settings.alwaysOpenInNewTab,
        mode: this.settings.newTabMode,
      }),
    );
  }

  /**
   * Selects a tree row.
   *
   * @param itemId - The item, or null to clear.
   */
  select(itemId: string | null): void {
    this.setWorkspace({ ...this.workspace, selected: itemId });
  }

  /**
   * Expands or collapses a folder.
   *
   * @param folderId - The folder.
   * @param open - True to expand; toggles when omitted.
   */
  toggleFolder(folderId: string, open?: boolean): void {
    const isOpen = this.workspace.expanded.includes(folderId);
    this.setWorkspace(setExpanded(this.workspace, folderId, open ?? !isOpen));
  }

  /**
   * Creates a note in the target folder, opens it, and starts editing its name (PLAN 4.3).
   *
   * @param parent - A folder id; the selection decides when omitted.
   */
  async newNote(parent?: string): Promise<void> {
    const folder = parent ?? this.targetFolder();
    const note = await this.attempt('create-note-failed', () => this.vault.createNote(folder));
    if (note === null) return;
    let ws = folder === '' ? this.workspace : setExpanded(this.workspace, folder, true);
    ws = openNote(ws, note.id, { mode: this.settings.newTabMode });
    this.setWorkspace(ws);
    this.sidebarView = 'tree';
    this.renaming = note.id;
  }

  /**
   * Creates a folder in the target folder and starts editing its name.
   *
   * @param parent - A folder id; the selection decides when omitted.
   */
  async newFolder(parent?: string): Promise<void> {
    const target = parent ?? this.targetFolder();
    const folder = await this.attempt('create-folder-failed', () =>
      this.vault.createFolder(target),
    );
    if (folder === null) return;
    const ws = target === '' ? this.workspace : setExpanded(this.workspace, target, true);
    this.setWorkspace({ ...ws, selected: folder.id });
    this.sidebarView = 'tree';
    this.renaming = folder.id;
  }

  /**
   * Renames an item.
   *
   * @param itemId - The item.
   * @param name - The new name as typed.
   * @returns The reason it was refused, or null when renamed.
   */
  async rename(itemId: string, name: string): Promise<string | null> {
    try {
      const result = await this.vault.rename(itemId, name);
      return result.ok ? null : problems[result.problem];
    } catch (error) {
      this.fail('rename-failed', error);
      return null;
    }
  }

  /**
   * Moves an item to the Trash, closes the tabs it hid, and offers Undo for 5 s (PLAN 4.3).
   *
   * @param itemId - The item.
   */
  async delete(itemId: string): Promise<void> {
    const item = this.index.get(itemId);
    if (item === undefined) return;
    await this.flushOpenNotes();
    const before = this.workspace;
    const token = await this.attempt('delete-failed', () => this.vault.delete(itemId));
    if (token === null) return;
    this.notify(noticeText.movedToTrash(item.name), {
      label: noticeText.undo,
      run: () => {
        this.notices.dismiss();
        void this.vault.undo(token).then(
          // Undo reopens the tabs the deletion closed (PLAN 4.3, "Edge cases").
          () =>
            this.setWorkspace({
              ...this.workspace,
              panes: before.panes,
              focused: before.focused,
            }),
          (error: unknown) => this.fail('undo-failed', error),
        );
      },
    });
  }

  /**
   * Moves an item into a folder, with Undo (PLAN 4.3).
   *
   * @param itemId - The item.
   * @param parent - The target folder, or `""` for the root.
   */
  async move(itemId: string, parent: string): Promise<void> {
    const item = this.index.get(itemId);
    if (item === undefined || this.index.parentOf(item) === parent) return;
    await this.flushOpenNotes();
    const token = await this.attempt('move-failed', () => this.vault.move(itemId, parent));
    if (token === null) return;
    this.reloadTexts(token.rewritten);
    if (parent !== '') this.setWorkspace(setExpanded(this.workspace, parent, true));
    this.notify(noticeText.moved(item.name), {
      label: noticeText.undo,
      run: () => {
        this.notices.dismiss();
        void this.flushOpenNotes()
          .then(() => this.vault.undo(token))
          .then((rewritten) => this.reloadTexts(rewritten))
          .catch((error: unknown) => this.fail('undo-failed', error));
      },
    });
  }

  /**
   * Duplicates a note and selects the copy.
   *
   * @param itemId - The note.
   */
  async duplicate(itemId: string): Promise<void> {
    await this.flushOpenNotes();
    const copy = await this.attempt('duplicate-failed', () => this.vault.duplicate(itemId));
    if (copy !== null) this.select(copy.id);
  }

  /**
   * Copies an item's path to the clipboard.
   *
   * @param itemId - The item.
   */
  async copyPath(itemId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.index.path(itemId));
      this.notify(sidebarText.pathCopied);
    } catch (error) {
      this.fail('copy-path-failed', error);
    }
  }

  /**
   * Restores an item from the Trash.
   *
   * @param itemId - The item.
   */
  async restore(itemId: string): Promise<void> {
    const restored = await this.attempt('restore-failed', () => this.vault.restore(itemId));
    if (restored !== null) this.notify(noticeText.restored(restored.name));
  }

  /**
   * Deletes an item forever, after confirming when the setting asks for it (PLAN 4.3).
   *
   * @param itemId - An item in the Trash.
   */
  deleteForever(itemId: string): void {
    const item = this.index.get(itemId);
    if (item === undefined) return;
    const run = (): void => {
      this.vault.deleteForever([itemId]).then(
        (n) => this.notify(noticeText.deletedForever(n)),
        (error: unknown) => this.fail('delete-forever-failed', error),
      );
    };
    this.confirmFirst(noticeText.confirmDeleteForever(item.name), sidebarText.deleteForever, run);
  }

  /** Empties the Trash, after confirming when the setting asks for it. */
  emptyTrash(): void {
    const run = (): void => {
      this.vault.emptyTrash().then(
        (n) => this.notify(noticeText.deletedForever(n)),
        (error: unknown) => this.fail('empty-trash-failed', error),
      );
    };
    this.confirmFirst(noticeText.confirmEmptyTrash, sidebarText.emptyTrash, run);
  }

  /** Asks first when "Confirm before deleting forever" is on. */
  private confirmFirst(text: string, confirmLabel: string, run: () => void): void {
    if (!this.settings.confirmDeleteForever) {
      run();
      return;
    }
    this.confirmation = {
      text,
      confirmLabel,
      run: () => {
        this.confirmation = null;
        run();
      },
    };
  }

  /**
   * Makes open editors of these notes reload their text from storage.
   *
   * @param ids - Notes whose stored text changed outside their editor.
   */
  reloadTexts(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const next = { ...this.textEpoch };
    for (const id of ids) next[id] = (next[id] ?? 0) + 1;
    this.textEpoch = next;
  }

  /**
   * Opens the History view of a tab (PLAN 4.3).
   *
   * @param tabId - The tab.
   */
  openHistory(tabId: string): void {
    this.historyTab = tabId;
  }

  /** Closes the History view. */
  closeHistory(): void {
    this.historyTab = null;
  }

  /**
   * Restores a snapshot into the open note as one ordinary edit, so Ctrl+Z undoes it and it saves
   * (and, from M3a, syncs) like typing (PLAN 4.3). The current text is snapshotted first.
   *
   * @param itemId - The note.
   * @param text - The snapshot's text.
   * @param time - When the snapshot was taken, in ms, for the notice.
   */
  async restoreSnapshot(itemId: string, text: string, time: number): Promise<void> {
    const editor = this.focusedEditor;
    if (editor === null || editor.itemId !== itemId) return;
    try {
      await this.vault.snapshot(itemId, editor.view.state.doc.toString(), 'restore', true);
      editor.view.dispatch({
        changes: { from: 0, to: editor.view.state.doc.length, insert: text },
        userEvent: 'input.restore',
      });
      this.notify(historyText.restored(TIME_FORMAT.format(time)));
    } catch (error) {
      this.fail('restore-snapshot-failed', error);
    }
  }

  /**
   * Opens the Settings dialog.
   *
   * @param section - The section to show.
   */
  openSettings(section: SettingsSection = 'data'): void {
    this.settingsSection = section;
  }

  /**
   * Reads the export facts from storage and decides whether the reminder shows. Called at start.
   *
   * @returns Resolves when read.
   */
  async loadExportState(): Promise<void> {
    this.lastExport = await readNumber(this.vault.db, 'lastExport');
    this.snoozedUntil = await readNumber(this.vault.db, 'exportSnoozedUntil');
    this.updateReminder();
  }

  /** Recomputes the reminder from the vault and the export facts (PLAN 4.15). */
  private updateReminder(): void {
    let lastChange = 0;
    let noteCount = 0;
    for (const item of this.index.byId.values()) {
      if (item.kind === 'settings') continue;
      lastChange = Math.max(lastChange, item.updated);
      if (item.kind === 'note' && this.index.isLive(item.id)) noteCount += 1;
    }
    this.reminder = reminderDue({
      now: Date.now(),
      lastExport: this.lastExport,
      snoozedUntil: this.snoozedUntil,
      lastChange,
      noteCount,
      days: this.settings.exportReminderDays,
    });
  }

  /** "Later" on the reminder: waits a day (PLAN 4.15). */
  async snoozeReminder(): Promise<void> {
    const until = Date.now() + DAY_MS;
    try {
      // Hide only once stored: a reload right after "Later" must not bring the banner back.
      await writeState(this.vault.db, 'exportSnoozedUntil', until);
      this.snoozedUntil = until;
      this.reminder = false;
    } catch (error) {
      this.fail('snooze-failed', error);
    }
  }

  /**
   * "Download as .md" (PLAN 4.15): one note as a `.md` file, byte for byte its text.
   *
   * @param itemId - The note.
   */
  async downloadNote(itemId: string): Promise<void> {
    const item = this.index.get(itemId);
    if (item?.kind !== 'note') return;
    try {
      await this.flushOpenNotes();
      const text = (await this.vault.readText(itemId)) ?? '';
      downloadBlob(
        exportName(item.name, 'note'),
        new Blob([text], { type: 'text/markdown;charset=utf-8' }),
      );
    } catch (error) {
      this.fail('download-failed', error);
    }
  }

  /**
   * Exports the whole vault, or one folder, as a `.zip` of plain Markdown (PLAN 4.15).
   *
   * @param folderId - A folder to export, or `""` for the whole vault.
   * @param includeTrash - Put the Trash under `.trash/` (whole vault only).
   */
  async exportZip(folderId = '', includeTrash = false): Promise<void> {
    if (this.transferBusy) return;
    this.transferBusy = true;
    try {
      await this.flushOpenNotes();
      const plan = planExport(this.index, folderId, includeTrash && folderId === '');
      const { entries, missing } = await readExport(this.vault, plan);
      const archive = await zip(entries);
      const folder = folderId === '' ? undefined : this.index.get(folderId);
      const name =
        folder === undefined ? `tamandua-${dateStamp()}.zip` : `${folder.name}-${dateStamp()}.zip`;
      downloadBlob(name, new Blob([archive], { type: 'application/zip' }));
      if (folderId === '') {
        this.lastExport = Date.now();
        await writeState(this.vault.db, 'lastExport', this.lastExport);
        this.updateReminder();
      }
      this.notify(
        missing.length === 0
          ? transferText.exported(name)
          : transferText.exportedMissing(name, missing.length),
      );
    } catch (error) {
      this.fail('export-failed', error);
    } finally {
      this.transferBusy = false;
    }
  }

  /**
   * Imports picked files (PLAN 4.15): loose `.md` files and images land in the target folder; a
   * `.zip` is opened and its top level lands there; files from a folder pick keep their paths.
   *
   * @param sources - Files with their paths, from a folder pick, or plain files.
   * @param zips - Picked `.zip` files, to open.
   * @param target - The folder the import lands in, or `""` for the root.
   */
  async importSources(sources: SourceFile[], zips: readonly File[], target: string): Promise<void> {
    if (this.transferBusy) return;
    this.transferBusy = true;
    try {
      const all = [...sources];
      for (const file of zips) {
        const entries = await unzip(new Uint8Array(await file.arrayBuffer()));
        for (const [path, bytes] of Object.entries(entries)) all.push({ path, bytes });
      }
      const folder = this.index.isLive(target) ? target : '';
      const plan = planImport(all, this.index, folder);
      const ids = await this.vault.importItems(folder, plan.items);
      const created = ids.filter((_id, i) => plan.items[i]?.parent === -1);
      if (folder !== '') this.setWorkspace(setExpanded(this.workspace, folder, true));
      this.importResult = { report: plan.report, created, undone: false };
    } catch (error) {
      this.fail('import-failed', error);
    } finally {
      this.transferBusy = false;
    }
  }

  /** "Undo import": moves everything the last import created to the Trash (PLAN 4.15). */
  async undoImport(): Promise<void> {
    const result = this.importResult;
    if (result === null || result.undone) return;
    try {
      await this.vault.deleteMany(result.created);
      this.importResult = { ...result, undone: true };
    } catch (error) {
      this.fail('undo-import-failed', error);
    }
  }

  /**
   * Connects a running sync engine to the interface.
   *
   * @param engine - The engine, started or about to start.
   * @param key - The sync key, for Settings → Sync.
   */
  attachSync(engine: SyncEngine, key: string): void {
    this.sync = engine;
    this.syncKey = key;
    const update = (): void => {
      this.chip = engine.chip;
      this.syncDetails = engine.details;
    };
    engine.subscribe(update);
    update();
  }

  /**
   * Whether a note is open in an editor now (PLAN 5.8: a change to it is caught up within 250 ms).
   *
   * @param itemId - The note.
   * @returns True when its editor is mounted.
   */
  isOpenInEditor(itemId: string): boolean {
    return this.focusedEditor?.itemId === itemId;
  }

  /**
   * Puts another device's text into an open note, in place (PLAN 4.5, 6.3): the cursor, the scroll
   * position and the undo history survive, and Ctrl+Z does not undo it.
   *
   * @param itemId - The note.
   * @param text - The remote text, which the engine stores right after.
   * @returns False when the editor holds edits not saved yet; the engine then leaves the note.
   */
  applyRemoteText(itemId: string, text: string): boolean {
    const editor = this.focusedEditor;
    if (editor === null || editor.itemId !== itemId) return true;
    const saver = this.focusedSaver;
    if (saver !== null && saver.current.status !== 'clean') return false;
    applyRemoteText(editor.view, text);
    saver?.remoteApplied();
    this.wordCount = countWords(text);
    return true;
  }

  /** Ctrl+S, blur, hiding: save every open note, then upload at once (PLAN 4.4, 5.8). */
  async saveAndSync(): Promise<void> {
    await this.saves.flushAll();
    this.sync?.uploadNow();
  }

  /**
   * Closes a tab after saving its note.
   *
   * @param tabId - The tab.
   */
  async closeTab(tabId: string): Promise<void> {
    await this.flushOpenNotes();
    this.setWorkspace(closeTab(this.workspace, tabId));
  }

  /**
   * Remembers a tab's cursor and scroll.
   *
   * @param tabId - The tab.
   * @param cursor - Character offset.
   * @param scroll - Scroll position in px.
   */
  rememberPosition(tabId: string, cursor: number, scroll: number): void {
    // Cursor moves come in bursts; they wait for the longer delay.
    this.workspace = rememberPosition(this.workspace, tabId, cursor, scroll);
    this.wsSaver.schedule(this.workspace, WORKSPACE_SAVE_DELAY_MS);
  }

  /** Saves every open note before an operation that changes what is open. */
  private async flushOpenNotes(): Promise<void> {
    await this.saves.flushAll();
  }
}

/** True when an item is known and not deleted forever, in the Trash or not. */
function exists(index: VaultIndex, id: string): boolean {
  const item = index.get(id);
  return item !== undefined && !item.gone;
}
