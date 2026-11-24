# Decisions

Every choice the plan left open, with its reason (PLAN 10, "Deciding versus asking"). Newest
milestone last. Entries marked **asked** were approved by Felipe before they were made.

## M0: environment, skeleton and deploy

### Toolchain (checked 19 November 2026)

| Tool    | Version                                     | Notes                                                           |
| ------- | ------------------------------------------- | --------------------------------------------------------------- |
| Node.js | 22.23.1                                     | LTS line; runs `scripts/*.ts` directly (type stripping)         |
| npm     | 10.9.8                                      |                                                                 |
| Java    | OpenJDK 25.0.4.1 (Red Hat)                  | The emulator needs 21+; 25 works (spike C)                      |
| git     | 2.56.1                                      |                                                                 |
| gh      | 2.97.0                                      | Fine-grained token, expires 16 February 2027                    |
| Brave   | 157.1.99.57, `/usr/bin/brave-browser` (RPM) | Not the Snap, so the launcher problem of PLAN 11 does not apply |
| podman  | 6.1.3                                       | Not needed: Playwright runs natively (spike C)                  |

**The token's reach.** `gh api` with the token reads and writes `saddamdocs/saddamdocs.github.io`
(admin, push). The stable repository and Felipe's other repositories are listed only because they
are public: an endpoint that needs token access (`/collaborators`) returns 403 "Resource not
accessible by personal access token" on `tamanduanotes/tamanduanotes.github.io`. The token reaches
the source repository and nothing else, as PLAN 1.4 asks.

### Decisions

1. **TypeScript 6.0.3, not 7.0.2 (asked).** TypeScript 7 (the native compiler) is the latest stable,
   but `typescript-eslint` 8.73 supports TypeScript below 6.1 and `svelte-check` 4.7 supports 5 and 6:
   TypeScript 7 has no compiler JS API for them. Felipe chose 6.0.3 on 19 November 2026. Move to 7
   when both tools support it.
2. **Channel by Vite mode.** `npm run build:next` and `build:stable` run `vite build --mode <channel>`
   instead of setting `VITE_CHANNEL`. The mode also picks the output folder and the emulator, so one
   switch does all three. Two more modes exist: `emulator` (next channel, database = local emulator,
   output `dist-emulator/`, for Playwright) and `development` (`npm run dev`, also on the emulator).
   Neither is ever deployed.
3. **Database address folded at build time.** `channel.ts` holds both addresses (PLAN 10 allows them
   only there). Vite replaces `__TAMANDUA_CHANNEL__` with a literal and the bundler drops the other
   branch, so the stable build contains only `STABLE_DB` and the next build only `NEXT_DB`.
   `check:origins` proves it after every build, and fails when a build is checked as the wrong channel.
4. **The probe is left out of stable builds.** A small Vite plugin resolves the probe's import to an
   empty module in stable builds. Without it the bundler still emitted the unreachable chunk and
   Workbox precached it.
5. **No source maps in published builds.** A map of `channel.ts` would carry the other channel's
   database address, and maps are not needed by the app.
6. **Fonts start in M1.** The M0 skeleton is not the app's interface yet; it uses `system-ui`. The
   Fontsource packages were removed again until M1 needs them (PLAN 10: add a dependency only when
   it is needed). The theme colours of PLAN 4.9 are in place from M0.
7. **Allowlist of the origin check.** Strings that are never fetched: `http://www.w3.org/` (XML
   namespaces), `https://svelte.dev/e/` (Svelte's error-message links), `https://bit.ly/wb-precache`
   (a Workbox error-message link), and the CSP's own `https://*.firebasedatabase.app`.
8. **Scripts in TypeScript without a runner.** Node 22.18+ strips types, so `node scripts/x.ts`
   works and no `tsx` dependency is needed. Local imports use the `.ts` extension everywhere
   (`allowImportingTsExtensions`), and scripts use only erasable syntax (`erasableSyntaxOnly`).
9. **The header-comment rule** is a 20-line local ESLint rule in `eslint.config.js`
   (`tamandua/file-header`): TypeScript and JavaScript files must start with a block comment, Svelte
   files with an HTML comment (the `@component` doc). `jsdoc/require-jsdoc` with `publicOnly` covers
   exported functions, classes, interfaces, types and constants. Both were checked to fail on a file
   without comments.
10. **Rules tests use one emulator namespace per test file**, and load `database.rules.json` into it
    with the emulator's owner token (`PUT /.settings/rules.json?ns=…`). Files can run in parallel and
    never see each other's data. The helper refuses any database host other than `127.0.0.1` or
    `localhost`.
11. **Service worker settings.** Workbox `cacheId` is the channel prefix, so cache names are
    `tamandua-next-precache-…` (PLAN 5.9 rule 6, tested). `navigateFallback: index.html` serves
    `/?probe` and any other navigation offline. No runtime caching: database requests always go to
    the network. Precache patterns: js, css, html, svg, png, woff2, webmanifest.
12. **`SCHEMA_VERSION = 1` in `config.ts` from M0**, so release notes can state it (PLAN 9). M0
    stores nothing; M1's first IndexedDB schema is version 1.
13. **`docs/reference/Obsidian/` renamed to `docs/reference/obsidian/`**, the path the plan uses;
    Linux paths are case-sensitive.
14. **CI** uses Node 22 and Temurin Java 21 on `ubuntu-latest`, caches npm, Playwright's Chromium
    and the emulator jar, and keeps the Playwright report for 7 days when a run fails.
15. **The stable workflow refuses a next-channel archive** (its manifest name contains "(next)"), in
    addition to the tag shape and the checksum.

### Dependencies

All versions exact, pinned by `package-lock.json`. Licences read from the installed packages.

| Package                          | Version         | Licence      | Purpose                                       | Ships in the app                                                |
| -------------------------------- | --------------- | ------------ | --------------------------------------------- | --------------------------------------------------------------- |
| svelte                           | 5.58.0          | MIT          | UI framework (PLAN 3)                         | yes; the whole first-screen bundle, app included, is 18 KB gzip |
| workbox-window                   | 7.4.1           | MIT          | Service worker registration and update prompt | yes, 2.2 KB gzip                                                |
| vite                             | 8.3.8           | MIT          | Build tool                                    | no                                                              |
| @sveltejs/vite-plugin-svelte     | 7.3.1           | MIT          | Svelte in Vite                                | no                                                              |
| vite-plugin-pwa                  | 2.0.0           | MIT          | Manifest and Workbox `generateSW`             | generated SW                                                    |
| typescript                       | 6.0.3           | Apache-2.0   | Type checking                                 | no                                                              |
| svelte-check                     | 4.7.8           | MIT          | Type checking of components                   | no                                                              |
| eslint, @eslint/js               | 10.15.0, 10.0.1 | MIT          | Lint                                          | no                                                              |
| typescript-eslint                | 8.73.0          | MIT          | TypeScript rules                              | no                                                              |
| eslint-plugin-svelte             | 3.24.1          | MIT          | Svelte rules                                  | no                                                              |
| eslint-plugin-jsdoc              | 65.5.0          | BSD-3-Clause | The doc-comment rule (PLAN 10)                | no                                                              |
| globals                          | 17.14.0         | MIT          | ESLint globals                                | no                                                              |
| prettier, prettier-plugin-svelte | 3.10.1, 4.2.0   | MIT          | Formatting                                    | no                                                              |
| vitest                           | 5.1.1           | MIT          | Unit and rules tests                          | no                                                              |
| @playwright/test                 | 1.65.1          | Apache-2.0   | UI tests, Brave smoke run, icon rendering     | no                                                              |
| firebase-tools                   | 15.37.0         | MIT          | The database emulator only                    | no                                                              |
| @types/node, @tsconfig/svelte    | 26.6.6, 5.0.9   | MIT          | Types and base tsconfig                       | no                                                              |

`npm audit --omit=dev` reports 0 vulnerabilities. `npm audit` reports 16 moderate ones, all in
development tools (transitive dependencies of `firebase-tools` and `workbox-build`, through `glob`,
`uuid` and `archiver`). None of that code ships or runs in the browser; revisit when those packages
update.

### Spike A: release path (done)

What is built and proven locally:

- `deploy.yml` builds the next channel and deploys it to Pages on every push to `main`.
- `release.yml` builds the stable channel from a `vX.Y.Z` tag, checks the tag against
  `package.json`, zips `dist/` as `tamandua-stable.zip`, writes its SHA-256, and creates the GitHub
  Release with notes that state the schema version.
- `deploy/stable-deploy.yml` (Felipe pastes it into the stable repository) validates the tag,
  downloads the asset and checksum from the public release, verifies the checksum, refuses a
  next-channel archive and deploys. A local dry run of its shell steps passed: checksum OK, archive
  accepted, a malformed tag rejected.
- Playwright proves, for the next build: the service worker installs and controls the page, an
  offline reload serves the app, a navigation to `/?probe` works offline, and every cache name
  starts with `tamandua-next`.

Done on 19 November 2026:

- PR #1 merged; CI green (check 35 s, emulator-ui 1 min 24 s); "Deploy next" published NEXT_URL.
  A headless Chromium run against the live NEXT_URL: the service worker controls the page, the only
  cache is `tamandua-next-precache-v2-https://saddamdocs.github.io/`, and an offline reload and an
  offline navigation to `/?probe` both work.
- Tag `v0.0.1` → release with `tamandua-stable.zip` and its SHA-256, notes stating schema
  version 1. The stable workflow's download-and-verify steps, run locally against the public release
  URL, passed: checksum OK, a stable build (title "Tamanduá"), no probe chunk.
- PR #2 (version 0.0.2 only) merged; tag `v0.0.2` → release.

Felipe's checks on Fedora, 20 November 2026 (MANUAL_TESTS F-M0-1 to F-M0-11, all ticked): the
next app opens, installs and reopens offline; the stable workflow pasted into the stable repository
deployed `v0.0.1`; both apps installed side by side; deploying `v0.0.2` brought the "A new version
is ready" prompt, and the version changed only after Reload; deploying `v0.0.1` again put it back
the same way. Afterwards STABLE_URL serves 0.0.1 (commit `ab6b84b`), checked by fetching the page.

On Windows (Brave 158), reported by Felipe on 20 November 2026: the next app opens, installs with a
Start menu entry and reopens offline; the stable app installs beside it; deploying `v0.0.2` brought
the update prompt and deploying `v0.0.1` put it back. Spike A is complete on both systems.

### Spike B: shortcuts (done)

The probe page (`NEXT_URL/?probe`, next channel only) lists every row of PLAN 4.12 with its
fallback, marks each combination whose `keydown` reaches the page, cancels it with
`preventDefault`, and copies the results as JSON. A Playwright test proves the matcher (Alt+N,
Ctrl+Shift+\, Alt+- reach a headless page).

That test cannot show what Brave keeps for itself: Playwright injects key events into the page, past
the browser's own shortcut handling. Only Felipe's run in a Brave tab and in the installed window,
on Fedora and Windows, answers it. Expected from Chromium's behaviour: every primary reaches the
page (none is on the reserved list of PLAN 4.12), with Ctrl+O, Ctrl+S, Ctrl+P, Ctrl+F, Ctrl+H and
Ctrl+E cancelled by the page. PLAN 4.12 will be updated from the results.

Results, one JSON file per run in `docs/spike-b/`:

| Run                    | Date        | Brave         | Primaries reached | Fallbacks reached | Brave also acted |
| ---------------------- | ----------- | ------------- | ----------------- | ----------------- | ---------------- |
| Fedora, tab            | 20 Nov 2026 | 157 (Linux)   | 29 of 29          | 13 of 13          | none             |
| Fedora, installed app  | 20 Nov 2026 | 157 (Linux)   | 29 of 29          | 13 of 13          | none             |
| Windows, tab           | 20 Nov 2026 | 158 (Windows) | 29 of 29          | 13 of 13          | none             |
| Windows, installed app | 20 Nov 2026 | 158 (Windows) | 29 of 29          | 13 of 13          | none             |

On Fedora, in a tab and in the installed window alike, every shortcut of PLAN 4.12 reaches the
page and the page's `preventDefault` stops Brave's own action (Ctrl+O, Ctrl+S, Ctrl+P, Ctrl+F,
Ctrl+H, Ctrl+E included). No fallback is needed on Fedora.

Windows gives the same result, in a tab and in the installed window: every primary and every
fallback reaches the page, and Brave acts on none. (The user agent says "Windows NT 10.0" on
Windows 10 and 11 alike; Chromium freezes that string.)

**Outcome for PLAN 4.12:** every primary shortcut stands as written, on both systems, in a tab and
in the installed window. The fallbacks are not needed and are not bound; they stay in the table as
the documented plan B should a later Brave start keeping a primary. M6 binds the primaries only.

### Spike C: test tooling on Fedora (done)

- **Playwright's Chromium** (Chrome Headless Shell 159.0.8154.6, build 1255) installs into
  `~/.cache/ms-playwright` and runs natively on Fedora 45. The container fallback is not needed.
- **Brave through `executablePath`** (`/usr/bin/brave-browser`, 157.1.99.57) runs headless under
  Playwright: the three `@brave` tests pass (skeleton, offline reload, probe).
- **The Realtime Database emulator** (`firebase-database-emulator-v4.11.2.jar`, downloaded once into
  `~/.cache/firebase`) runs on OpenJDK 25 inside `firebase emulators:exec --project demo-tamandua`,
  with no login. The rules of Appendix B load without error, and 21 rules tests pass.

### Spike D: browser to database (done)

From a page of the emulator build, under the app's real content security policy plus the emulator
origin, all of these work against the emulator: `PUT` of an item; a multi-path `PATCH` of an item
and `head`; a 401 on a wrong revision; `print=silent` answering 204 with an empty body; server
timestamps; the `ns` parameter isolating namespaces; and an `EventSource` on `head` that delivers
the initial `put` and later `put` events for the page's own writes and for another client's. No CSP
violation is reported. The emulator answers cross-origin requests (CORS) from the preview server.

The probe button sends one `GET` for `/tamandua/<32 random characters>/head.json` through
`sync/rest.ts`. Against an emulator namespace in locked mode it reports PASS (401). At NEXT_URL in
Brave on Fedora, against the real locked `NEXT_DB`, Felipe's press of the button gave (20 November
2026): "PASS: the database answered 401, as expected for a locked database." Brave's Shields (at
their defaults) and the content security policy let requests to `*.firebasedatabase.app` through;
no Shields exception is needed. On Windows (Brave 158) the same press gave PASS twice, in a tab and
in the installed window.

## M1: vault, tree and plain editor

### Decisions

1. **Names are stored in Unicode NFC.** A name typed with dead keys (decomposed) and the same name
   typed composed are one name, so "ação" cannot appear twice in a folder.
2. **Names may not start with a dot.** Import skips every entry whose name starts with a dot
   (PLAN 4.15), so such a name would export but never import back, breaking R12's round trip.
3. **Reserved Windows names are checked on the export name**: a note `con` exports as `con.md`,
   which Windows also refuses, so it is rejected; `COM10` and `console` are allowed.
4. **Sibling clashes compare export names**, ignoring case: a note `plan` (`plan.md`) and a folder
   `plan` (`plan/`) may sit side by side.
5. **Restoring an item whose folder is no longer live** creates a new folder with that folder's name
   under the root (or "Restored" if the name is unknown) and puts the item in it, as PLAN 4.3 says.
   Other contents of the old folder stay in the Trash.
6. **Delete forever, locally:** an item never uploaded (`rev` 0) is removed outright; one that was
   uploaded keeps a local tombstone (`gone`, still dirty) so the deletion can upload in M3a. Text,
   file and snapshots go either way.
7. **A move into a folder that already has an item of that name is refused** with the reason, not
   renamed. A restore or an Undo that meets a clash renames with ` (2)` instead, because the user
   did not choose the target.
8. **Moves can be undone** from the snackbar, like deletions.
9. **The Trash is a sidebar view** in place of the tree (PLAN 4.9 lists the Trash view under
   `--sidebar`), opened and closed with the Trash button.
10. **The vault's name in the sidebar is "Notes"**, as in the layout sketch of PLAN 4.1; the plan
    gives the vault no other name.
11. **Buttons of features still to come** (search, calendar, settings) are shown disabled with the
    milestone in their tooltip, so the sidebar already has its final layout.
12. **Folder expansion survives the Trash**: a folder deleted and then restored, or undone, comes
    back expanded if it was. Expanded state is forgotten only when an item is deleted forever.
13. **The save state machine of PLAN 6.2 is built in M1**, because the plain editor must save. M2
    adds the failure banner, the persistent-storage request and their tests.
14. **Workspace saves**: opening or closing a tab or a folder is written after 50 ms; cursor and
    scroll positions after 1 s, coalesced. Both are written at once when the page is hidden.
15. **The editor has no focus ring**: CodeMirror shows focus with its cursor, and the ring of
    PLAN 4.9 drew gold bars beside the text column. Every other focusable element has the ring.
16. **Fonts in M1: Inter and JetBrains Mono** (Latin and Latin Extended, upright and italic,
    396 KB in all). The three other note fonts arrive with the font setting in M8.
17. **Device name**: Brave hides its name from the user agent, so the default name ("Linux ·
    Brave") uses `navigator.brave.isBrave()`. Playwright's Chromium is named "Linux · Chrome".
18. **ESLint parses `*.svelte.ts`** (rune modules) with the Svelte parser and the TypeScript parser.
19. **The 5.10 rule "Clipboard images" is tested in M5**, where pasting images is built. The other
    rules of 5.10 each have a Playwright test in `tests/ui/hardening.spec.ts`.
20. **Size to watch:** `@codemirror/lang-markdown` imports `@codemirror/lang-html` at module level,
    which brings the HTML, CSS and JavaScript grammars into the main bundle (the first-screen
    JavaScript is 208 KB of the 300 KB budget). Notes never render HTML (PLAN 4.2), so M4, which
    rebuilds the parser setup for live preview, should build the Markdown language without
    `lang-html`.

### Copied from Obsidian, not verified against the screenshots

The screenshots in `docs/reference/obsidian/` show the layout, the tree and the tabs. They do not
show these behaviours, which follow Obsidian as I know it (PLAN 10):

- A new folder is named `Untitled`, then `Untitled 1`, like a new note.
- Duplicating `plan` makes `plan 1`, beside it, with the text only. Folders are not duplicated.
- A click on a folder row toggles it; the tree shows chevrons for folders and no icons for notes.
- Leaving the rename field keeps a valid name and drops an invalid one with a notice. Obsidian
  focuses a new note's inline title in the editor; Tamanduá has no inline title, so the name is
  edited in the tree.
- Closing the active tab activates its right neighbour, else its left.

### Changed at the M1 gate (Felipe, 24 November 2026)

- **Tree indent:** notes keep no empty chevron space, so a note's first letter lines up with the
  chevrons of the folders beside it (asked with sketches of three layouts; Felipe chose this one).
  Files show their icon where a folder has its chevron.
- **Settings icon:** a cogwheel with eight teeth, drawn for Tamanduá.

M1 accepted with these changes.

### Dependencies added in M1

| Package                                     | Version                        | Licence    | Purpose                                      |
| ------------------------------------------- | ------------------------------ | ---------- | -------------------------------------------- |
| idb                                         | 8.0.4                          | ISC        | Typed promise wrapper for IndexedDB (PLAN 3) |
| @codemirror/state, view, commands, language | 6.7.6, 6.43.15, 6.11.1, 6.13.1 | MIT        | The editor (PLAN 3)                          |
| @codemirror/lang-markdown                   | 6.5.2                          | MIT        | Markdown language support                    |
| @lezer/markdown                             | 1.8.1                          | MIT        | The parser and its GFM extensions            |
| @lezer/highlight                            | 1.2.5                          | MIT        | Highlight tags for the source-mode colours   |
| @fontsource-variable/inter                  | 5.3.0                          | OFL-1.1    | Interface font and default note font         |
| @fontsource-variable/jetbrains-mono         | 5.3.0                          | OFL-1.1    | Code font                                    |
| fake-indexeddb (dev)                        | 6.2.8                          | Apache-2.0 | IndexedDB in Vitest                          |

`npm audit --omit=dev` still reports 0 vulnerabilities.

## M2: saving, history, and plain Markdown in and out

### Decisions

1. **Image links on a move (PLAN 4.3).** A link is rewritten when its path names a file from the
   note's old folder and would not name the same file from the new one. Links that only worked
   through the same-name fallback keep working the same way and are left as written; links to
   missing images stay as written. Undo rewrites the links back from where the note is then, to
   their shortest path, so edits made after the move are kept and a move plus its Undo gives back
   the original text. Links inside code spans and fenced blocks are not links.
2. **Link paths are written with `%20`, `%28`, `%29` and `%25`** for spaces, parentheses and percent
   signs, so a rewritten link is always valid Markdown; reading decodes them.
3. **An open note whose links a move rewrote reloads in its editor**, which loses that tab's undo
   history in this one case. M3b builds the in-place apply of remote changes (PLAN 6.3) and can take
   this over.
4. **Snapshots keep the current text**, taken after 5 minutes idle and when a tab closes, only if
   the note was edited in that tab, subject to the 10-minute rule in the vault. Restore first keeps a
   forced snapshot of the current text (reason "before a restore"), then replaces the text through
   the editor as one transaction, so Ctrl+Z undoes it and autosave stores it.
5. **Export layout.** Every folder gets a folder entry, empty or not. Names that clash ignoring case
   get ` (2)` in creation order, before a file's extension (`map (2).png`). Images are stored without
   recompression. fflate sets the ZIP UTF-8 flag on non-ASCII names (checked byte by byte and with
   Python's `zipfile`), so accented names unpack correctly on Windows.
6. **The Trash in an export** is offered for the whole vault only; inside `.trash/`, a deleted
   folder keeps everything it held.
7. **Import, the ` (2)` rule for folders:** a folder whose path already exists in the target is
   imported as `name (2)` with its contents inside, as PLAN 4.15 says ("the imported one gets (2) and
   nothing existing is changed"). Items of the same import that clash ignoring case also get ` (2)`,
   in source order.
8. **Import, hidden entries:** the folders above a hidden entry are created (a folder holding only
   `.gitkeep` or `.DS_Store` arrives empty); each hidden folder is listed once in the summary.
9. **Import, name fixes:** `_` for each forbidden or control character and for each trailing dot or
   space; `_` after a reserved Windows name (`CON_`, `aux_.png`); 200 characters at most. Links in the
   same import follow a renamed image, also when its old name contained `:`.
10. **Import sources:** one picker takes `.md`, `.markdown`, images and `.zip` files together (loose
    files land in the target, a zip's top level too); a second picker takes a folder, whose own name
    is dropped from the paths.
11. **fflate runs in a worker of our own** (`transfer/zip.worker.ts`), with its synchronous
    functions: its asynchronous API starts workers from `blob:` URLs, which `worker-src 'self'`
    forbids (PLAN 5.9). The worker is precached, so export and import work offline.
12. **The reminder's "changed since the last export"** is computed from the items' `updated` times,
    instead of a `changedSinceExport` flag that every save would have to write.
13. **The Settings dialog starts in M2**, with Files ("Show all files") and Data (export, import);
    the Settings button is enabled. M8 adds the appearance and other settings, M3c Sync, M11 About.
14. **"Remove all data from this device"** (PLAN 4.5, Settings → Data) arrives with Settings → Sync
    in M3c, where disconnecting is built too.
15. **Unit tests have their own `tsconfig.test.json`** with Node's types for reading fixtures; the app
    keeps browser types only.
16. **The import fixtures** come from `scripts/fixtures.ts`. Names Windows refuses on disk (`what?`,
    `CON`, `a:b.png`) and a `.git/` folder (Git will not track one inside a repository) are only inside
    `source.zip`. `.gitattributes` marks the fixtures `-text` so the CRLF note and the byte-order mark
    survive any checkout.
17. **The failure banner is tested** by making IndexedDB writes to `texts` throw from a test init
    script, as a full disk would.

### Dependency added in M2

| Package | Version | Licence | Purpose                                      | Ships                          |
| ------- | ------- | ------- | -------------------------------------------- | ------------------------------ |
| fflate  | 0.8.3   | MIT     | Zip and unzip for export and import (PLAN 3) | yes, in the zip worker (13 KB) |

`npm audit --omit=dev`: 0 vulnerabilities.
