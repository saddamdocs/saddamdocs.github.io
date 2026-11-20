# Progress

Updated at the end of every session (PLAN 10, "Process").

## Status

| Milestone | State                                               |
| --------- | --------------------------------------------------- |
| M0        | Accepted by Felipe on 20 November 2026; tagged `m0` |
| M1 to M11 | Not started                                         |

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

## Next

- M1: vault, tree and plain editor (on this device only).

## Blockers

None.
