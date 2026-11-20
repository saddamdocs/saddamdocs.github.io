/**
 * Loads and saves this device's workspace (PLAN 4.6: restored on launch). Saves are coalesced, so
 * a burst of cursor moves becomes one write.
 *
 * The workspace is a convenience, not user data: a save uses the browser's default durability,
 * and a failed save is logged but never shown as an error.
 *
 * Talks to: the `workspace` store, `store/log.ts`, `config.ts`.
 */

import { WORKSPACE_SAVE_DELAY_MS } from '../config.ts';
import type { VaultDb } from '../store/db.ts';
import { logEvent } from '../store/log.ts';
import { parseWorkspace, type Workspace } from './model.ts';

/**
 * Reads the stored workspace.
 *
 * @param db - The open database.
 * @returns The workspace, or an empty one.
 */
export async function loadWorkspace(db: VaultDb): Promise<Workspace> {
  return parseWorkspace((await db.get('workspace', 'current'))?.value);
}

/** Saves the workspace a short while after the last change. */
export class WorkspaceSaver {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Workspace | null = null;
  /** Time the scheduled save is due, in ms. */
  private due = 0;

  /**
   * @param db - The open database.
   */
  constructor(private readonly db: VaultDb) {}

  /**
   * Schedules a save of this workspace, replacing any save not yet written. A sooner deadline
   * already set is kept.
   *
   * @param ws - The workspace to save.
   * @param delay - Milliseconds to wait; `WORKSPACE_SAVE_DELAY_MS` by default.
   */
  schedule(ws: Workspace, delay: number = WORKSPACE_SAVE_DELAY_MS): void {
    this.pending = ws;
    const due = Date.now() + delay;
    if (this.timer !== undefined && this.due <= due) return;
    clearTimeout(this.timer);
    this.due = due;
    this.timer = setTimeout(() => void this.flush(), delay);
  }

  /**
   * Writes the pending workspace now, for example when the page is hidden.
   *
   * @returns Resolves when written, or when there was nothing to write.
   */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const ws = this.pending;
    this.pending = null;
    if (ws === null) return;
    try {
      await this.db.put('workspace', { name: 'current', value: ws });
    } catch (error) {
      await logEvent(
        this.db,
        'warn',
        'workspace-save-failed',
        error instanceof Error ? error.name : '',
      );
    }
  }
}
