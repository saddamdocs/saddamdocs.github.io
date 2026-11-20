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

import type { SaveRegistry } from '../autosave/controller.ts';
import { CLEAN, type SaveState } from '../autosave/machine.ts';
import { WORKSPACE_PROMPT_SAVE_MS, WORKSPACE_SAVE_DELAY_MS } from '../config.ts';
import { DEFAULT_SETTINGS, type Settings } from '../settings/schema.ts';
import type { SettingsStore } from '../settings/store.ts';
import { logEvent } from '../store/log.ts';
import { notices as noticeText, problems, sidebar as sidebarText } from '../strings.ts';
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
    const token = await this.attempt('move-failed', () => this.vault.move(itemId, parent));
    if (token === null) return;
    if (parent !== '') this.setWorkspace(setExpanded(this.workspace, parent, true));
    this.notify(noticeText.moved(item.name), {
      label: noticeText.undo,
      run: () => {
        this.notices.dismiss();
        void this.vault.undo(token).catch((error: unknown) => this.fail('undo-failed', error));
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
