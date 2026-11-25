<!--
  @component
  The Settings dialog (PLAN 4.13, 4.15). M2 builds its frame and two sections: Files ("Show all
  files") and Data (export of the vault, with the warning that it is not encrypted and the date of
  the last export; import of Markdown from files, a `.zip` or a folder). M8 adds Appearance and the
  other settings, M3c Sync, M11 About.

  Talks to: `app/session.svelte.ts`, `transfer/importFiles.ts` for folder picks, `strings.ts`.
-->
<script lang="ts">
  import type { Session, SettingsSection } from '../app/session.svelte.ts';
  import { readFolderPick, type SourceFile } from '../transfer/importFiles.ts';
  import { settingsText as t, syncText as st } from '../strings.ts';
  import { startSyncedVault } from '../app/boot.ts';
  import { formatSyncKey } from '../sync/keys.ts';
  import { RestFailure } from '../sync/rest.ts';
  import KeyReveal from './KeyReveal.svelte';
  import SyncForm from './SyncForm.svelte';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();
  let dialog: HTMLDialogElement | undefined = $state();
  let includeTrash = $state(false);
  let filesInput: HTMLInputElement | undefined = $state();
  let folderInput: HTMLInputElement | undefined = $state();

  const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const sections: SettingsSection[] = ['files', 'data', 'sync'];

  $effect(() => {
    if (dialog === undefined) return;
    if (session.settingsSection !== null && !dialog.open) dialog.showModal();
    if (session.settingsSection === null && dialog.open) dialog.close();
  });

  /** Every live folder, by path, for the import target. */
  let folders = $derived(
    [...session.index.byId.values()]
      .filter((i) => i.kind === 'folder' && session.index.isLive(i.id))
      .map((i) => ({ id: i.id, path: session.index.path(i.id) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  );

  let showKey = $state(false);
  let newKey: string | null = $state(null);

  /** "Start a new synced vault" from Settings: the notes already here upload (PLAN 4.5). */
  async function startHere(values: {
    passphrase: string;
    deviceName: string;
  }): Promise<string | null> {
    try {
      const { key } = await startSyncedVault(session.vault.db, session.notices, values, session);
      newKey = key;
      return null;
    } catch (error) {
      if (error instanceof RestFailure) return st.unreachable + error.message;
      return error instanceof Error ? error.message : String(error);
    }
  }

  async function pickedFiles(list: FileList | null): Promise<void> {
    if (list === null || list.length === 0) return;
    const files = [...list];
    const zips = files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
    const loose: SourceFile[] = [];
    for (const f of files) {
      if (!zips.includes(f))
        loose.push({ path: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    }
    await session.importSources(loose, zips, session.importTarget);
    if (filesInput !== undefined) filesInput.value = '';
  }

  async function pickedFolder(list: FileList | null): Promise<void> {
    if (list === null || list.length === 0) return;
    await session.importSources(await readFolderPick(list), [], session.importTarget);
    if (folderInput !== undefined) folderInput.value = '';
  }
</script>

<dialog
  bind:this={dialog}
  onclose={() => (session.settingsSection = null)}
  aria-label={t.title}
  data-testid="settings-dialog"
>
  {#if session.settingsSection}
    <div class="layout">
      <nav>
        <h2>{t.title}</h2>
        {#each sections as section (section)}
          <button
            type="button"
            class="tab"
            class:active={session.settingsSection === section}
            onclick={() => (session.settingsSection = section)}
          >
            {t.sections[section]}
          </button>
        {/each}
      </nav>
      <section>
        {#if session.settingsSection === 'sync'}
          {#if newKey !== null}
            <KeyReveal syncKey={newKey} onDone={() => (newKey = null)} />
          {:else if session.syncKey === null}
            <p>{st.settingsLocal}</p>
            <SyncForm mode="start" onSubmit={startHere} />
            <p class="muted">{st.settingsConnectLater}</p>
          {:else}
            <h3>{st.syncKey}</h3>
            <code class="key" data-testid="settings-key">
              {showKey ? formatSyncKey(session.syncKey) : '•••• •••• •••• •••• •••• •••• •••• ••••'}
            </code>
            <p class="buttons">
              <button type="button" class="secondary" onclick={() => (showKey = !showKey)}>
                {showKey ? st.hide : st.show}
              </button>
              <button
                type="button"
                class="secondary"
                onclick={() => void navigator.clipboard.writeText(session.syncKey ?? '')}
              >
                {st.copy}
              </button>
            </p>
            <p class="muted">
              {st.lastSync(
                session.syncDetails?.lastSync == null
                  ? null
                  : dateFormat.format(session.syncDetails.lastSync),
              )}
            </p>
          {/if}
        {:else if session.settingsSection === 'files'}
          <label class="row">
            <input
              type="checkbox"
              checked={session.settings.showAllFiles}
              onchange={(e) =>
                void session.settingsStore.update({ showAllFiles: e.currentTarget.checked })}
              data-testid="show-all-files"
            />
            <span>
              {t.showAllFiles}
              <small>{t.showAllFilesHint}</small>
            </span>
          </label>
        {:else}
          <h3>{t.exportTitle}</h3>
          <p class="warning">{t.exportWarning}</p>
          <label class="row">
            <input type="checkbox" bind:checked={includeTrash} />
            <span>{t.includeTrash}</span>
          </label>
          <p>
            <button
              type="button"
              class="primary"
              disabled={session.transferBusy}
              onclick={() => void session.exportZip('', includeTrash)}
              data-testid="export-vault"
            >
              {session.transferBusy ? t.busy : t.exportVault}
            </button>
          </p>
          <p class="muted" data-testid="last-export">
            {t.lastExport(
              session.lastExport === null ? null : dateFormat.format(session.lastExport),
            )}
          </p>

          <h3>{t.importTitle}</h3>
          <p class="muted">{t.importHint}</p>
          <label class="row">
            <span>{t.importTarget}</span>
            <select bind:value={session.importTarget} data-testid="import-target">
              <option value="">{t.topLevel}</option>
              {#each folders as folder (folder.id)}
                <option value={folder.id}>{folder.path}</option>
              {/each}
            </select>
          </label>
          <p class="buttons">
            <button
              type="button"
              class="secondary"
              disabled={session.transferBusy}
              onclick={() => filesInput?.click()}
            >
              {t.chooseFiles}
            </button>
            <button
              type="button"
              class="secondary"
              disabled={session.transferBusy}
              onclick={() => folderInput?.click()}
            >
              {t.chooseFolder}
            </button>
          </p>
          <input
            bind:this={filesInput}
            type="file"
            multiple
            accept=".md,.markdown,.zip,.png,.jpg,.jpeg,.gif,.webp,.svg"
            hidden
            onchange={(e) => void pickedFiles(e.currentTarget.files)}
            data-testid="import-files"
          />
          <input
            bind:this={folderInput}
            type="file"
            webkitdirectory
            hidden
            onchange={(e) => void pickedFolder(e.currentTarget.files)}
            data-testid="import-folder"
          />
        {/if}
      </section>
    </div>
    <footer>
      <button type="button" class="secondary" onclick={() => (session.settingsSection = null)}>
        {t.close}
      </button>
    </footer>
  {/if}
</dialog>

<style>
  dialog {
    width: min(720px, 92vw);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--paper);
    color: var(--text);
    font-family: var(--font-ui);
    font-size: 14px;
  }
  dialog::backdrop {
    background: rgb(31 58 52 / 0.25);
  }
  .layout {
    display: flex;
    min-height: 360px;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 160px;
    padding: 16px 10px;
    background: var(--sidebar);
    border-right: 1px solid var(--border);
    user-select: none;
  }
  h2 {
    margin: 0 6px 10px;
    font-size: 15px;
    color: var(--heading);
  }
  .tab {
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--text);
    text-align: left;
  }
  .tab:hover {
    background: var(--hover);
  }
  /* The open section: the same gold bar as the selected row of the tree (PLAN 4.9). */
  .tab.active {
    background: var(--hover);
    box-shadow: inset 3px 0 0 var(--accent);
    font-weight: 600;
  }
  .key {
    display: block;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--panel);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow-x: auto;
  }
  section {
    flex: 1;
    padding: 16px 20px;
  }
  h3 {
    margin: 4px 0 6px;
    font-size: 14px;
    color: var(--heading);
  }
  h3:not(:first-child) {
    margin-top: 20px;
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 6px 0;
  }
  .row small {
    display: block;
    color: var(--text-muted);
  }
  .warning {
    padding: 8px 10px;
    border-left: 4px solid var(--accent);
    background: var(--panel);
  }
  .muted {
    color: var(--text-muted);
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
  select {
    padding: 3px 6px;
    border: 1.5px solid var(--text-muted);
    border-radius: 4px;
    background: var(--paper);
    color: var(--text);
    font: inherit;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
  }
</style>
