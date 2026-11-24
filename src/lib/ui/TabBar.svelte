<!--
  @component
  A pane's tab bar (PLAN 4.6, 4.9) on `--panel`: the active tab takes `--paper` with a 3 px gold
  line on top; other tabs show muted text. Click activates, middle-click and the close button
  close, and the app's right-click menu offers Close. M6 adds reordering, splitting and the
  buttons at the right end.

  Talks to: `app/session.svelte.ts`, `ContextMenu.svelte`, `strings.ts`.
-->
<script lang="ts">
  import type { Session } from '../app/session.svelte.ts';
  import { history as historyText, status as t, transfer as transferText } from '../strings.ts';
  import type { Pane } from '../workspace/model.ts';
  import ContextMenu, { type MenuEntry } from './ContextMenu.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    /** The running session. */
    session: Session;
    /** The pane whose tabs this bar shows. */
    pane: Pane;
    /** The pane's index in the workspace. */
    index: number;
  }
  let { session, pane, index }: Props = $props();
  let menu: { x: number; y: number; entries: MenuEntry[] } | null = $state(null);

  function activate(tabId: string): void {
    const panes = session.workspace.panes.map((p, i) =>
      i === index ? { ...p, active: tabId } : p,
    );
    const tab = pane.tabs.find((x) => x.id === tabId);
    session.setWorkspace({
      ...session.workspace,
      panes,
      focused: index,
      selected: tab?.itemId ?? null,
    });
  }
</script>

<div class="tabbar" role="tablist" data-testid="tabbar">
  {#each pane.tabs as tab (tab.id)}
    {@const active = tab.id === pane.active}
    {@const name = session.index.get(tab.itemId)?.name ?? ''}
    <div
      class="tab"
      class:active
      role="tab"
      tabindex={active ? 0 : -1}
      aria-selected={active}
      title={session.index.path(tab.itemId)}
      onclick={() => activate(tab.id)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') activate(tab.id);
      }}
      onauxclick={(e) => {
        if (e.button === 1) void session.closeTab(tab.id);
      }}
      oncontextmenu={(e) => {
        e.preventDefault();
        menu = {
          x: e.clientX,
          y: e.clientY,
          entries: [
            ...(session.index.get(tab.itemId)?.kind === 'note'
              ? [
                  { label: historyText.menu, run: () => session.openHistory(tab.id) },
                  {
                    label: transferText.downloadMd,
                    run: () => void session.downloadNote(tab.itemId),
                  },
                  null,
                ]
              : []),
            { label: t.closeTab, run: () => void session.closeTab(tab.id) },
          ],
        };
      }}
    >
      <span class="label">{name}</span>
      <button
        type="button"
        class="close"
        aria-label="{t.closeTab} {name}"
        title={t.closeTab}
        onclick={(e) => {
          e.stopPropagation();
          void session.closeTab(tab.id);
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  {/each}
</div>

{#if menu}
  <ContextMenu entries={menu.entries} x={menu.x} y={menu.y} onClose={() => (menu = null)} />
{/if}

<style>
  .tabbar {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 40px;
    padding: 0 8px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-ui);
    font-size: 13px;
    user-select: none;
    overflow-x: auto;
  }
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 80px;
    max-width: 200px;
    height: 32px;
    padding: 0 6px 0 12px;
    border-radius: 6px 6px 0 0;
    color: var(--text-muted);
    cursor: default;
  }
  .tab:hover:not(.active) {
    background: var(--hover);
  }
  .tab.active {
    background: var(--paper);
    color: var(--text);
    box-shadow: inset 0 3px 0 var(--accent);
  }
  .label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close {
    display: inline-flex;
    padding: 2px;
    border: none;
    border-radius: 3px;
    background: none;
    color: var(--text-muted);
  }
  .close:hover {
    background: var(--hover);
    color: var(--text);
  }
</style>
