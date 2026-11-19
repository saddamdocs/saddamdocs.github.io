# Architecture

A map of the modules and short guides for later changes (PLAN 10, "Comments and maintainability").
Keep it in step with the code: a stale entry is a defect. PLAN 5 describes the target design; this
file describes what exists now.

## Module map (M0)

| Path                         | Job                                                                     |
| ---------------------------- | ----------------------------------------------------------------------- |
| `index.html`                 | The page; CSP, title and splash colours filled in at build time         |
| `vite.config.ts`             | Modes (channels), defines, HTML placeholders, PWA plugin, probe stub    |
| `src/main.ts`                | Applies the theme, mounts `App.svelte`, removes the splash              |
| `src/App.svelte`             | M0 skeleton screen, update snackbar, entry to the probe                 |
| `src/app.css`                | Global element styles, buttons, the focus ring of PLAN 4.9              |
| `src/lib/channel.ts`         | Channel table and the running `channel`; the only home of database URLs |
| `src/lib/config.ts`          | Every tunable value, with unit and range                                |
| `src/lib/build.ts`           | Version, commit and build date injected by Vite                         |
| `src/lib/csp.ts`             | The content security policy text (PLAN 5.9)                             |
| `src/lib/strings.ts`         | Every text shown to the user                                            |
| `src/lib/updates.ts`         | Service worker registration, hourly update check, reload on request     |
| `src/lib/settings/themes.ts` | Theme variables and their values (Tamanduá Light)                       |
| `src/lib/sync/rest.ts`       | All database requests; M0 has only the spike D probe                    |
| `src/lib/probe/`             | Spike B and D probe page (next channel only)                            |
| `scripts/icons.ts`           | Renders `public/icons/*.png` from the SVGs with Playwright              |
| `scripts/check-origins.ts`   | PLAN 5.9 rule 4 on a build                                              |
| `scripts/check-size.ts`      | PLAN 8 size budgets on a build                                          |
| `scripts/release-notes.ts`   | Release body with the schema version                                    |
| `database.rules.json`        | Appendix B, byte for byte                                               |
| `tests/unit/`                | Vitest, pure logic                                                      |
| `tests/rules/`               | Vitest against the emulator                                             |
| `tests/ui/`                  | Playwright against `vite preview` of the next and emulator builds       |
| `tests/support/emulator.ts`  | Emulator helpers: namespaces, rules loading, REST, test keys            |

## How builds differ by channel

`vite build --mode <mode>`: `next` and `stable` are published; `emulator` and `development` point
the next channel at `http://127.0.0.1:9000` and add it to the CSP. `vite.config.ts` defines
`__TAMANDUA_CHANNEL__`, `__TAMANDUA_EMULATOR__` and `__TAMANDUA_BUILD__`; `channel.ts` and
`build.ts` read them. Anything that differs between channels must come from `channel`.

## How to…

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

### …add a remote origin the app may use

Do not, without asking: PLAN 5.9 allows only the app's own origin and its channel's database. The
CSP lives in `src/lib/csp.ts`; `scripts/check-origins.ts` fails the build on anything else.

### …add a UI test

Put it in `tests/ui/`. It runs against `vite preview` of the next build (port 4173) or of the
emulator build (port 4174, see `playwright.config.ts`). Tag it `@brave` in its title if the Brave
smoke run should include it.

### Guides still to write

Written when their modules land: a Markdown element in live preview (M4), a setting (M8), a theme
(M8), a font (M8, PLAN 4.9 asks for a step-by-step guide), a shortcut (M6), a field of the item
metadata (M3a), a new encryption format (M3a).
