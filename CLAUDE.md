# Working notes for the agent

Tamanduá is an offline-first Markdown notes web app. `PLAN.md` is the source of truth; this file is
a short reminder of commands and conventions. At the start of every session, read
`docs/PROGRESS.md` and `docs/DECISIONS.md` first (PLAN 10, "Process").

## Commands

| Command                               | What it does                                                             |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `npm run check`                       | tsc (app and node configs), svelte-check, ESLint, Prettier. Must pass.   |
| `npm run test:unit`                   | Vitest, `tests/unit/`                                                    |
| `npm run test:rules`                  | Vitest against the database emulator, `tests/rules/`                     |
| `npm run test:ui`                     | Builds next and emulator, then Playwright (Chromium) inside the emulator |
| `npm run test:brave`                  | The `@brave` tests in the installed Brave (local only, never CI)         |
| `npm run build:next` / `build:stable` | Published builds into `dist/`                                            |
| `npm run build:emulator`              | Next channel pointed at the emulator, into `dist-emulator/` (tests only) |
| `npm run check:origins -- <channel>`  | PLAN 5.9 rule 4 on `dist/`                                               |
| `npm run check:size`                  | PLAN 8 size budgets on `dist/`                                           |
| `npm run icons`                       | Regenerates `public/icons/*.png` from the SVGs                           |
| `npm run format`                      | Prettier, write mode                                                     |

The emulator needs Java 21+ and runs only through `firebase emulators:exec --project demo-tamandua`.

## Conventions

- Svelte 5 runes only (`runes: true` is forced in `svelte.config.js`). TypeScript strict.
- Every file starts with a header comment; every export has a `/** */` doc comment. Lint enforces
  both (`tamandua/file-header`, `jsdoc/require-jsdoc`). Cite the plan: "PLAN 6.3".
- Tunables live in `src/lib/config.ts`, user-visible text in `src/lib/strings.ts`, colours in
  `src/lib/settings/themes.ts`, channel values and database addresses only in `src/lib/channel.ts`.
- Every storage, cache, lock and channel name starts with the channel prefix (`storageName()`).
- Imports of local TypeScript files use the `.ts` extension (Node runs `scripts/` with type
  stripping, no build step).
- Work on a branch `m<N>-<name>`, open a PR, let CI pass, merge. Tag `m<N>` only after Felipe accepts.
- Verify APIs against `node_modules` type definitions; do not write CodeMirror, Workbox or
  vite-plugin-pwa code from memory.

## Safety (PLAN 10, short form)

- Never `sudo`; never touch anything outside this folder, the system temp dir, `~/.cache/ms-playwright`
  and `~/.cache/firebase`.
- Never send a request to `NEXT_DB` or `STABLE_DB`. Never `firebase login`, `deploy`, `use` or
  `database:*`. Never publish rules. Only the emulator, only `demo-tamandua`.
- Never ask for or use Felipe's sync key or passphrase.
- Deploy next only by merging to `main`. Never touch the stable repository; tag a release only when
  Felipe asks.
- No `git push --force`, no `git reset --hard` on pushed history, no `git clean -fdx` without asking.
