# Architecture

A map of the modules and short guides for later changes (PLAN 10, "Comments and maintainability").
Keep it in step with the code: a stale entry is a defect. PLAN 5 describes the target design; this
file describes what exists now (M3a).

## How the pieces fit

```text
main.ts ─ applies the default appearance, mounts App.svelte
App.svelte ─ one-window lock → boot() → Welcome | Shell | lock / newer-data / storage screens
  app/boot.ts ─ opens IndexedDB, loads Vault + SettingsStore + workspace → Session
  app/session.svelte.ts ─ the running state ($state) and every user action
    vault/operations.ts (Vault) ─ the only writer of items, texts, files, snapshots
    settings/store.ts ─ the settings item, through the Vault
    workspace/ ─ panes and tabs of this device, saved on their own
    autosave/ ─ one NoteSaver per open note (the 6.2 state machine)
  ui/ ─ components read Session fields and call Session methods; nothing else writes
```

Export goes: `Session.exportZip` → `transfer/exportZip.ts` plans the paths and reads the bytes →
`transfer/zip.ts` → the zip worker → `transfer/download.ts`. Import goes the other way:
picker → `transfer/zip.ts` (for a `.zip`) → `transfer/importFiles.ts` plans every item and the
summary → `Vault.importItems` writes them in one transaction.

Sync goes: a local change marks items dirty (`vault/records.ts`) → the vault tells the engine
(`VaultChange`, origin `local`) → after a quiet second (at most 10 s) `SyncEngine.pump` seals the
item (`sync/format.ts`, `sync/crypto.ts`) and sends one multi-path `PATCH` (`sync/rest.ts`) → the
other device's stream (`sync/stream.ts`) sees `head` change → its engine catches up, opens the
record and applies it (`Vault.applyRemote`, and `Session.applyRemoteText` for an open note).

A user action goes: component → `Session` method → `Vault` operation (one strict IndexedDB
transaction) → the vault's listeners → `Session.index` replaced → components update. Typing goes:
CodeMirror → `NoteSaver.edit()` → timer → `Vault.saveText()`.

## Module map

| Path                              | Job                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                      | The page; CSP, title and splash colours filled in at build time                                                                             |
| `vite.config.ts`                  | Modes (channels), defines, HTML placeholders, PWA plugin, probe stub                                                                        |
| `src/main.ts`                     | Default appearance, mounts `App.svelte`, removes the splash                                                                                 |
| `src/App.svelte`                  | Lock, start-up phases, update prompt, probe entry                                                                                           |
| `src/app.css`                     | Global element styles, buttons, the focus ring of PLAN 4.9                                                                                  |
| `src/lib/channel.ts`              | Channel table and the running `channel`; the only home of database URLs                                                                     |
| `src/lib/config.ts`               | Every tunable value, with unit and range                                                                                                    |
| `src/lib/build.ts`                | Version, commit and build date injected by Vite                                                                                             |
| `src/lib/csp.ts`                  | The content security policy text (PLAN 5.9)                                                                                                 |
| `src/lib/strings.ts`              | Every text shown to the user                                                                                                                |
| `src/lib/device.ts`               | Default device name ("Linux · Brave")                                                                                                       |
| `src/lib/updates.ts`              | Service worker registration, hourly update check, reload on request                                                                         |
| `src/lib/app/boot.ts`             | Start-up order; "Use only on this device for now"                                                                                           |
| `src/lib/app/session.svelte.ts`   | Running state and actions; reports refusals and failures                                                                                    |
| `src/lib/app/notices.svelte.ts`   | The snackbar's state                                                                                                                        |
| `src/lib/store/schema.ts`         | Record types of every IndexedDB store (PLAN 5.3)                                                                                            |
| `src/lib/store/db.ts`             | Opening, migrations, newer-data guard, `writeTx` with strict durability                                                                     |
| `src/lib/store/log.ts`            | Diagnostic log, 500 entries, no note text                                                                                                   |
| `src/lib/vault/ids.ts`            | Item ids (PLAN 5.5)                                                                                                                         |
| `src/lib/vault/names.ts`          | Name rules, clashes, free names (PLAN 4.3)                                                                                                  |
| `src/lib/vault/records.ts`        | New records and `changed()`: the sync bookkeeping of every local change                                                                     |
| `src/lib/vault/tree.ts`           | `VaultIndex`: parents, paths, Trash, tree rows, Trash entries                                                                               |
| `src/lib/vault/operations.ts`     | `Vault`: every operation on items and texts                                                                                                 |
| `src/lib/vault/links.ts`          | Image links: find, look up (PLAN 4.3), rewrite on a move, follow import renames                                                             |
| `src/lib/store/state.ts`          | Typed reads and writes of the `state` store                                                                                                 |
| `src/lib/store/persist.ts`        | The persistent-storage request at every start (PLAN 4.16)                                                                                   |
| `src/lib/transfer/exportZip.ts`   | Export plan and bytes (PLAN 4.15)                                                                                                           |
| `src/lib/transfer/importFiles.ts` | Import plan, name fixes, summary (PLAN 4.15)                                                                                                |
| `src/lib/transfer/reminder.ts`    | When the export reminder shows                                                                                                              |
| `src/lib/transfer/zip.ts`         | Page side of the zip worker                                                                                                                 |
| `src/lib/transfer/zip.worker.ts`  | The worker: fflate's synchronous zip and unzip                                                                                              |
| `src/lib/transfer/zipCore.ts`     | Zip and unzip functions, shared by the worker and the tests                                                                                 |
| `src/lib/transfer/download.ts`    | Saving a Blob through the browser's download; date stamps                                                                                   |
| `src/lib/settings/schema.ts`      | Settings, defaults, ranges, safe parsing                                                                                                    |
| `src/lib/settings/store.ts`       | Settings item load and save                                                                                                                 |
| `src/lib/settings/themes.ts`      | Theme variables (Tamanduá Light)                                                                                                            |
| `src/lib/settings/fonts.ts`       | Font registry; the only file with font names                                                                                                |
| `src/lib/settings/apply.ts`       | Writes theme, fonts and sizes as CSS variables                                                                                              |
| `src/lib/workspace/model.ts`      | Panes, tabs, expanded folders; pure functions                                                                                               |
| `src/lib/workspace/store.ts`      | Workspace load and coalesced save                                                                                                           |
| `src/lib/autosave/machine.ts`     | The save state machine of PLAN 6.2 (pure)                                                                                                   |
| `src/lib/autosave/controller.ts`  | Runs it: timers, writes, retries; page hide and close                                                                                       |
| `src/lib/editor/setup.ts`         | CodeMirror source mode                                                                                                                      |
| `src/lib/editor/words.ts`         | Word count                                                                                                                                  |
| `src/lib/instance/lock.ts`        | One window at a time (PLAN 5.10)                                                                                                            |
| `src/lib/sync/rest.ts`            | All database requests; M0 has only the spike D probe                                                                                        |
| `src/lib/probe/`                  | Spike B and D probe page (next channel only)                                                                                                |
| `src/lib/ui/`                     | Components: Shell, Sidebar, FileTree, TrashView, TabBar, NoteEditor, StatusBar, Welcome, Screen, Snackbar, ConfirmDialog, ContextMenu, Icon |
| `scripts/`                        | Icons, origin and size checks, release notes, screenshots                                                                                   |
| `database.rules.json`             | Appendix B, byte for byte                                                                                                                   |
| `tests/unit/`                     | Vitest, pure logic and the vault on fake-indexeddb                                                                                          |
| `tests/rules/`                    | Vitest against the emulator                                                                                                                 |
| `tests/ui/`                       | Playwright against `vite preview` of the next and emulator builds                                                                           |
| `tests/support/`                  | Emulator helpers and UI helpers                                                                                                             |

## How builds differ by channel

`vite build --mode <mode>`: `next` and `stable` are published; `emulator` and `development` point
the next channel at `http://127.0.0.1:9000` and add it to the CSP. `vite.config.ts` defines
`__TAMANDUA_CHANNEL__`, `__TAMANDUA_EMULATOR__` and `__TAMANDUA_BUILD__`; `channel.ts` and
`build.ts` read them. Anything that differs between channels must come from `channel`.

## How to…

### …add a font for notes (PLAN 4.9)

1. `npm install --save-exact @fontsource-variable/<name>@<version>`; check its licence is OFL.
2. In `src/lib/settings/fonts.ts`, import its four Latin files (`latin` and `latin-ext`, `normal`
   and `italic`, `wght`) with `?url`, as Inter's are.
3. Add its id to `FontId`, an entry to `FONTS` (label, family name, stack with fallbacks, weight
   range, files, source, licence, one-line note), and its id to `NOTE_FONT_IDS` in display order.
4. Add it to `THIRD_PARTY_LICENSES.md`.
5. `npm run build:next && npm run check:size`, and state the fonts' new total in the change (budget
   3 MB). The unit test of the font fallback needs no change.

### …add a setting

1. Add the field with a comment to `Settings` in `src/lib/settings/schema.ts`, its default to
   `DEFAULT_SETTINGS`, a range to `RANGES` if numeric, and a line to `parseSettings`.
2. Read it as `session.settings.<name>`; components update by themselves.
3. Add a case to `tests/unit/settings-workspace.test.ts` for an invalid stored value.

### …add a field to the item metadata

Add it to `ItemMeta` in `src/lib/store/schema.ts`, set it in `vault/records.ts` (`newRecord`,
`metaOf`) and, if a local change may set it, in `ItemPatch`. If existing records need a value, add a
migration to `store/db.ts` that fills it in without deleting anything, with a test on a fixture of
the previous version. `sync/format.ts` seals every field of `ItemMeta` into `meta`; read it back in
`decodeItem` (and add it to `KNOWN_META`), and teach `tools/recover.mjs` if export uses it.

### …add a database rule

1. Edit `database.rules.json`. Tightening is free; ask Felipe before loosening anything (PLAN 5.7).
2. Add tests to `tests/rules/` for the allowed and the refused case. Run `npm run test:rules`.
3. Say in the milestone report that the rules changed: Felipe publishes them by hand, test database
   first (PLAN 1.5). Never publish them yourself.

### …add a tunable value

Add it to `src/lib/config.ts` with a comment that gives its unit, sensible range and what changes
when it moves. Import it from there; no other file may hold the number.

### …add a text shown to the user

Add it to the right group in `src/lib/strings.ts` and import it.

### …add a theme variable

Add the name to `ThemeVariable` in `src/lib/settings/themes.ts`, a value with a comment in every
theme, and, if it is a text colour, add it to the pairs of `tests/unit/themes.test.ts` (PLAN 4.9).

### …add a user action

Add a method to `Session` that calls the `Vault` (or the workspace functions) and reports a refusal
or failure through `notify`. Components call the method; they never write to the vault themselves.

### …add a file type that import accepts

Add its extension and MIME type to `IMAGE_TYPES` in `src/lib/transfer/importFiles.ts` (the limit of
`MAX_FILE_BYTES` applies), a sample to `scripts/fixtures.ts`, regenerate the fixtures, and update
the expectations in `tests/unit/transfer.test.ts`. M5 shows it in the editor.

### …add a remote origin the app may use

Do not, without asking: PLAN 5.9 allows only the app's own origin and its channel's database. The
CSP lives in `src/lib/csp.ts`; `scripts/check-origins.ts` fails the build on anything else.

### …add a UI test

Put it in `tests/ui/`, using the helpers in `tests/support/app.ts`. It runs against `vite preview`
of the next build (port 4173) or of the emulator build (port 4174). Tag it `@brave` in its title if
the Brave smoke run should include it. Assert on the tree with `expect.poll(() => treeText(page))`,
because actions are asynchronous.

### …add a new encryption format

Never change format 1 in place (PLAN 5.6). Add `enc: 2` handling beside format 1 in
`sync/format.ts` (write the new one, read both), new AAD strings in `sync/crypto.ts`, new vectors in
a new file (keep `crypto-vectors.json`), a new fixture next to `tests/fixtures/format1/`, and the
same reading in `tools/recover.mjs`. Ask Felipe first: it is a data-format decision (PLAN 10).

### Guides still to write

Written when their modules land: a Markdown element in live preview (M4), a theme (M8), a shortcut
(M6).
