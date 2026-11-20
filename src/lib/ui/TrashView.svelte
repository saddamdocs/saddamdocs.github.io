<!--
  @component
  The Trash (PLAN 4.3), shown in the sidebar in place of the tree, on `--sidebar` (PLAN 4.9):
  deleted items newest first, with the date and the device that deleted them; a deleted folder is
  one entry with the number of items it holds. Restore, Delete forever, and Empty Trash.

  Talks to: `app/session.svelte.ts`, `ContextMenu.svelte`, `strings.ts`.
-->
<script lang="ts">
  import type { Session } from '../app/session.svelte.ts';
  import { sidebar as t } from '../strings.ts';
  import ContextMenu, { type MenuEntry } from './ContextMenu.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    /** The running session. */
    session: Session;
  }
  let { session }: Props = $props();

  let entries = $derived(session.index.trashEntries());
  let menu: { x: number; y: number; entries: MenuEntry[] } | null = $state(null);

  const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
</script>

<div class="trash" data-testid="trash">
  <div class="header">
    <button type="button" class="link" onclick={() => (session.sidebarView = 'tree')}>
      <Icon name="back" size={14} />
      {t.backToNotes}
    </button>
    <button
      type="button"
      class="secondary small"
      disabled={entries.length === 0}
      onclick={() => session.emptyTrash()}
    >
      {t.emptyTrash}
    </button>
  </div>
  <p class="hint">{t.trashKeeps(session.settings.trashDays)}</p>
  {#if entries.length === 0}
    <p class="hint">{t.trashEmpty}</p>
  {/if}
  <ul>
    {#each entries as entry (entry.item.id)}
      {@const item = entry.item}
      <li
        oncontextmenu={(e) => {
          e.preventDefault();
          menu = {
            x: e.clientX,
            y: e.clientY,
            entries: [
              { label: t.restore, run: () => void session.restore(item.id) },
              { label: t.deleteForever, danger: true, run: () => session.deleteForever(item.id) },
            ],
          };
        }}
        data-testid="trash-entry"
      >
        <div class="what">
          <span class="name">{item.name}</span>
          <span class="meta">
            {t.deletedOn(dateFormat.format(item.deletedAt ?? item.updated), item.device)}
            {#if item.kind === 'folder'}
              · {t.items(entry.contains)}{/if}
          </span>
        </div>
        <div class="actions">
          <button
            type="button"
            class="icon"
            title={t.restore}
            aria-label="{t.restore} {item.name}"
            onclick={() => void session.restore(item.id)}
          >
            <Icon name="restore" size={16} />
          </button>
          <button
            type="button"
            class="icon danger"
            title={t.deleteForever}
            aria-label="{t.deleteForever} {item.name}"
            onclick={() => session.deleteForever(item.id)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </li>
    {/each}
  </ul>
</div>

{#if menu}
  <ContextMenu entries={menu.entries} x={menu.x} y={menu.y} onClose={() => (menu = null)} />
{/if}

<style>
  .trash {
    flex: 1;
    overflow: auto;
    padding: 4px 8px 24px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 4px 0;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    border: none;
    background: none;
    color: var(--text);
    font-size: 13px;
  }
  .small {
    padding: 3px 10px;
    font-size: 13px;
  }
  .hint {
    margin: 8px 8px;
    color: var(--text-muted);
    font-size: 13px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 4px;
  }
  li:hover,
  li:focus-within {
    background: var(--hover);
  }
  .what {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }
  .meta {
    color: var(--text-muted);
    font-size: 12px;
  }
  .actions {
    display: flex;
    gap: 2px;
  }
  .icon {
    display: inline-flex;
    padding: 4px;
    border: none;
    background: none;
    color: var(--text-muted);
  }
  .icon:hover {
    color: var(--text);
  }
  .icon.danger:hover {
    color: var(--danger);
  }
</style>
