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
    // A cogwheel: eight teeth and a hole in the middle.
    settings: [
      'M19.08 9.23 L21.84 10.24 L21.84 13.76 L19.08 14.77 L18.96 15.05 L20.20 17.72 L17.72 20.20 L15.05 18.96 L14.77 19.08 L13.76 21.84 L10.24 21.84 L9.23 19.08 L8.95 18.96 L6.28 20.20 L3.80 17.72 L5.04 15.05 L4.92 14.77 L2.16 13.76 L2.16 10.24 L4.92 9.23 L5.04 8.95 L3.80 6.28 L6.28 3.80 L8.95 5.04 L9.23 4.92 L10.24 2.16 L13.76 2.16 L14.77 4.92 L15.05 5.04 L17.72 3.80 L20.20 6.28 L18.96 8.95 Z',
      'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
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
