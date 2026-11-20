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

### Spike A: release path (Fedora done; Windows pending)

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

Still open: the Windows checks W-M0-1 (open and install), W-M0-2 (offline) and W-M0-5 (stable app
and update on Windows).

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
