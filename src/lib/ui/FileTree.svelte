<!--
  @component
  The sidebar's tree of folders and notes (PLAN 4.3): folders first, natural order, expand and
  collapse, the selected row on `--hover` with a gold bar (PLAN 4.9), inline rename, drag and drop
  to move, the app's own right-click menu, and the keyboard of PLAN 4.3: Up and Down move, Right
  and Left expand and collapse, Enter opens, Ctrl+Enter opens in a new tab, F2 renames, Delete
  deletes.

  Talks to: `app/session.svelte.ts` for every action, `ContextMenu.svelte`, `strings.ts`.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { Session } from '../app/session.svelte.ts';
  import type { ItemRecord } from '../store/schema.ts';
  import { sidebar as t } from '../strings.ts';
  import type { TreeRow } from '../vault/tree.ts';
  import ContextMenu, { type MenuEntry } from './ContextMenu.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();

  /** The drag payload type, so drops from outside (files) are told apart. */
  const DRAG_TYPE = 'application/x-tamandua-item';

  let rows: TreeRow[] = $derived(
    session.index.rows(new Set(session.workspace.expanded), session.settings.showAllFiles),
  );
  let tree: HTMLDivElement | undefined = $state();
  let menu: { x: number; y: number; entries: MenuEntry[] } | null = $state(null);
  let dropTarget: string | null = $state(null);
  let renameValue = $state('');
  let renameError = $state('');

  /** The row that takes Tab focus: the selected one, else the first. */
  let focusId: string | null = $derived(
    rows.some((r) => r.item.id === session.workspace.selected)
      ? session.workspace.selected
      : (rows[0]?.item.id ?? null),
  );

  // Start editing a name when the session asks (new note, new folder, F2, menu).
  $effect(() => {
    const id = session.renaming;
    if (id === null) return;
    renameValue = session.index.get(id)?.name ?? '';
    renameError = '';
    void tick().then(() => {
      const input = tree?.querySelector<HTMLInputElement>('input.rename');
      input?.focus();
      input?.select();
    });
  });

  function focusRow(id: string): void {
    session.select(id);
    void tick().then(() => tree?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus());
  }

  function activate(row: TreeRow, newTab: boolean): void {
    if (row.item.kind === 'folder') {
      session.select(row.item.id);
      session.toggleFolder(row.item.id);
    } else if (row.item.kind === 'note') {
      session.open(row.item.id, newTab);
    } else {
      session.select(row.item.id);
    }
  }

  async function commitRename(id: string): Promise<void> {
    if (session.renaming !== id) return;
    const problem = await session.rename(id, renameValue);
    if (problem === null) {
      session.renaming = null;
      focusRow(id);
    } else {
      renameError = problem;
    }
  }

  function cancelRename(id: string): void {
    session.renaming = null;
    focusRow(id);
  }

  function onRenameKey(event: KeyboardEvent, id: string): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename(id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename(id);
    }
  }

  function onRenameBlur(id: string): void {
    // Enter and Escape end the rename before the field disappears and blurs; nothing more to do.
    if (session.renaming !== id) return;
    // Leaving the field keeps a valid name and drops an invalid one, as Obsidian does.
    void session.rename(id, renameValue).then((problem) => {
      if (session.renaming !== id) return;
      session.renaming = null;
      if (problem !== null) session.notify(problem);
    });
  }

  function onKeydown(event: KeyboardEvent): void {
    if (session.renaming !== null) return;
    // Act on the row that has keyboard focus, which may differ from the selection.
    const targetId = (event.target as HTMLElement).dataset.id ?? focusId;
    const at = rows.findIndex((r) => r.item.id === targetId);
    const row = rows[at];
    if (row === undefined) return;
    const parentId = session.index.parentOf(row.item);
    switch (event.key) {
      case 'ArrowDown':
        if (at + 1 < rows.length) focusRow(rows[at + 1]!.item.id);
        break;
      case 'ArrowUp':
        if (at > 0) focusRow(rows[at - 1]!.item.id);
        break;
      case 'ArrowRight':
        if (row.item.kind === 'folder' && !row.expanded) session.toggleFolder(row.item.id, true);
        else if (row.expanded && rows[at + 1] !== undefined) focusRow(rows[at + 1]!.item.id);
        break;
      case 'ArrowLeft':
        if (row.expanded) session.toggleFolder(row.item.id, false);
        else if (parentId !== '') focusRow(parentId);
        break;
      case 'Enter':
        activate(row, event.ctrlKey);
        break;
      case 'F2':
        session.renaming = row.item.id;
        break;
      case 'Delete':
        void session.delete(row.item.id).then(() => {
          const next = rows[Math.min(at, rows.length - 1)];
          if (next !== undefined) focusRow(next.item.id);
        });
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function rowMenu(item: ItemRecord): MenuEntry[] {
    const id = item.id;
    const entries: MenuEntry[] = [];
    if (item.kind === 'note') {
      entries.push({ label: t.openInNewTab, run: () => session.open(id, true) }, null);
    }
    if (item.kind === 'folder') {
      entries.push(
        { label: t.newNote, run: () => void session.newNote(id) },
        { label: t.newSubfolder, run: () => void session.newFolder(id) },
        null,
      );
    }
    entries.push({ label: t.rename, run: () => (session.renaming = id) });
    if (item.kind === 'note')
      entries.push({ label: t.duplicate, run: () => void session.duplicate(id) });
    entries.push({ label: t.copyPath, run: () => void session.copyPath(id) }, null, {
      label: t.delete,
      danger: true,
      run: () => void session.delete(id),
    });
    return entries;
  }

  function openMenu(event: MouseEvent, entries: MenuEntry[]): void {
    event.preventDefault();
    event.stopPropagation();
    menu = { x: event.clientX, y: event.clientY, entries };
  }

  /** True when the drag carries a tree item, not a file from outside. */
  function isItemDrag(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes(DRAG_TYPE) === true;
  }

  function onDragOver(event: DragEvent, target: string): void {
    if (!isItemDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
    dropTarget = target;
  }

  function onDrop(event: DragEvent, target: string): void {
    const id = event.dataTransfer?.getData(DRAG_TYPE) ?? '';
    dropTarget = null;
    if (id === '') return;
    event.preventDefault();
    event.stopPropagation();
    void session.move(id, target);
  }
</script>

<div
  class="tree"
  role="tree"
  aria-label={t.tree}
  tabindex="-1"
  bind:this={tree}
  onkeydown={onKeydown}
  onclick={(e) => {
    // A click on the empty space below the rows clears the selection, so new items go to the root.
    if (e.target === tree) session.select(null);
  }}
  oncontextmenu={(e) =>
    openMenu(e, [
      { label: t.newNote, run: () => void session.newNote('') },
      { label: t.newFolder, run: () => void session.newFolder('') },
    ])}
  ondragover={(e) => onDragOver(e, '')}
  ondragleave={() => (dropTarget = null)}
  ondrop={(e) => onDrop(e, '')}
  class:drop-root={dropTarget === ''}
  data-testid="tree"
>
  {#if rows.length === 0}
    <p class="empty">{t.emptyVault}</p>
  {/if}
  {#each rows as row (row.item.id)}
    {@const item = row.item}
    {@const selected = item.id === session.workspace.selected}
    <div
      class="row"
      class:selected
      class:drop={dropTarget === item.id}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={item.kind === 'folder' ? row.expanded : undefined}
      aria-selected={selected}
      tabindex={item.id === focusId ? 0 : -1}
      data-id={item.id}
      data-kind={item.kind}
      draggable={session.renaming !== item.id}
      style:padding-left="{8 + row.depth * 16}px"
      onclick={(e) => activate(row, e.ctrlKey || e.metaKey)}
      onauxclick={(e) => {
        if (e.button === 1 && item.kind === 'note') session.open(item.id, true);
      }}
      onkeydown={() => undefined}
      oncontextmenu={(e) => {
        session.select(item.id);
        openMenu(e, rowMenu(item));
      }}
      ondragstart={(e) => {
        e.dataTransfer?.setData(DRAG_TYPE, item.id);
        if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = 'move';
      }}
      ondragover={(e) => {
        if (item.kind === 'folder') onDragOver(e, item.id);
      }}
      ondrop={(e) => {
        if (item.kind === 'folder') onDrop(e, item.id);
      }}
    >
      <span class="chevron" class:open={row.expanded} class:hidden={item.kind !== 'folder'}>
        <Icon name="chevron" size={14} />
      </span>
      {#if item.kind === 'file'}<span class="kind"><Icon name="image" size={14} /></span>{/if}
      {#if session.renaming === item.id}
        <span class="rename-box">
          <input
            class="rename"
            type="text"
            bind:value={renameValue}
            aria-label={t.rename}
            aria-invalid={renameError !== ''}
            spellcheck="false"
            onkeydown={(e) => onRenameKey(e, item.id)}
            onblur={() => onRenameBlur(item.id)}
            onclick={(e) => e.stopPropagation()}
          />
          {#if renameError}<span class="error" role="alert">{renameError}</span>{/if}
        </span>
      {:else}
        <span class="name">{item.name}</span>
        {#if row.sameName}<span class="same" title={t.sameName}>≠</span>{/if}
      {/if}
    </div>
  {/each}
</div>

{#if menu}
  <ContextMenu entries={menu.entries} x={menu.x} y={menu.y} onClose={() => (menu = null)} />
{/if}

<style>
  .tree {
    flex: 1;
    overflow: auto;
    padding: 4px 8px 24px;
    outline: none;
  }
  .tree.drop-root {
    background: var(--hover);
  }
  .empty {
    margin: 12px 8px;
    color: var(--text-muted);
    font-size: 13px;
  }
  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 28px;
    padding-right: 8px;
    border-radius: 4px;
    color: var(--text);
    font-size: 14px;
    cursor: default;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.selected {
    background: var(--hover);
  }
  .row.selected::before {
    content: '';
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .row.drop {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }
  .chevron {
    display: inline-flex;
    width: 16px;
    flex: none;
    color: var(--text-muted);
    transition: transform 0.1s;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .chevron.hidden {
    visibility: hidden;
  }
  .kind {
    display: inline-flex;
    color: var(--text-muted);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .same {
    margin-left: 6px;
    color: var(--danger);
    font-weight: 700;
  }
  .rename-box {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .rename {
    width: 100%;
    box-sizing: border-box;
    padding: 2px 4px;
    border: 1.5px solid var(--text-muted);
    border-radius: 3px;
    background: var(--paper);
    color: var(--text);
    font: inherit;
    user-select: text;
  }
  .error {
    margin: 2px 0;
    color: var(--danger);
    font-size: 12px;
    white-space: normal;
  }
</style>
