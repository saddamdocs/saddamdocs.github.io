# Progress

Updated at the end of every session (PLAN 10, "Process").

## Status

| Milestone | State                                                             |
| --------- | ----------------------------------------------------------------- |
| M0        | Built; waiting for Felipe's checks (spike A deploys, spikes B, D) |
| M1 to M11 | Not started                                                       |

## M0: environment, skeleton and deploy

Branch `m0-skeleton`.

| #   | Task                                                                         | State                                     |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Check the table of 1.4, the ticks of section 12, the toolchain and token     | done                                      |
| 2   | Scaffold Vite, Svelte 5, TypeScript; `channel.ts` with the two channels      | done                                      |
| 3   | Manifest, icons (Appendix A), service worker with update prompt              | done                                      |
| 4   | `npm run check`: tsc, svelte-check, ESLint with doc-comment rules, Prettier  | done                                      |
| 5   | `database.rules.json` (Appendix B) and the first rules tests                 | done                                      |
| 6   | Workflows: `ci.yml`, `deploy.yml`, `release.yml`, `deploy/stable-deploy.yml` | done                                      |
| 7   | `CLAUDE.md`, README, CHANGELOG, licences, `docs/`                            | done                                      |
| 8   | Spike B: shortcut probe page                                                 | built; Brave results pending              |
| 9   | Spike C: Playwright Chromium, Brave, emulator                                | done                                      |
| 10  | Spike D: browser to emulator; probe button for NEXT_DB                       | emulator done; NEXT_DB pending            |
| 11  | Merge to `main`, next channel live, tag `v0.0.1` and `v0.0.2`                | done (PR #1, #2; releases v0.0.1, v0.0.2) |
| 12  | Spike A: Felipe deploys `v0.0.1`, `v0.0.2`, puts `v0.0.1` back               | pending (Felipe)                          |
| 13  | Update PLAN 4.12 from spike B; write spike A up                              | pending (after Felipe's results)          |

## Next

- Felipe's M0 checks (`docs/MANUAL_TESTS.md`, M0), then fill in spikes A, B and D in `DECISIONS.md`
  and update PLAN 4.12 from the probe's results.
- After Felipe accepts M0: tag `m0`, then start M1.

## Blockers

None.
