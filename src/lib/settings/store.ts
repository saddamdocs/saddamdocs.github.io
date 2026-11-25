/**
 * The settings store: reads the settings item, hands out the current settings, and saves changes
 * through the vault, so settings are an ordinary item that syncs from M3a (PLAN 4.9, 5.4).
 *
 * Talks to: `vault/operations.ts` (`readText`, `saveText`, `ensureSettingsItem`) and
 * `settings/schema.ts`.
 */

import { SETTINGS_ID } from '../store/schema.ts';
import type { Vault } from '../vault/operations.ts';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
  type Settings,
  type StoredSettings,
} from './schema.ts';

/** The synced settings of this vault. */
export class SettingsStore {
  private stored: StoredSettings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  private constructor(
    private readonly vault: Vault,
    stored: StoredSettings,
  ) {
    this.stored = stored;
  }

  /**
   * Loads the settings, creating the settings item with the defaults if it is missing.
   *
   * @param vault - The loaded vault.
   * @returns The store.
   */
  static async load(vault: Vault): Promise<SettingsStore> {
    await vault.ensureSettingsItem(
      serializeSettings({ settings: { ...DEFAULT_SETTINGS }, extra: {} }),
    );
    const store = new SettingsStore(vault, parseSettings(await vault.readText(SETTINGS_ID)));
    // Settings travel between devices (PLAN 4.9): a remote change applies at once.
    vault.subscribe((change) => {
      if (change.origin === 'remote' && change.ids.includes(SETTINGS_ID)) void store.reload();
    });
    return store;
  }

  /** Reads the settings item again after another device changed it. */
  private async reload(): Promise<void> {
    this.stored = parseSettings(await this.vault.readText(SETTINGS_ID));
    for (const listener of this.listeners) listener(this.stored.settings);
  }

  /** The current settings. */
  get current(): Settings {
    return this.stored.settings;
  }

  /**
   * Calls a function whenever the settings change.
   *
   * @param listener - Receives the new settings.
   * @returns A function that stops the calls.
   */
  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Changes some settings and saves them. Values are checked like stored ones: an invalid value
   * reads as its default.
   *
   * @param patch - The settings to change.
   * @returns Resolves when saved.
   * @throws When the save fails; the caller reports it.
   */
  async update(patch: Partial<Settings>): Promise<void> {
    const next = parseSettings(
      serializeSettings({
        settings: { ...this.stored.settings, ...patch },
        extra: this.stored.extra,
      }),
    );
    this.stored = next;
    await this.vault.saveText(SETTINGS_ID, serializeSettings(next));
    for (const listener of this.listeners) listener(next.settings);
  }
}
