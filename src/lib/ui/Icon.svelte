<!--
  @component
  A small stroke icon, drawn in the current text colour (PLAN 4.9: icons in `--text`). The paths
  are simple shapes drawn for Tamanduá on a 24 × 24 grid, so no icon library is needed.

  Talks to: nothing.
-->
<script lang="ts" module>
  /** Every icon by name: one or more SVG path strings. */
  const PATHS = {
    'note-plus': [
      'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      'M14 3v5h5',
      'M12 11v6M9 14h6',
    ],
    'folder-plus': [
      'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
      'M12 10v6M9 13h6',
    ],
    search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M20 20l-4-4'],
    calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4M16 3v4'],
    trash: ['M4 7h16', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3', 'M10 11v6M14 11v6'],
    settings: [
      'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
      'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
    ],
    chevron: ['M9 6l6 6-6 6'],
    image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M15 8.5v.01'],
    close: ['M6 6l12 12M18 6L6 18'],
    restore: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
    back: ['M15 18l-6-6 6-6'],
  } as const;

  /** The names of the icons. */
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  interface Props {
    /** Which icon. */
    name: IconName;
    /** Edge length in px. */
    size?: number;
  }
  let { name, size = 18 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each PATHS[name] as d (d)}<path {d} />{/each}
</svg>
