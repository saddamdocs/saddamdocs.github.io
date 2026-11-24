# Progress

Updated at the end of every session (PLAN 10, "Process").

## Status

| Milestone | State                                                                                      |
| --------- | ------------------------------------------------------------------------------------------ |
| M0        | Accepted by Felipe on 20 November 2026; tagged `m0`                                        |
| M1        | Accepted by Felipe on 24 November 2026, with the tree indent and gear changes; tagged `m1` |
| M2 to M11 | Not started                                                                                |

## M0: environment, skeleton and deploy

Branch `m0-skeleton`.

| #   | Task                                                                         | State                                               |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Check the table of 1.4, the ticks of section 12, the toolchain and token     | done                                                |
| 2   | Scaffold Vite, Svelte 5, TypeScript; `channel.ts` with the two channels      | done                                                |
| 3   | Manifest, icons (Appendix A), service worker with update prompt              | done                                                |
| 4   | `npm run check`: tsc, svelte-check, ESLint with doc-comment rules, Prettier  | done                                                |
| 5   | `database.rules.json` (Appendix B) and the first rules tests                 | done                                                |
| 6   | Workflows: `ci.yml`, `deploy.yml`, `release.yml`, `deploy/stable-deploy.yml` | done                                                |
| 7   | `CLAUDE.md`, README, CHANGELOG, licences, `docs/`                            | done                                                |
| 8   | Spike B: shortcut probe page                                                 | done (Fedora and Windows, tab and installed)        |
| 9   | Spike C: Playwright Chromium, Brave, emulator                                | done                                                |
| 10  | Spike D: browser to emulator; probe button for NEXT_DB                       | done (emulator; NEXT_DB PASS on Fedora and Windows) |
| 11  | Merge to `main`, next channel live, tag `v0.0.1` and `v0.0.2`                | done (PR #1, #2; releases v0.0.1, v0.0.2)           |
| 12  | Spike A: Felipe deploys `v0.0.1`, `v0.0.2`, puts `v0.0.1` back               | done (Fedora and Windows)                           |
| 13  | Update PLAN 4.12 from spike B; write spike A up                              | done                                                |

## M1: vault, tree and plain editor (on this device only)

Branch `m1-vault`.

| #   | Task                                                                                                                                                                      | State          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Dependencies (idb, CodeMirror, Fontsource, fake-indexeddb); `fonts.ts` with Inter and JetBrains Mono                                                                      | done           |
| 2   | `store/`: IndexedDB schema of 5.3, migrations, newer-version guard, strict write transactions                                                                             | done           |
| 3   | `vault/` pure logic: ids, name rules, paths, tree, natural order; unit tests                                                                                              | done           |
| 4   | `vault/` operations: create, rename, move, duplicate, delete to Trash, restore, delete forever, undo, local purge; every change marks dirty; unit tests on fake IndexedDB | done           |
| 5   | `settings/` store with the defaults of 4.9 and 4.13; `workspace/` model with a list of panes                                                                              | done           |
| 6   | `instance/`: the one-window lock (Web Locks and BroadcastChannel)                                                                                                         | done           |
| 7   | `editor/setup.ts`: CodeMirror in source mode; `autosave/` save of the open note                                                                                           | done           |
| 8   | UI shell: welcome, sidebar and tree (keyboard, menus, drag and drop, inline rename), tab bar, status bar, Trash view, snackbar, lock and newer-data screens, window title | done           |
| 9   | The 5.10 list, each rule with a test                                                                                                                                      | done           |
| 10  | Playwright UI tests; screenshots of the shell, the tree and the welcome screen for Felipe                                                                                 | done           |
| 11  | Docs: ARCHITECTURE, DECISIONS, MANUAL_TESTS; gate                                                                                                                         | done; accepted |

## Next

- M2: saving, history, and plain Markdown in and out.

## Blockers

None.
