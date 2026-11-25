# Progress

Updated at the end of every session (PLAN 10, "Process").

## Status

| Milestone  | State                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| M0         | Accepted by Felipe on 20 November 2026; tagged `m0`                                                  |
| M1         | Accepted by Felipe on 24 November 2026, with the tree indent and gear changes; tagged `m1`           |
| M2         | Accepted by Felipe on 25 November 2026, with the tree layout of his Obsidian screenshot; tagged `m2` |
| M3a        | In progress on branch `m3a-sync-transport`                                                           |
| M3b to M11 | Not started                                                                                          |

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

## M2: saving, history, and plain Markdown in and out

Branch `m2-saving-transfer`.

| #   | Task                                                                                                                                     | State          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Saving: controller tests with fake timers, the failure banner with Retry and "Export now", the persistent-storage request at every start | done           |
| 2   | Files in the vault (`Vault.addFile`, SHA-256), the image viewer tab, "Show all files"                                                    | done           |
| 3   | Image links (4.3): parse, look up, rewrite on move as part of the move and its Undo                                                      | done           |
| 4   | Local snapshots: 20 per note, idle 5 min, tab close, one per 10 min; the History view with Restore as an undoable edit                   | done           |
| 5   | Export: vault and folder to `.zip` in a worker, `(2)` for case clashes, the Trash under `.trash/`, "Download as .md"                     | done           |
| 6   | Import: folder, `.zip` or `.md` files; the rules of 4.15; summary; Undo import                                                           | done           |
| 7   | Export reminder banner; Settings dialog with its Data section                                                                            | done           |
| 8   | Fixtures of section 8 for import; R12 round-trip test; abrupt-close test                                                                 | done           |
| 9   | Docs and gate                                                                                                                            | done; accepted |

## M3a: sync, part 1 (format, rules and transport)

Branch `m3a-sync-transport`.

| #   | Task                                                                                                                                          | State       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | `sync/crypto.ts`: PBKDF2, AES-GCM seals with AAD, deflate-raw; test vectors in `tests/unit/crypto-vectors.json`                               | in progress |
| 2   | `sync/format.ts`: local items ↔ database records, validation, limits                                                                          | todo        |
| 3   | `sync/rest.ts`: every request of 5.8, response classes, timeouts, retries, four at a time; `sync/stream.ts`                                   | todo        |
| 4   | `sync/engine.ts`: upload schedule of 5.8, push, pull for every kind, blobs, catch-up, own uploads; records that meet local edits wait for M3b | todo        |
| 5   | `sync/keys.ts`: "Start a new synced vault" (welcome and Settings → Sync), "Connect to my vault" for a device with no notes                    | todo        |
| 6   | Sync chip and its details; remote changes applied in place to an open, clean note                                                             | todo        |
| 7   | Rules tests for every rule of Appendix B (completing M0's)                                                                                    | todo        |
| 8   | `tools/recover.mjs` and its format-1 fixture                                                                                                  | todo        |
| 9   | Sync tests against the emulator (two devices; I1, I3, I6, I7; offline; closed mid-upload; budgets)                                            | todo        |
| 10  | Docs and gate (rules to the test database by Felipe)                                                                                          | todo        |

## Next

- Finish the M3a tasks above, then the M3a gate.

## Blockers

None.
