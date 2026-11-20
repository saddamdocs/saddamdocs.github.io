/**
 * The workspace of this device (PLAN 4.6, 5.4): panes, their tabs, the focused pane, the divider,
 * the sidebar and the expanded folders. It never syncs.
 *
 * The model holds a list of panes from M1, although M1 shows one; M6 adds only the second pane
 * (PLAN 7, "Panes from the start"). All functions are pure and return a new workspace.
 *
 * Talks to: nothing. Stored by `workspace/store.ts`; drawn by the UI.
 */

/** One tab: a note open in a pane. M9 adds the Calendar tab, M2 the image viewer. */
export interface Tab {
  readonly id: string;
  readonly itemId: string;
  /** Live preview or source (PLAN 4.2). M1 draws every tab as source. */
  readonly mode: 'preview' | 'source';
  /** Cursor position, as a character offset. */
  readonly cursor: number;
  /** Vertical scroll position, in px. */
  readonly scroll: number;
}

/** One editor pane with its tab bar. */
export interface Pane {
  readonly id: string;
  readonly tabs: readonly Tab[];
  /** Id of the active tab, or null when the pane is empty. */
  readonly active: string | null;
}

/** The whole workspace. */
export interface Workspace {
  /** One or two panes (PLAN 4.6); never empty. */
  readonly panes: readonly Pane[];
  /** Index of the focused pane. */
  readonly focused: number;
  /** Share of the editor area given to the left pane, 0 to 1. */
  readonly divider: number;
  /** Sidebar width in px, 180 to 480 (PLAN 4.1). */
  readonly sidebarWidth: number;
  readonly sidebarVisible: boolean;
  /** Ids of expanded folders (PLAN 4.3). */
  readonly expanded: readonly string[];
  /** Id of the selected tree row, or null. */
  readonly selected: string | null;
}

/** Narrowest and widest sidebar, in px (PLAN 4.1). */
export const SIDEBAR_LIMITS = [180, 480] as const;

let counter = 0;
/** A short id for a pane or tab, unique within this page. */
function localId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${String(counter)}`;
}

/**
 * The workspace of a device that has none yet.
 *
 * @returns One empty pane and a sidebar of 260 px.
 */
export function emptyWorkspace(): Workspace {
  return {
    panes: [{ id: localId('p'), tabs: [], active: null }],
    focused: 0,
    divider: 0.5,
    sidebarWidth: 260,
    sidebarVisible: true,
    expanded: [],
    selected: null,
  };
}

/** Replaces one pane. */
function withPane(ws: Workspace, index: number, pane: Pane): Workspace {
  return { ...ws, panes: ws.panes.map((p, i) => (i === index ? pane : p)) };
}

/**
 * Finds the tab that shows a note, in any pane (PLAN 4.6: a note is open in at most one tab).
 *
 * @param ws - The workspace.
 * @param itemId - The note.
 * @returns The pane index and the tab, or null.
 */
export function findTab(ws: Workspace, itemId: string): { pane: number; tab: Tab } | null {
  for (const [pane, p] of ws.panes.entries()) {
    const tab = p.tabs.find((t) => t.itemId === itemId);
    if (tab !== undefined) return { pane, tab };
  }
  return null;
}

/**
 * The active tab of the focused pane.
 *
 * @param ws - The workspace.
 * @returns The tab, or null when the pane is empty.
 */
export function activeTab(ws: Workspace): Tab | null {
  const pane = ws.panes[ws.focused];
  return pane?.tabs.find((t) => t.id === pane.active) ?? null;
}

/**
 * Opens a note (PLAN 4.6): focuses its tab if it has one; otherwise shows it in the current tab of
 * the focused pane, or in a new tab when asked or when the pane is empty.
 *
 * @param ws - The workspace.
 * @param itemId - The note.
 * @param options - How to open it.
 * @param options.newTab - Open a new tab even when the pane has a current tab.
 * @param options.mode - The mode of a new tab.
 * @returns The new workspace.
 */
export function openNote(
  ws: Workspace,
  itemId: string,
  options: { newTab?: boolean; mode?: Tab['mode'] } = {},
): Workspace {
  const existing = findTab(ws, itemId);
  if (existing !== null) {
    const pane = ws.panes[existing.pane];
    if (pane === undefined) return ws;
    return {
      ...withPane(ws, existing.pane, { ...pane, active: existing.tab.id }),
      focused: existing.pane,
      selected: itemId,
    };
  }
  const index = ws.focused;
  const pane = ws.panes[index];
  if (pane === undefined) return ws;
  const tab: Tab = {
    id: localId('t'),
    itemId,
    mode: options.mode ?? 'preview',
    cursor: 0,
    scroll: 0,
  };
  const current = pane.tabs.findIndex((t) => t.id === pane.active);
  const tabs =
    options.newTab === true || current === -1
      ? [...pane.tabs.slice(0, current + 1), tab, ...pane.tabs.slice(current + 1)]
      : pane.tabs.map((t, i) => (i === current ? tab : t));
  return { ...withPane(ws, index, { ...pane, tabs, active: tab.id }), selected: itemId };
}

/**
 * Closes a tab. The neighbour to its right, else to its left, becomes active (as in Obsidian).
 *
 * @param ws - The workspace.
 * @param tabId - The tab.
 * @returns The new workspace.
 */
export function closeTab(ws: Workspace, tabId: string): Workspace {
  const index = ws.panes.findIndex((p) => p.tabs.some((t) => t.id === tabId));
  const pane = ws.panes[index];
  if (pane === undefined) return ws;
  const at = pane.tabs.findIndex((t) => t.id === tabId);
  const tabs = pane.tabs.filter((t) => t.id !== tabId);
  const active =
    pane.active === tabId ? (tabs[Math.min(at, tabs.length - 1)]?.id ?? null) : pane.active;
  return withPane(ws, index, { ...pane, tabs, active });
}

/**
 * Closes every tab whose note is no longer live, for example after it was deleted (PLAN 4.3), and
 * forgets expanded folders that no longer exist at all. A folder in the Trash keeps its expanded
 * state, so Undo or Restore brings it back as it was. Used on start-up too: "a tab whose note no
 * longer exists is skipped silently" (PLAN 4.6).
 *
 * @param ws - The workspace.
 * @param isLive - Tells whether an item id is live (known, and not in the Trash).
 * @param exists - Tells whether an item id is known at all, in the Trash or not.
 * @returns The new workspace, and the tabs it closed (for Undo).
 */
export function closeMissing(
  ws: Workspace,
  isLive: (id: string) => boolean,
  exists: (id: string) => boolean = isLive,
): { workspace: Workspace; closed: Tab[] } {
  const closed: Tab[] = [];
  let next = ws;
  for (const pane of ws.panes) {
    for (const tab of pane.tabs) {
      if (!isLive(tab.itemId)) {
        closed.push(tab);
        next = closeTab(next, tab.id);
      }
    }
  }
  const expanded = next.expanded.filter(exists);
  const selected = next.selected !== null && isLive(next.selected) ? next.selected : null;
  return { workspace: { ...next, expanded, selected }, closed };
}

/**
 * Remembers a tab's cursor and scroll position.
 *
 * @param ws - The workspace.
 * @param tabId - The tab.
 * @param cursor - Character offset.
 * @param scroll - Scroll position in px.
 * @returns The new workspace.
 */
export function rememberPosition(
  ws: Workspace,
  tabId: string,
  cursor: number,
  scroll: number,
): Workspace {
  return {
    ...ws,
    panes: ws.panes.map((p) => ({
      ...p,
      tabs: p.tabs.map((t) => (t.id === tabId ? { ...t, cursor, scroll } : t)),
    })),
  };
}

/**
 * Expands or collapses a folder in the tree.
 *
 * @param ws - The workspace.
 * @param folderId - The folder.
 * @param open - True to expand.
 * @returns The new workspace.
 */
export function setExpanded(ws: Workspace, folderId: string, open: boolean): Workspace {
  const set = new Set(ws.expanded);
  if (open) set.add(folderId);
  else set.delete(folderId);
  return { ...ws, expanded: [...set] };
}

/**
 * Reads a stored workspace defensively: anything malformed gives an empty workspace, because the
 * workspace is a convenience and must never stop the app.
 *
 * @param value - The stored value.
 * @returns A valid workspace.
 */
export function parseWorkspace(value: unknown): Workspace {
  const fallback = emptyWorkspace();
  if (value === null || typeof value !== 'object') return fallback;
  const v = value as Partial<Workspace>;
  if (!Array.isArray(v.panes) || v.panes.length === 0 || v.panes.length > 2) return fallback;
  const panes = (v.panes as Partial<Pane>[]).map((p) => ({
    id: typeof p.id === 'string' ? p.id : localId('p'),
    tabs: Array.isArray(p.tabs)
      ? (p.tabs as Partial<Tab>[])
          .filter((t): t is Partial<Tab> & { itemId: string } => typeof t.itemId === 'string')
          .map((t) => ({
            id: typeof t.id === 'string' ? t.id : localId('t'),
            itemId: t.itemId,
            mode: t.mode === 'source' ? ('source' as const) : ('preview' as const),
            cursor: typeof t.cursor === 'number' ? t.cursor : 0,
            scroll: typeof t.scroll === 'number' ? t.scroll : 0,
          }))
      : [],
    active: typeof p.active === 'string' ? p.active : null,
  }));
  const width = typeof v.sidebarWidth === 'number' ? v.sidebarWidth : fallback.sidebarWidth;
  return {
    panes,
    focused:
      typeof v.focused === 'number' && v.focused >= 0 && v.focused < panes.length ? v.focused : 0,
    divider: typeof v.divider === 'number' && v.divider > 0 && v.divider < 1 ? v.divider : 0.5,
    sidebarWidth: Math.min(SIDEBAR_LIMITS[1], Math.max(SIDEBAR_LIMITS[0], width)),
    sidebarVisible: v.sidebarVisible !== false,
    expanded: Array.isArray(v.expanded)
      ? v.expanded.filter((x): x is string => typeof x === 'string')
      : [],
    selected: typeof v.selected === 'string' ? v.selected : null,
  };
}
