# Tamanduá

An offline-first Markdown notes web app with Obsidian-style live preview, built for Brave on Fedora
and Windows. Notes live in the browser and sync, encrypted on the device, through Tamanduá's own
Firebase Realtime Database.

**Status:** milestone M0, a skeleton that proves the build, deploy and release path. There is
nothing to edit yet. `PLAN.md` describes the whole app and the order it is built in.

| Channel | Address                         | Use it for                 |
| ------- | ------------------------------- | -------------------------- |
| stable  | https://tamanduanotes.github.io | Real notes, from a release |
| next    | https://saddamdocs.github.io    | Testing; follows `main`    |

The full README (first use, devices, the sync key and passphrase, backups, export and import, the
recovery tool, Brave settings, shortcuts) is written in milestone M11.

## Development

Needs Node.js 22.18 or newer, and Java 21 or newer for the database emulator.

```bash
npm ci
npx playwright install chromium   # once, for the UI tests and the icon generator
npm run check                     # types, Svelte, lint, format
npm run test:unit
npm run test:rules                # starts the database emulator
npm run test:ui                   # builds, then Playwright inside the emulator
```

`CLAUDE.md` lists every command. `docs/ARCHITECTURE.md` maps the modules.
