# Tamanduá: development plan for an offline-first Markdown notes web app

18 November 2026 · Felipe Pavan · revision 2 (first version: 17 November 2026)

This plan replaces the desktop plan of 11 November 2026 (Tauri). Tamanduá becomes a web app: it opens in the browser at an address of its own (`STABLE_URL`, section 1.4), installs as an app from Brave on Fedora and Windows, works with no network, and syncs through its own Firebase database when the network returns. It keeps the desktop plan's editor, live preview, calendar, text colour and working rules, gives the app a look of its own (4.9), and is complete on its own: the agent needs no other document.

Revision 2 follows a review of the first version. Section 1.11 lists what changed.

Section 1 is for Felipe. Sections 2 to 13 and the appendices are for the implementing agent.

## 1. Before you start (for Felipe)

### 1.1 What changed from the desktop plan

| Topic | Desktop plan (11 Nov) | This plan |
|---|---|---|
| What it is | Installed Tauri app with a Rust core | Static web app (a PWA): HTML, CSS and TypeScript served by GitHub Pages. Brave can install it as an app with its own window and launcher. |
| Installation | `.rpm` and `-setup.exe` built by CI | None. Open the address once; install as an app if you like. |
| Where notes live | `.md` files in a vault folder in Dropbox | In the browser's own storage (IndexedDB) on each device, plus an encrypted copy in Firebase. Export a `.zip` of plain `.md` files in their folders at any time, and import them back (4.15). |
| Sync | Dropbox, outside the app | Built in, through Tamanduá's own Firebase Realtime Database, under `/tamandua/<key>`. |
| Privacy | No network at all | Every note, name and image is encrypted on the device before upload. The database only sees scrambled text, sizes and timestamps. |
| Repository | Private | Public (needed for GitHub Pages on a free account). The code holds no secrets; the database addresses are public by nature. |
| Rust, WebKitGTK, NVIDIA workarounds, installers | Needed | Gone. One rendering engine (Chromium, through Brave), so testing is simpler. |
| Look | A plain grey light theme and Solarized, with a magenta accent | Tamanduá's own light theme in the icon's colours plus the gold `#E0A43A`, Solarized as the alternative, and the font for notes chosen from a short list of reading fonts. |
| Version history | Dropbox kept old versions | Tamanduá keeps 20 local snapshots per note on each device, a Trash for 30 days, and conflict copies. |
| What the move costs | Dropbox did the sync, the history and the backup, and any editor could open the files | All three are now Tamanduá's own job, and the copies live in a browser profile and in an encrypted database. The plan answers with plain Markdown export and a reminder to use it (4.15), a recovery tool that needs neither the app nor a browser (4.15), a sync engine tested by simulation (section 8), and early releases, so that problems show long before version 1 (section 9). |

### 1.2 Why these choices

| Question | Answer |
|---|---|
| Is a web app really offline? | Yes, after the first visit. A service worker keeps the whole app on the device, and the notes live in the browser's database. Opening, editing, searching and exporting never wait for the network. Changes queue on the device and upload when the connection returns. |
| Why Firebase, and why projects of its own? | Firebase's Realtime Database is free on the Spark plan and works with plain REST requests, a secret key in the path instead of a login, and encryption in the browser. Tamanduá gets two projects of its own, one per channel (1.7). Nothing it does can then touch another project's data, rules or quota, and test code can never reach the real vault. |
| Why addresses of its own? | A browser keeps one storage area per site address, not per path. Everything published under one `github.io` name shares that area, and any page there can read it or be cleared with it. Two GitHub organisations give the stable app and the test app an address each, shared with nothing. |
| Why no Firebase library? | On the web, the library keeps its offline copy and its unsent changes only in memory, so they are lost when the page closes. Tamanduá keeps its own queue in IndexedDB anyway, so plain REST requests are enough, and they keep the app smaller and easier to test. |
| Why always encrypted? | The sync key travels in every request address, so Firebase's logs see it. With encryption, the key alone shows nothing but scrambled text. |
| What if I forget the passphrase? | Every device that already has the notes keeps them, readable, and can export them. Set up a new key and passphrase from such a device (section 4.5). Without any device, the copy in Firebase cannot be read by anyone. Keep the passphrase in your password manager. |
| What if I lose the sync key? | The key is the name of your vault's branch in the database, so the Firebase console shows it under `/tamandua`. Keep it in your password manager with the passphrase anyway: a device whose storage was cleared needs both. |
| Can I get my notes out without the app? | Yes, in two ways. "Export vault" writes every note as an ordinary `.md` file in its folder (4.15). And `tools/recover.mjs`, a small script that needs only Node.js, rebuilds the same folders from the encrypted database with your key and passphrase, even if the app and every browser are gone. |
| What does the free plan allow? | 1 GB stored and 10 GB downloaded a month for each project, and 100 open connections at a time. Text notes use little of it; images use the most. Settings show an estimate of the vault's size. |

### 1.3 What to install on Fedora

Run these yourself. The plan forbids the agent from using `sudo`.

| Tool | Why |
|---|---|
| Claude Code | The agent that writes, builds and tests the app. It needs a Pro, Max, Team, Enterprise or Console account. |
| Git and the GitHub CLI | Version control, pull requests and releases, with the token of section 1.4. |
| Node.js, LTS version | Builds and tests the app. It also runs the recovery tool (4.15). |
| Java 21 or newer (headless JDK) | Runs Firebase's local database emulator, which all sync tests use. The app itself never needs Java. |
| Brave | Already installed. It is the browser Tamanduá is built and tested for. |

```bash
# Claude Code (a dnf repository also exists; see the setup page)
curl -fsSL https://claude.ai/install.sh | bash

# Git, GitHub CLI, Node.js
sudo dnf install git gh nodejs

# Java for the Firebase emulator (use the 25 package if Fedora offers no 21)
sudo dnf install java-21-openjdk-headless
```

The agent re-checks the versions in milestone M0 and tells you if anything is missing. Nothing has to be installed on Windows.

### 1.4 GitHub

Tamanduá lives at two addresses of its own, one per channel (1.7). GitHub gives each organisation one site address, so create two free organisations. Pick any names that are free and write them in this table. The rest of the plan uses the names in the first column, and the agent reads the values from here.

| Name in this plan | What it is                                                        | Your value                                                            |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `NEXT_ORG`        | Organisation for the test channel. It also holds the source code. | saddamdocs                                                            |
| `STABLE_ORG`      | Organisation for the stable app                                   | tamanduanotes                                                         |
| `NEXT_URL`        | The test app's address                                            | https://saddamdocs.github.io                                          |
| `STABLE_URL`      | The stable app's address                                          | https://tamanduanotes.github.io                                       |
| `NEXT_DB`         | The test database's address (1.5)                                 | https://tamandua-test-default-rtdb.europe-west1.firebasedatabase.app  |
| `STABLE_DB`       | The production database's address (1.5)                           | https://tamandua-notes-default-rtdb.europe-west1.firebasedatabase.app |

1. Create the two organisations on the Free plan (your picture → Your organizations → New organization).
2. In `NEXT_ORG`, create a **public** repository named `NEXT_ORG.github.io`. This is the **source repository**: all the code lives here, and every merge to `main` publishes the test channel at `NEXT_URL`.
3. In `STABLE_ORG`, create a **public** repository named `STABLE_ORG.github.io`. This is the **stable repository**. It holds one workflow file and nothing else; in M0 the agent gives you that file to paste in.
4. In both repositories: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
5. Create a token for the agent that reaches the source repository and nothing else: your picture → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token. Resource owner: `NEXT_ORG`. Repository access: only `NEXT_ORG.github.io`. Repository permissions, read and write: Contents, Pull requests, Actions and Workflows. Give it an expiry of 90 days and renew it when it lapses.
6. Log the GitHub CLI in with that token and let git use it. This replaces any other `gh` login on the laptop.

   ```bash
   gh auth login --with-token < token.txt   # then delete token.txt
   gh auth setup-git
   ```

7. Clone the source repository over HTTPS into your Fedora home, for example `~/code/tamandua`. Over HTTPS, pushes use the token and not an SSH key of yours, so the agent can reach neither your other repositories nor the stable one.
8. Put these files in it:
   - `PLAN.md`: this document, with the table above filled in and the open lines of section 12 ticked.
   - `docs/reference/icon.svg`: the tamanduá-bandeira icon (`tamandua-bandeira.svg` from the icon chat, also printed in Appendix A).
   - `docs/reference/whatweekisit.jpg`: your calendar screenshot.
   - `docs/reference/obsidian/`: five or six screenshots of Obsidian with its default light theme, because the agent cannot run Obsidian and the plan tells it to copy Obsidian where it is silent. Take the whole window with the sidebar and two tabs; one note with headings, lists, tasks, a quote, a code block and a table, once with the cursor elsewhere and once with the cursor inside a bold word and a heading; a split view; the quick switcher; and the Appearance settings.

### 1.5 Firebase

Tamanduá uses two Firebase projects of its own, both on the free Spark plan: one for the test channel and one for your real notes. Create them before M0:

1. In the Firebase console, add a project for testing (for example `tamandua-test`) and one for production (for example `tamandua-notes`). Analytics is not needed.
2. In each: Build → Realtime Database → Create database, location **Belgium (europe-west1)**, in **locked mode**.
3. Copy each database's address, which ends in `.firebasedatabase.app`, into the table of 1.4 as `NEXT_DB` and `STABLE_DB`.

The databases stay locked until the rules are ready. The agent gives you `database.rules.json` (Appendix B) and you publish it by hand, in Realtime Database → Rules:

- to the **test** database at the M3a gate;
- to the **production** database before the first stable release that has sync. The agent's report says when.

Any later change to the rules goes to the test database first, is tried on the test channel, and only then goes to production.

The agent never logs in to Firebase and never sends a request to either database. All its tests run against Firebase's local emulator.

### 1.6 Brave

- Tamanduá keeps your notes in Brave's site storage. Make sure Brave never clears it: in the Shields panel for `STABLE_URL`, "Forget me when I close this site" must be off, and the site must not be on any "clear data on exit" list. Do the same for `NEXT_URL`, so that test notes survive between gates.
- "Clear browsing data" with "Cookies and other site data" ticked erases the notes on that device, whatever else is set. Export first (4.15), or leave that box unticked.
- After M0, open both addresses and install each from Brave's menu ("Install Tamanduá", "Install Tamanduá (next)"). Each app then has its own window and launcher on Fedora and Windows: "Tamanduá" for your notes and "Tamanduá (next)" for testing.

### 1.7 Two copies of the app: stable and next

| Address | Built from | Database | Use it for |
|---|---|---|---|
| `STABLE_URL` | A release whose deploy you started yourself (`vX.Y.Z` tag) | `STABLE_DB` | Your real notes, with your real sync key |
| `NEXT_URL` | The newest milestone the agent finished | `NEXT_DB` | Testing at every gate, with test keys and test notes |

The two share nothing: each has its own address, so its own browser storage, and its own database. The agent publishes the test channel by merging its work. Only you can publish the stable app: you start its deploy by hand in the stable repository (section 9), and the agent's token cannot reach it.

M0 releases two skeletons, `v0.0.1` and `v0.0.2`, to prove that path. From M3c on, the agent's report says at each gate whether the milestone is worth releasing. You decide: tell the agent "release it", then run the deploy.

### 1.8 Handing the plan to the agent

1. Open a terminal in the repository folder, run `claude`, and paste the kickoff prompt from section 13.
2. The agent stops after each milestone with a report and a short list of things to try at `NEXT_URL`. Reply "go" to continue.

### 1.9 Cautions

- **Never give the agent your sync key or passphrase**, and never paste them into an issue, a commit or a chat. The agent only ever uses test keys in the emulator.
- **The passphrase cannot be recovered.** Use four or more random words. Store the passphrase **and the sync key** in your password manager: a device whose storage was cleared needs both.
- **The laptop dual-boots.** Section 10 forbids the agent from touching the bootloader, any Windows partition, or anything outside the project folder and its caches.
- **Real notes wait for a stable release with sync.** Use the test channel only with test notes. From the first stable release with sync, real notes are welcome on one condition while the version is below 1.0: export a `.zip` every week. The app reminds you (4.15).
- **Releases are yours.** Nothing reaches `STABLE_URL` unless you run the deploy.

### 1.10 What to expect while it is built

- You test on Fedora at every gate, in Brave at `NEXT_URL`: about ten minutes at most gates, and about half an hour at M3a, M3b, M3c and M4, where sync and typing are judged. You test on Windows four times, after M0, M3c, M6 and M11, on any Windows PC with Brave.
- Claude Code asks before it runs commands. Approve commands that stay inside the project folder. Do not start it in a mode that skips permission checks, and never type your sudo password for it.
- In M0 the agent will ask to download browsers for testing (Playwright's Chromium) and the Firebase emulator. Both are expected, and both go into caches in your home folder.
- The work spans many sessions over days or weeks. Starting a new session is normal: the agent picks up from its progress file.

### 1.11 What changed in revision 2

| Area | First version (17 Nov) | Revision 2 (18 Nov) |
|---|---|---|
| Address | `saddamware.github.io/tamandua/` and `/tamandua/next/`, on the homepage's site | Two GitHub organisations: one address each for stable and next, shared with nothing (1.4) |
| Database | The homepage's, under a new branch | Two Firebase projects of Tamanduá's own, one per channel (1.5). The homepage is no longer part of the plan. |
| Releases | A tag deployed stable automatically | The agent tags; you start the stable deploy by hand. An older release that you put back stays until you deploy again (section 9). |
| The agent's access | Your normal `gh` login | A token limited to the source repository (1.4) |
| Deletions against edits | The later action won, by upload time | A deletion stands only if its device had seen the latest changes (4.3, 6.3) |
| The Trash | No defined clock; a purged folder's notes could reappear | Counted in the database's time; a purged folder takes its contents with it |
| Deleted forever | A plain marker that anyone with the key could write | A sealed marker that only a device with the passphrase can write |
| Sync timing | R5 and the budgets disagreed; the upload delay was undefined | One timeline (5.8): in the database 3 s after typing stops, on the other device 2 s later |
| Saving | The browser's default durability; storage persistence asked once | Strict durability; persistence asked at every start until granted |
| History and undo | A snapshot before every remote change; undo unclear | Remote changes fill history at most once per 10 minutes and are never undone by Ctrl+Z |
| Plain Markdown | Export and import, listed with other features | A requirement of its own (R12), with an export reminder and a recovery tool (4.15) |
| Images | Links by path, with no rule for moves | Defined for moving, duplicating and deleting notes (4.3) |
| PDF | markdown-it, plugins unnamed | The plugins are listed, and one list of cases tests the editor and the PDF together (4.11) |
| Milestones | Sync in one gate; some checks placed before their features | Sync in three gates (M3a to M3c); shortcuts and the Windows PDF checked when they exist |
| Tests | Two-device scenarios | The same, plus a seeded simulation of three devices (section 8) |
| Reference for Obsidian | The agent's memory | Screenshots in `docs/reference/obsidian/` |
| Search across notes | A copy of every note kept in a worker, with no rule for keeping it current | The worker reads the notes afresh for each search, sized for the expected vault of about 200 notes (4.7) |

## 2. Brief for the LLM

Build a fast, offline-first web app for writing Markdown notes with Obsidian-style live preview. It runs in Brave on Fedora 45 and Windows 10 and 11, installs as a progressive web app, keeps every note on the device, and syncs encrypted copies through its own Firebase Realtime Database when online. It is a static site on GitHub Pages: there is no server code.

The app is called **Tamanduá**, Portuguese for anteater. Write `tamandua`, without the accent, wherever plain ASCII is needed: the repository, package name, storage names, cache names and file names.

Everything from here to the end is written for you, the implementing agent. Section 1 is for Felipe, the owner. Treat this document as the source of truth and keep it in the repository as `PLAN.md`.

The names `NEXT_ORG`, `STABLE_ORG`, `NEXT_URL`, `STABLE_URL`, `NEXT_DB` and `STABLE_DB` stand for the values Felipe wrote in the table of section 1.4. If any of them is still empty, stop and ask before starting M0.

### Hard requirements

| ID | Requirement | How it is proven |
|---|---|---|
| R1 | A static web app served from `STABLE_URL` (stable) and `NEXT_URL` (test): two separate origins that share no storage, no service worker and no database. It works in current Brave on Fedora 44 (GNOME, Wayland) and on Windows 10 and 11, and installs as an app from Brave's menu. Other current Chromium browsers (Chrome, Edge) must work too. | Felipe's checks at the gates of M0, M3c, M6 and M11 |
| R2 | Offline-first. After one visit, the app opens, edits, creates, renames, deletes, searches, exports and prints with no network. Nothing on the editing path waits for the network. | End-to-end tests run with the network cut off |
| R3 | Live preview: Markdown renders in place while typing. Syntax markers hide unless the cursor touches them. The stored text stays plain Markdown. | Element table in 4.2, golden tests |
| R4 | Autosave: every edit is stored on the device within 1 s of the last keystroke, with strict durability (4.4), and once stored it survives a closed tab, a crash or a reboot. Closing the tab or the window loses nothing. No save button is needed, and the app shows no save prompt of its own. The browser's "Leave site?" appears only if a save has not finished when the page closes (4.4). | End-to-end test closes the page mid-typing and reopens it |
| R5 | Sync: while online, an edit is in the database within 3 s after typing stops, and within 15 s during unbroken typing (5.8). Another device that is open and online shows it within 2 s more if the note is open there, and within 30 s more otherwise, without a reload. Edits made offline upload when the connection returns. Concurrent edits are merged; when they cannot be merged, both versions are kept. A deletion never overrides a change that its device had not seen (4.3). No change is ever dropped silently. | Sync tests with two and three devices against the emulator, and the simulation (section 8) |
| R6 | Privacy: note text, names, folder names, settings and images are encrypted on the device before upload (format in 5.6). The database only sees ids, revision numbers, timestamps, sizes, kinds and deletion flags. No accounts, no analytics, no requests to any third party. | Format tests, a check of every stored field, and the content security policy |
| R7 | No graph view, backlinks, wikilinks, tags pane, canvas or any other "linked ideas" feature. | Non-goals below |
| R8 | A calendar with ISO week numbers, modelled on whatweekisit.org. | Section 4.8 |
| R9 | The look is Tamanduá's own, built from its icon (4.9). In Settings the user picks the font for all notes from a list of bundled reading fonts, its size, and the Tamanduá Light (default) or Solarized Light theme. The choices sync between devices. | Section 4.9 |
| R10 | Tabs, a side-by-side split view, search across all notes, LaTeX math, text colour and export to PDF. | Sections 4.6, 4.7, 4.10, 4.11, 4.14 |
| R11 | Fast: meets the budgets in section 8. | Measured in M3c, M5, M7 and M11 |
| R12 | Plain Markdown in and out. The whole vault, or one folder, exports at any time as unencrypted `.md` files nested in their folders, with their images, in one `.zip`. A folder, a `.zip` or loose `.md` files import the same way, keeping the folder structure. Both work offline, with sync off and with the passphrase forgotten. A stand-alone tool rebuilds the same folders from the encrypted database without the app. | Section 4.15. Exporting and then importing into an empty vault reproduces every path, text and image byte for byte. The recovery tool reproduces a fixture vault exactly. |
| R13 | The code is commented for later changes: a header comment in every file and a doc comment on every exported item. | A lint rule, and the gate in section 7 |

### Non-goals for version 1

Do not build these, even if they look easy. Ask first if one seems necessary.

- Wikilinks `[[...]]`, embeds `![[...]]`, backlinks, links that open another note, graph, tags, canvas, callouts, Dataview-style queries, Mermaid.
- Plugins, community themes, a command palette, Vim mode.
- Firebase Authentication or any other login, sharing with other people, real-time co-editing of one note by several people, telemetry, crash reporting.
- A phone layout, touch-first editing, Firefox or Safari as targets (they may work; nothing is tested or fixed for them), a dark theme, multiple vaults.
- Keeping a live folder of `.md` files on disk. The File System Access API is off by default in Brave, so files move only through import and export (4.15).
- A separate reading view, cell-by-cell table editing, templates, daily notes.
- Rendering raw HTML from notes (the colour span of 4.14 is the single exception), loading images from the internet.

### Definition of done

- Every gate in section 7 is accepted by Felipe: M0 to M11, with M3 in three parts.
- CI is green on the final commit.
- Release `v1.0.0` is deployed at `STABLE_URL` and installs from Brave on Fedora and Windows.
- `docs/MANUAL_TESTS.md` has been passed by Felipe on both systems.
- `README.md` explains first use, adding a device, the sync key and passphrase and where to keep them, backups, export and import of Markdown, the recovery tool, the Brave settings of 1.6, and every shortcut.
- `database.rules.json` in the repository is exactly what Felipe published to both databases.

## 3. Decisions already made

The stack is fixed: a static TypeScript, Svelte 5 and CodeMirror 6 app built with Vite, kept offline by a service worker, storing data in IndexedDB and syncing through Firebase's REST API. If a decision below proves unworkable, stop and ask. Do not substitute silently.

| Area | Decision | Reason |
|---|---|---|
| Platform | Static progressive web app on GitHub Pages, one organisation site per channel: `STABLE_URL` and `NEXT_URL`, each at the root of its own origin. The public source repository is `NEXT_ORG/NEXT_ORG.github.io`; the stable repository, `STABLE_ORG/STABLE_ORG.github.io`, holds only a deploy workflow (section 9). | Felipe's choice. No installer, and it works on any computer with Brave. With an origin of its own, nothing else can read or clear the notes, and test code cannot reach real ones. |
| Target browser | Brave, current release, on Fedora 44 and Windows 10 and 11. Chrome and Edge must also work. | Felipe uses Brave. All three share the Chromium engine, so one engine is tested. |
| Language | TypeScript with `strict` on | Types catch API misuse early. |
| Build tool | Vite, latest stable, with `base` `/` and the channel set at build time | Fast builds and code splitting. |
| UI framework | Svelte 5, runes syntax only | Compiles to small output with little boilerplate. No component library. No SvelteKit: this is one page. |
| Editor | CodeMirror 6 with `@codemirror/lang-markdown`, CommonMark plus GFM | The editor engine Obsidian uses. Its decorations API is what makes live preview possible. |
| Live preview | Our own CodeMirror extension (section 6.1) | It must match the table in 4.2 exactly. Existing open-source packages are references, not dependencies. |
| Math | KaTeX, its fonts served by the app, loaded on first use | Works offline and renders synchronously once loaded. |
| Export rendering | markdown-it with `html: false` and the rules listed in 4.11, highlight.js for code, all loaded on first use | Used only to build the page that is printed to PDF. One list of cases keeps it in step with the editor's parser (4.11). |
| Offline shell | `vite-plugin-pwa` (Workbox `generateSW`), precaching every built file, update by prompt | The whole app opens from the device. A new version never replaces a running one without the user's click. |
| Local store | IndexedDB through the `idb` package, with `durability: 'strict'` on every transaction that writes user data | The browser's durable database. `idb` is a thin, typed promise wrapper of about 1 KB. Since Chrome 121 the default durability is relaxed, which reports success before the data is on disk. |
| Sync backend | Firebase Realtime Databases of Tamanduá's own, on the Spark plan: `STABLE_DB` for the stable channel and `NEXT_DB` for next, each under `/tamandua/<key>` | Felipe's choice (18 November 2026). Free, reachable with plain REST, and separate from every other project's data, rules and quota. |
| Sync transport | Firebase REST API with `fetch` and `XMLHttpRequest` (for progress), and one `EventSource` stream on a tiny node. No Firebase SDK. | Small, and every request is explicit and testable. |
| Access control | A 32-character random sync key in the path. No login. | Felipe's model. Its limits are listed in section 11. |
| Encryption | Web Crypto: PBKDF2-HMAC-SHA-256 with 600,000 rounds gives an AES-256-GCM key. Text is compressed with `CompressionStream('deflate-raw')` before encryption. Exact format in 5.6. | Felipe chose "always encrypted". Compression makes stored text two to three times smaller, which matters on the free plan. |
| Three-way merge | `node-diff3`, line-based | Merges edits made on two devices, like git does. |
| Deletions | A deletion stands only if the device that made it had seen the latest changes; otherwise the change wins (4.3, 6.3). No device clock takes part. | Losing an edit to a stale deletion is the costliest mistake a sync engine can make. |
| Zip | `fflate` | Small and fast, for export and import. |
| Plain Markdown | Export and import of unencrypted `.md` files in nested folders, as a `.zip` or a folder, and `tools/recover.mjs`, a stand-alone Node.js script with no dependencies (4.15) | The notes must never depend on the app, the browser or the database being available. |
| Search | A Web Worker that reads the notes from IndexedDB afresh for each search and scans them: substring or regex, no index, and no copy kept between searches | Nothing to keep in sync and nothing stored, so a result can never be out of date. Fast enough for the expected vault of at most about 200 notes (4.7; budget in section 8). |
| One instance | Web Locks API plus `BroadcastChannel` | Only one window or tab edits at a time (5.10). |
| Fonts | Bundled open-licence fonts from Fontsource: Inter for the interface; for notes, a list of reading fonts (4.9) with Inter as the default; JetBrains Mono for code | Chosen for reading on screens. Bundled fonts look the same on every computer and work offline, and Brave on Windows shows sites only a random selection of installed fonts. |
| App state | Notes, files, settings and the sync queue in IndexedDB. Settings also sync as an encrypted item. Each device's workspace (open tabs and so on) stays on that device. | Settings travel between devices as Felipe asked. Open tabs and cursor positions belong to one device. |
| Package manager | npm | Ships with Node.js. |
| Tests | Vitest, Playwright (Chromium; Brave locally), Firebase's Realtime Database emulator for rules and sync tests, and a seeded simulation of three devices | Section 8. |
| Quality gates | ESLint (with a doc-comment rule), Prettier, `svelte-check`, `tsc --noEmit` | One command, `npm run check`, runs all of them. |
| CI and deploy | GitHub Actions. In the source repository: `ci.yml` for checks and tests, `deploy.yml` for the next channel, `release.yml` for release assets. In the stable repository: one workflow that Felipe starts by hand (section 9). | Public repositories get Actions minutes free. No workflow needs a secret. |
| Licences | Dependencies must be MIT, Apache-2.0, BSD, ISC, or SIL OFL for fonts | No GPL or AGPL code. |
| Versions | Latest stable of everything at project start, pinned by the committed lockfile | No pre-releases. |
| Visual design | Tamanduá's own, from the icon's colours plus the gold `#E0A43A` (4.9). | Felipe's choice. |
| Themes | Tamanduá Light (default) and Solarized Light, as two value sets for the same CSS variables. No dark theme. | Felipe's choice. |
| Text colour | Stored in the note as one fixed HTML span with a hex colour, parsed and validated by the app (4.14) | Markdown has no colour syntax, and Obsidian displays the same pattern. |
| Code comments | A header comment per file and a doc comment per exported item, enforced by lint (section 10) | The code must stay easy to change later. |

Using only Chromium removes the desktop plan's biggest testing cost: there is one rendering engine, and Playwright's Chromium is close to Brave's. Brave's own behaviour (Shields, storage, fonts, installing) is checked by hand at each gate.

## 4. Product specification

The app is one page that looks like one window: a file sidebar, one or two editor panes with their tab bars, and a status bar. Each subsection below is a contract. Where it is silent, copy Obsidian's behaviour as the screenshots in `docs/reference/obsidian/` show it, and record the choice in `docs/DECISIONS.md`. What the screenshots do not show, take from your knowledge of Obsidian and report it as unverified (section 10).

### 4.1 Window layout

```text
+-------------+---------------------------+---------------------------+
| [+] [F] [S] | [ Note A ] [ Note B ] [+] | [ Note C ] [ Calendar ]   |
| [C] [T] [⚙] +---------------------------+---------------------------+
|             |                           |                           |
| Notes       |   left pane               |   right pane              |
|   ideas/    |   (the only pane until    |   (appears after          |
|     plan    |    the view is split)     |    "Split right")         |
|   todo      |                           |                           |
+-------------+---------------------------+---------------------------+
| ideas/plan.md        Saved  .  Synced  .  312 words  .  WN 47        |
+---------------------------------------------------------------------+
```

- **Sidebar**: resizable from 180 to 480 px, hidden or shown with Ctrl+\. Buttons: new note, new folder, search, calendar, Trash, settings. Below them, the vault's name and its tree of folders, subfolders and notes. Search results replace the tree while a search is active.
- **Editor area**: one pane, or two side by side after a split (4.6). Each pane has its own tab bar. A text-colour button (4.14) and a split button sit at the right end of the tab bar.
- **Status bar**: the focused note's path, its save state on this device ("Saving", "Saved"), the sync chip (4.5), the word count, and a week chip ("WN 47") that opens the calendar.
- **First launch**: a welcome screen with the app icon and three choices: "Start a new synced vault", "Connect to my vault" and "Use only on this device for now" (4.5). Later launches reopen the vault and this device's workspace.
- **Banners** appear at the top of a pane for problems that need a decision (a merge that kept both versions, a failed save, a moved sync key). A small snackbar at the bottom gives short notices with an optional action ("Undo", "Reload").

### 4.2 Editor and live preview

The editor always holds the plain Markdown text and only restyles it. Four rules govern every element:

1. **Touching.** An element is "touched" when any cursor or selection overlaps its range, ends included. Touched elements show their raw syntax. All others render.
2. **Scope.** Inline elements reveal only themselves. Line markers (`#`, `>`) reveal when the cursor is on that line. Blocks (code, table, math) reveal when the cursor is anywhere inside.
3. **No jumping.** Revealing inline or line syntax must not change line height. Only images, tables and block math may change vertical layout.
4. **Source mode.** Ctrl+E switches the current tab between live preview and plain highlighted source.

| Element         | Markdown                                                     | Cursor elsewhere                                                                               | Cursor touching                           |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Heading 1 to 6  | `# Title`                                                    | Larger bold text, `#` hidden                                                                   | `#` shown, size unchanged                 |
| Bold            | `**text**`, `__text__`                                       | Bold, markers hidden                                                                           | Markers shown                             |
| Italic          | `*text*`, `_text_`                                           | Italic, markers hidden                                                                         | Markers shown                             |
| Strikethrough   | `~~text~~`                                                   | Struck through                                                                                 | Markers shown                             |
| Highlight       | `==text==`                                                   | Tinted background                                                                              | Markers shown                             |
| Inline code     | `` `code` ``                                                 | Monospace on a tinted background                                                               | Backticks shown                           |
| Link            | `[text](url)`                                                | Only `text`, styled as a link. Ctrl+click opens it.                                            | Full source shown                         |
| Bare URL        | `https://...`                                                | Styled as a link. Ctrl+click opens it.                                                         | Unchanged                                 |
| Image           | `![alt](path)`                                               | The image from this vault, scaled to the column width                                          | Source line shown above the image         |
| Bullet list     | `- item`                                                     | Marker drawn as a dot. Nested levels indent. Wrapped lines align with the text.                | Marker character shown                    |
| Numbered list   | `1. item`                                                    | Number styled, kept as typed                                                                   | Unchanged                                 |
| Task            | `- [ ] todo`, `- [x] done`                                   | Clickable checkbox. Done items dim.                                                            | `[ ]` shown                               |
| Quote           | `> text`                                                     | Left bar, `>` hidden                                                                           | `>` shown on the cursor's line            |
| Code block      | Fenced, with optional language                               | Monospace box with syntax colours, fences hidden, language label top right                     | Fences shown                              |
| Horizontal rule | `---`                                                        | A thin line                                                                                    | Source shown                              |
| Table           | GFM pipe table                                               | Rendered table with header and alignment                                                       | Raw source in monospace                   |
| Inline math     | `$x^2$`                                                      | Rendered by KaTeX                                                                              | Source shown                              |
| Block math      | `$$ ... $$`                                                  | Centred formula                                                                                | Source shown, formula stays visible below |
| Footnote        | `[^1]`, `[^1]: text`                                         | Reference raised and styled                                                                    | Unchanged                                 |
| Front matter    | YAML between `---` lines at the top                          | Dim monospace block, never hidden                                                              | Unchanged                                 |
| Escape          | `\*`                                                         | Backslash hidden                                                                               | Backslash shown                           |
| Coloured text   | `<span style="color:#dc322f">text</span>`                    | The text in that colour, tags hidden (4.14)                                                    | Tags shown                                |
| Raw HTML        | `<b>x</b>`                                                   | Dim source text. Never rendered, never executed. The colour span of 4.14 is the one exception. | Unchanged                                 |
| Not supported   | `[[link]]`, `![[embed]]`, `#tag`, `> [!note]`, `%%comment%%` | Plain text with no special behaviour                                                           | Unchanged                                 |

**Typing behaviour**

- Enter continues lists, tasks and quotes. Enter on an empty item ends the list.
- Tab and Shift+Tab indent and outdent list items.
- Ctrl+B, Ctrl+I and Ctrl+K wrap the selection as bold, italic or a link.
- Brackets, quotes and backticks auto-pair. Typing a marker over a selection wraps it.
- Pasting a URL over selected text makes a link.
- Pasting or dropping an image stores it as a file in the note's folder (or in an `attachments` subfolder, per 4.13) named `pasted-YYYYMMDD-HHMMSS.png`, with no spaces so the link is valid Markdown, and inserts `![](pasted-YYYYMMDD-HHMMSS.png)`. PNG, JPEG, GIF, WebP and SVG are accepted, up to 7 MB, which is the sync limit. A larger image is refused with a message that names the limit.
- Clicking a task checkbox toggles `[ ]` and `[x]` in the text without moving the cursor.
- Undo history is per tab and lasts until the tab closes. It holds this device's own edits only: Ctrl+Z never undoes a change that arrived from another device (6.2).
- Spellcheck is the browser's own. The editor keeps the browser's right-click menu, so spelling suggestions, cut, copy and paste work as everywhere else in Brave. It is not an acceptance criterion.

**Accented input.** Dead-key and compose sequences, as used for Portuguese (á, ã, ç, ê, õ), must work everywhere, including directly beside hidden syntax. A decoration change must never interrupt a composition (6.1).

### 4.3 The vault: folders, notes and files

- All notes live in one **vault** per browser profile and channel. It is stored in the browser (IndexedDB) and, when sync is on, copied to the database. There is no folder on the disk; `.md` files come in through import and go out through export (4.15).
- The vault holds three kinds of item: **notes** (Markdown text), **folders**, and **files** (images used by notes). Every item has a permanent random id, a name and a parent folder. Paths such as `ideas/plan.md` are computed from names; they are never stored as keys, so renaming or moving a folder is a single change.
- **Folders and subfolders** nest to any depth. The sidebar shows them as a tree: folders first, then notes, in natural case-insensitive order. Folders expand and collapse, and that state is remembered on this device.
- The tree shows notes and folders. Files stay hidden unless "Show all files" is on; then they appear with their own icon and open in a simple image viewer tab.
- Actions, by button, right-click menu or shortcut: new note, new folder, new subfolder inside the selected folder, rename (F2), delete to the Trash (Delete), move between folders by drag and drop, duplicate, copy path, download as `.md`, history (below).
- A new note is created at once as `Untitled` (then `Untitled 1`, and so on) in the selected folder, opened, with its name ready to edit. There is never an unnamed, unsaved buffer.
- **Names.** The tree shows note names without `.md`; export adds it. Names must be valid as file names on both Windows and Linux, so export never fails: reject `< > : " / \ | ? *`, control characters, trailing dots or spaces, reserved Windows names (`CON`, `PRN`, `AUX`, `NUL`, `COM1` to `COM9`, `LPT1` to `LPT9`), names over 200 characters, and names that differ from a sibling only by letter case. Two devices can still create such siblings while offline; the tree then shows both with a small "same name" mark, and export adds ` (2)` to the later one.
- **Text** is a JavaScript string. Line endings are stored as `\n`; import converts `\r\n` and drops a byte-order mark (4.15).

**Image links**

- A note points at an image by a relative path, as in `![](pasted-20261118-101500.png)` or `![](attachments/map.png)`. The path is looked up from the note's folder. If nothing is there, a file with the same name elsewhere in the vault is used when exactly one exists. Otherwise the editor shows a "missing image" box that names the path.
- **Moving a note** to another folder rewrites its relative image links so that they point at the same files, which stay where they are. The rewrite is part of the move and is undone with it.
- **Moving or renaming a folder** rewrites nothing. Links between items inside the folder still hold, and the lookup above covers links that cross its edge.
- **Duplicating a note** copies its text only. Both notes show the same images.
- **Deleting a note** leaves its images in place.
- **Moving or renaming an image** (possible with "Show all files") rewrites no links. A moved image is found by the lookup above. A renamed one shows as missing until the link is edited.

**The Trash**

- Deleting a note, file or folder moves it to the Trash. Deleting a folder marks only the folder: everything inside is hidden with it, and its contents are not changed one by one. An item counts as in the Trash when it is marked deleted itself or lies inside a deleted folder.
- The Trash view lists deleted items, newest first, with the date and the device that deleted them. A deleted folder is one entry that shows how many items it holds. Actions: Restore (back to its folder, recreating a missing parent folder under the root), Delete forever, and Empty Trash. "Confirm before deleting forever" (4.13) asks before Delete forever and Empty Trash only, because ordinary deletion is undoable: the snackbar offers Undo for 5 s.
- **Deleting a folder forever takes its contents with it.** Every item inside the folder at that moment is deleted forever too, the deepest first and the folder last, whether the user does it or the 30 days run out. Nothing that was inside a purged folder reappears at the root.
- Items stay in the Trash for 30 days (a setting, 7 to 365), then any device deletes them forever. **With sync on, the 30 days are counted in the database's time, never by a device clock**: from the database time of the upload that put the item in the Trash to the latest database time this device has seen (6.3). A deletion that has not been uploaded yet is never purged. With sync off there is no database time, and the device's own clock is used.
- **A deletion stands only if the device that made it had seen the latest changes.** If a note is deleted on one device while another device changes it, the change wins and the note stays. If a folder is deleted on one device while another device edits, adds or moves in anything inside it, the change wins and the folder comes back with its contents. The snackbar says why. It makes no difference which device connects first, and no clocks are compared. The exact rules are in 6.3.

**Local snapshots (history)**

- The database keeps no old versions, so each device keeps up to 20 snapshots of every note that changes on it, in its own storage. They are never synced.
- A snapshot is taken when a note was edited and then left alone for 5 minutes, when its tab closes, and just before a change from another device is applied to it. At most one snapshot is taken per note per 10 minutes. The single exception is a merge: when a change from another device meets edits that this device has not uploaded yet, the text is always snapshotted first. A device that only receives another device's typing therefore adds one snapshot per 10 minutes, not one per upload.
- "History" in the tab's menu lists the snapshots with their times. Choosing one shows it read-only beside the current text; "Restore" puts its text into the note as one ordinary, undoable edit, which then syncs.

**Edge cases**

- **Nothing to save.** A note with no edits is never written, not even on Ctrl+S.
- **Renaming, moving or deleting an open note.** Its tab follows a rename or a move. Deleting an open note, or a folder that holds open notes, closes those tabs; Undo reopens them.
- **Path identity.** Two paths name the same item when they match ignoring letter case, as on Windows.
- **Cycles.** Two devices can move folder A into B and B into A while offline. The sync engine breaks such a cycle (6.3), so the tree never loops.
- **Keyboard in the tree.** Up and Down move, Right and Left expand and collapse, Enter opens, Ctrl+Enter opens in a new tab, F2 renames, Delete deletes. Every action in the app is reachable without a mouse and shows a visible focus ring.

### 4.4 Saving on this device

- An edit is stored in IndexedDB 300 ms after the last keystroke, and no later than 2 s after the first unsaved keystroke during continuous typing.
- A save also happens at once when the tab or window loses focus, a tab closes, the page is hidden or closed (`visibilitychange`, `pagehide`), or Ctrl+S is pressed. Ctrl+S also asks sync to upload now.
- Each save is one IndexedDB transaction that writes the text, the item's metadata and its "needs upload" mark together, so the sync queue can never miss a saved edit. The transaction asks for `durability: 'strict'`, so "Saved" means the data has been handed to the disk and not only to the operating system's buffer.
- The status bar shows "Saving" and then "Saved". There are no save dialogs and no "unsaved changes" prompts. The single exception: if an edit has not reached IndexedDB when the page is closing, the browser's standard "Leave site?" prompt is requested.
- A failed save (storage full, browser storage disabled) shows a banner with Retry and "Export now", keeps the text in memory, and retries after 2 s, 5 s, 15 s and then every 30 s.
- The exact state machine is in section 6.2.

### 4.5 Sync between devices

Sync is optional and can be turned on at any time from Settings → Sync. Everything else in the app works the same with it off.

**Setting it up**

| Choice | What happens |
|---|---|
| Start a new synced vault | The user names this device (default: the operating system and browser, for example "Linux · Brave") and types a passphrase twice. The app creates a sync key, writes the vault's `info` record (5.5), uploads every note already on the device, and shows the key with a Copy button and this advice: store the key and the passphrase in your password manager, and enter both on your other devices. |
| Connect to my vault | The user pastes the key, types the passphrase and names the device. The app checks the passphrase against `info` before anything else, then downloads the vault with a progress bar and merges it with any notes already on the device (6.3, "reconcile"). |
| Use only on this device for now | No key, and no requests to the database. Settings → Sync can connect later. |

- **The sync key** is 32 letters and digits (A–Z, a–z, 0–9). It is shown in groups of four for reading; spaces and dashes typed with it are ignored.
- **The passphrase** must have at least 12 characters. The form explains, in plain words, that anyone who obtains the key can try guesses offline, so four or more random words are best, and that a forgotten passphrase cannot be recovered. It shows no strength score.
- **The derived key** is kept on the device as a non-extractable Web Crypto key. The passphrase itself is never stored. "Forget the passphrase on this device" removes the derived key; sync then pauses until the passphrase is typed again, while the notes stay readable on the device.

**The sync chip in the status bar**

| Chip | Meaning |
|---|---|
| (none) | Sync is off |
| Synced | Everything on this device is in the database, and the stream is connected |
| Syncing… | Uploads or downloads are running, with a count on hover |
| Offline · 3 waiting | No connection; three items wait to upload. Nothing else is blocked. |
| Paused · passphrase needed | The derived key was forgotten on this device |
| Moved · new key needed | The vault moved to a new key on another device (below) |
| Sync problem | A request failed in a way that needs attention, or an item in the database could not be read. Clicking opens the details, with Retry and, for an item that cannot be read, "Overwrite with this device's copy" (below). |

**Changes from other devices**

| What happens elsewhere | What this device does |
|---|---|
| A note, file or folder is created, renamed, moved or deleted | The tree updates within 30 s while the app is visible and online, and at once when it regains focus |
| An open note changes and has no unsynced edits here | The editor updates in place. Cursor, scroll position and undo history survive, and Ctrl+Z does not undo the other device's change. |
| An open note changes while it has unsynced edits here | The two versions are merged (6.3). If the edits touch different lines, the merged text appears in place and nothing else is shown. If they overlap, this device keeps its own text in the note, and the other version becomes a new note beside it, named `<name> (conflict 2026-11-17 2140, <device>)`. A banner in the note says so and offers "Open the other version". Neither version is ever dropped. |
| An open note is deleted elsewhere, directly or with its folder | If this device has changes to the note that the deleting device had not seen, the change wins: the note and its folders stay or come back, and the snackbar says so (4.3, 6.3). Otherwise the note goes to the Trash, its tab closes, and the snackbar offers Undo. |
| The app becomes visible again, regains focus or comes back online | It catches up at once |

**Offline.** Edits, new notes, renames and deletions are stored on the device and queued. Nothing waits for the network. When the connection returns, the queue uploads in the order the changes were made, with the one exception named in 5.8.

**Settings → Sync** shows: the key (hidden until "Show"), Copy key, this device's name, the last successful sync, an estimate of the vault's size in the database against the free plan's 1 GB, "Check passphrase", "Forget the passphrase on this device", "Repair sync", "Move to a new key" and "Disconnect this device". The estimate adds up what this vault has stored; the Firebase console shows the true total.

- **Repair sync** downloads the whole vault again and reconciles it with this device (6.3). Nothing is deleted on either side.
- **Overwrite with this device's copy** is offered in the sync details for an item whose version in the database cannot be read (6.3). It uploads this device's version as the next revision, so sync never stays stuck on such an item.
- **Move to a new key** creates a new key, a new salt and a new passphrase, uploads everything from this device under the new key, and marks the old key as moved. Other devices then show "Your vault moved to a new key", stop syncing, and ask for the new key and passphrase. This is also the way to change the passphrase, and the way out when the passphrase is forgotten but a device still holds the notes. The old key's data stays in the database until Felipe deletes `/tamandua/<old key>` in the Firebase console; Settings says so.
- **Disconnect this device** stops sync and forgets the key and the derived key. The notes stay on the device.
- **Remove all data from this device** (Settings → Data) deletes the vault from this browser after suggesting an export. With sync on, nothing is deleted from the database.

### 4.6 Tabs, split view and navigation

- Clicking a note in the tree opens it in the current tab of the focused pane. Ctrl+click or middle-click opens a new tab. A setting, "Always open in a new tab", flips the default.
- A note is open in at most one tab, counting both panes. Opening it again focuses the tab it already has.
- Tabs reorder by drag. Alt+W closes, middle-click closes, Alt+PageDown and Alt+PageUp cycle within the focused pane.
- **Split view.** The editor area can be split into two panes side by side, to show two notes at once. Ways to split: "Split right" in a tab's right-click menu, the split button at the right end of the tab bar, Ctrl+Shift+\, or dragging a tab to the right edge of the editor area.
- Each pane has its own tab bar. The divider between the panes drags to resize, with a minimum of 320 px per pane, and a double-click sets it back to half. Tabs drag from one pane to the other. Alt+1 and Alt+2 focus the left and the right pane.
- Closing a pane's last tab closes that pane. Two panes is the limit in version 1, and there is no top-and-bottom split.
- Find, replace, source mode, text colour, history and export act on the focused pane. The status bar describes the focused note. The Calendar tab can sit in either pane.
- Quick switcher (Ctrl+O): fuzzy search over note names and paths. Enter opens, Ctrl+Enter opens in a new tab. If nothing matches, Enter creates a note with that name.
- The workspace is restored on launch from this device's storage: both panes and the divider position, their tabs, the active tab, each tab's cursor and scroll position, and the expanded folders. A tab whose note no longer exists is skipped silently.
- Ctrl+click on an `http`, `https` or `mailto` link opens it in a new browser tab, with `noopener` and `noreferrer`. From the installed app it opens in Brave. No other link is followed. A link that points to another note or to a local file is styled as a link and does nothing when clicked.

### 4.7 Search

- In the note: Ctrl+F finds, Ctrl+H replaces. Options: match case, whole word, regex. A match count is shown. Enter and Shift+Enter step through matches.
- Across all notes: Ctrl+Shift+F opens search in the sidebar. Results appear as you type after a 150 ms pause, grouped by note, each showing the matching line with the match highlighted.
- Clicking a result opens the note at that match. Results are capped at 1,000 matches, with a notice when the cap is hit.
- A search first saves any pending edits. The worker then reads the notes afresh from IndexedDB, in one read-only transaction over `items` and `texts`, scans them, and keeps nothing afterwards. Every search therefore sees the current text of every note, whether the last change was typed here, arrived from another device, or came from an import, a deletion or a restore. There is no copy to keep up to date.
- Each pause in typing is one search and one read. A newer search cancels the one before it.
- **Size.** Felipe expects at most about 200 notes. The cost follows the total amount of text, not the number of notes: a test in headless Chromium on 18 November 2026 read and scanned 1 MB of notes in about 17 ms, 10 MB in about 100 ms and 25 MB in about 340 ms. The budget of section 8 therefore holds up to roughly 10 MB of text in all. If the vault ever outgrows that, the next step, approved in advance but not built in version 1, is to keep the texts in the worker and send it each note that changes.
- Notes in the Trash and files are not searched.

### 4.8 Calendar

The calendar is a full-year view with ISO week numbers, laid out like whatweekisit.org. It is display-only: no events and no notes attached to days. Felipe's screenshot of the reference is in the repository at `docs/reference/whatweekisit.jpg`. Match it.

**Where it lives.** It opens as a tab named "Calendar" from the sidebar button, the status-bar week chip, or Alt+C. It always opens on the current year.

**Layout, top to bottom**

1. A one-line summary that names the current week and year, for example "Week 47 of 2026", with the week number and year in `--accent-text` (4.9). Write this line in our own words; do not copy the site's sentence.
2. A year switcher, right-aligned: `2025 | 2026 | 2027`. Previous and next are links. The shown year is bold and in `--accent-text`. When the shown year is not the current one, add a "Today" link.
3. Twelve month blocks in a grid: four per row on a wide pane, then three, two or one as the pane narrows. A block is never narrower than 220 px.
4. Each block has a title, "January 2026", bold italic and right-aligned, above a table. The table's header row is `--dark` with `--on-dark` text (dark green and cream in Tamanduá Light): `WN Mon Tue Wed Thu Fri Sat Sun`.
5. One table row per ISO week that overlaps the month, so four to six rows (February 2027 has exactly four, weeks 05 to 08). The first cell is the week number, two digits with a leading zero, bold and in `--text-muted`. Days belonging to neighbouring months are in muted text; the month's own days are in the body colour.
6. The current week's row, week number included, has the gold accent as background and bold text in `--dark`. If that week spans two months, it is highlighted in both blocks.
7. A footer line with the year's facts, in our own words: whether it is a leap year, how many ISO weeks it has, and the weekdays of 1 January and 31 December. For 2026: not a leap year, 53 weeks, starts and ends on a Thursday.

**Rules**

- ISO 8601: weeks run Monday to Sunday, and week 1 is the week containing January 4th. Days at the edge of a year can belong to a week of the neighbouring year.
- The highlight and the status-bar chip update at local midnight and whenever the window regains focus.
- The colours are the theme's (4.9). The reference's magenta is not used.
- Month and weekday names are English in version 1.
- Date logic lives in pure functions in `src/lib/calendar/weeks.ts`, with no date library: `isoWeek(y, m, d)`, `weeksInIsoYear(y)`, `monthRows(y, m)`, `yearFacts(y)`.
- Do the arithmetic on year, month and day numbers through `Date.UTC`. Never use local-time `Date` objects for it, so time zones and daylight saving cannot shift a day.

**Test vectors.** These were computed independently and agree with the reference screenshot.

| Input | Expected |
|---|---|
| 2026-11-11 | 2026-W46, a Wednesday |
| 2026-11-17 | 2026-W47, a Tuesday |
| 2025-12-29 | 2026-W01 (the Monday that starts it) |
| 2026-01-01 | 2026-W01 |
| 2026-12-31 | 2026-W53 |
| 2027-01-03 | 2026-W53 |
| 2027-01-04 | 2027-W01 |
| 2024-12-30 | 2025-W01 |
| 2021-01-03 | 2020-W53 |
| Weeks in ISO year | 2020: 53, 2024: 52, 2025: 52, 2026: 53, 2027: 52, 2028: 52, 2032: 53, 2037: 53 |
| Rows per month, 2026 | Jan 01-05, Feb 05-09, Mar 09-14, Apr 14-18, May 18-22, Jun 23-27, Jul 27-31, Aug 31-36, Sep 36-40, Oct 40-44, Nov 44-49, Dec 49-53 |
| Year facts, 2026 | Not a leap year, 53 weeks, starts on a Thursday, ends on a Thursday |

### 4.9 Look, themes and fonts

Tamanduá has a visual design of its own, made from its icon. The layout follows Obsidian's default for spacing, sizes and proportions, as the screenshots in `docs/reference/obsidian/` show it; the colours and fonts are the ones below.

**Two themes.** Tamanduá Light is the default. It uses only the icon's colours, the nib gold `#E0A43A`, tints of them mixed with white, and one red for errors. Solarized Light is the alternative, for reading in Solarized's colours. Both set the same CSS variables, declared in `src/lib/settings/themes.ts`. There is no dark theme, and the system's dark-mode setting is ignored: set `color-scheme: light` so that no dark styling leaks into scrollbars, dialogs or form controls.

| Variable | Tamanduá Light | Solarized Light | Used for |
|---|---|---|---|
| `--paper` | `#FCF9F3`: the icon's cream with 75% white | `#fdf6e3` | Editor, dialogs, the active tab |
| `--sidebar` | `#F8F1E5`: cream with 45% white | `#eee8d5` | Sidebar, Trash view |
| `--panel` | `#F2E6CF`: the icon's cream | `#eee8d5` | Tab bar, status bar, code blocks, inline code |
| `--hover` | `#E9DCC3`: the icon's light cream | `#DFDCCB` | Hovered and selected rows in the tree and in menus |
| `--border` | `#CFC0A3`: the icon's shaded cream | `#D7D6C8` | Dividers, the pane divider, scrollbar thumbs |
| `--text` | `#1F3A34`: the icon's dark green | `#657b83` | Body text, icons |
| `--heading` | `#1F3A34` | `#586e75` | Headings, bold text |
| `--text-muted` | `#4B605A`: dark green with 20% paper | `#93a1a1` | Paths, counts, week numbers, done tasks, comments in code, outlines of inputs and checkboxes |
| `--dark` | `#1F3A34` | `#073642` | Fills: primary buttons, checked task boxes, the snackbar, tooltips, the calendar's header row |
| `--on-dark` | `#F2E6CF` | `#fdf6e3` | Text and ticks on `--dark` |
| `--accent` | `#E0A43A`: the nib gold | `#E0A43A` | The active tab's top line, the selected row's left bar, the current week, link underlines, quote bars, the outer ring of focus, the snackbar's action |
| `--accent-text` | `#7B5A20`: gold with 45% black | `#7B5A20` | Gold-coloured text on light backgrounds: the calendar's week and year, and strings and numbers in Tamanduá Light code |
| `--selection` | `#F2DBB2`: gold at 35% over paper | `#F3D9A8` | Selected text |
| `--highlight` | `#F1D7A9`: gold at 40% over paper | `#F1D59F` | `==highlighted==` text |
| `--danger` | `#A23B2A` | `#A23B2A` | Errors, failed saves, formulas KaTeX cannot parse |

In Solarized Light, `--hover` and `--border` are its `#eee8d5` mixed with 10% `#586e75` and 25% `#93a1a1`. The gold, the selection and highlight tints, and the red are shared with Tamanduá Light. Every other Solarized value is from the published Solarized palette.

**Code colours.** Tamanduá Light: keywords and tags in bold `--heading`, strings and numbers in `--accent-text`, comments in muted italics, everything else in `--text`. Solarized Light: keywords green `#859900`, strings and numbers cyan `#2aa198`, titles and function names blue `#268bd2`, types and attributes yellow `#b58900`, built-ins red `#dc322f`, comments in muted italics, everything else in `--text`. Define them once in `themes.ts` and map them to CodeMirror's highlight tags and, for printing, to highlight.js classes.

**Contrast.** In Tamanduá Light every text colour meets WCAG AA, 4.5:1, on every background, selection and highlight included. Dark green reaches 11.7:1 on paper and 9.0:1 on light cream, muted green at least 4.8:1, `--accent-text` at least 4.5:1 and the red at least 4.7:1. Cream on dark green reaches 9.9:1, and gold on dark green, like dark green on gold, 5.6:1. Gold is never used for text on a light background, where it reaches only 2.1:1. Solarized Light keeps the published colours, which are softer by design: its body text reaches 4.1:1 and its muted text 2.5:1.

A unit test reads `themes.ts` and checks, for Tamanduá Light, every text colour (`--text`, `--heading`, `--text-muted`, `--accent-text`, `--danger`) on every light background (`--paper`, `--sidebar`, `--panel`, `--hover`, `--selection`, `--highlight`), plus `--on-dark` and `--accent` on `--dark`, and `--dark` on `--accent`. It fails below 4.5:1. Solarized Light and the colours users give their words (4.14) are not tested.

**How the parts look**

- **Sidebar** on `--sidebar`. The selected row is on `--hover`, with a 3 px gold bar at its left edge.
- **Tab bar** on `--panel`. The active tab takes `--paper`, so it joins the editor, with a 3 px gold line on top. Other tabs show muted text.
- **Status bar** on `--panel`, in muted text. The sync chip is red for "Sync problem" and in `--text` for the two states that wait for the user (a passphrase or a new key needed).
- **Buttons:** primary is a `--dark` fill with `--on-dark` text; secondary is `--text` with a muted outline; hover uses `--hover`.
- **Inputs and checkboxes:** `--paper` background with a 1.5 px muted outline. A checked task box is a `--dark` fill with an `--on-dark` tick.
- **Focus:** a 2 px `--dark` outline with a 2 px gold ring outside it, on every focusable element. The dark outline carries the contrast, the gold the look.
- **Inside notes:** headings and bold text in `--heading`; links in `--text` with a 2 px gold underline; quotes with a 3 px gold bar; code blocks and inline code on `--panel`, in the code colours above.
- **Banners** on `--panel` with a 4 px left bar: gold for information, red for errors. **The snackbar and tooltips** are `--dark` with `--on-dark` text; the snackbar's action is gold.
- **Welcome screen:** `--paper` background, the icon at 96 px, the name "Tamanduá" in `--heading`, and the three choices as buttons, the first one primary.
- **Calendar:** a `--dark` header row and the current week in gold (4.8).

**Fonts.** The interface always uses Inter. The font for notes is one setting that applies to every note, in the editor and when printing. Every font but the system font ships with the app, so it looks the same on every computer and works offline. Fonts the user installed are not offered: Brave on Windows shows sites only a random selection of them.

| Font for notes | Style | Why it is on the list |
|---|---|---|
| Inter (default) | Sans-serif | Designed for computer screens, with a tall x-height that helps lower-case text |
| Atkinson Hyperlegible Next | Sans-serif | Made by the Braille Institute for readers with low vision, so that letters cannot be mistaken for one another; the 2025 version has seven weights |
| Literata | Serif | Commissioned for Google Play Books, for long reading on any screen |
| Merriweather | Serif | Designed to be pleasant to read on screens, with a large x-height and sturdy serifs |
| System font | The operating system's interface font (`system-ui`) | Matches the rest of the computer, so it differs between Fedora and Windows |

Code always uses JetBrains Mono.

| Setting (Settings → Appearance) | Choices | Default |
|---|---|---|
| Font for notes | The list above, each name shown in its own font with a sample line in Portuguese and English | Inter |
| Font size | 10 to 32 px. Alt+= and Alt+- step it, Alt+0 resets it. | 16 px |
| Line height | 1.2 to 2.0 | 1.6 |
| Readable line width | On (text column at most 700 px, centred) or off (full width) | On |
| Theme | Tamanduá Light or Solarized Light | Tamanduá Light |

Every choice applies at once, persists, and syncs to the other devices. Browser zoom (Ctrl+= and Ctrl+-) stays the browser's own and scales the whole interface, which helps on Felipe's 4K screen; the app never blocks it.

**The font list will grow.** Felipe plans to extend it, so keep it in one place and easy to change:

- The list lives in `src/lib/settings/fonts.ts`: for each font an id, the name shown, the CSS family with its fallbacks, its source, its licence and a one-line note. Adding a font is one entry plus its files; `docs/ARCHITECTURE.md` has a step-by-step guide.
- Fonts come from the Fontsource packages `@fontsource-variable/inter`, `@fontsource-variable/atkinson-hyperlegible-next`, `@fontsource-variable/literata`, `@fontsource-variable/merriweather` and `@fontsource-variable/jetbrains-mono`: variable versions, upright and italic. Load only their Latin and Latin Extended files, which cover Portuguese. The packages' ready-made CSS also lists files for other scripts, which would swell the precache. A font with no Fontsource package goes in `public/fonts/<id>/` as WOFF2 files. All are under the SIL Open Font License and listed in `THIRD_PARTY_LICENSES.md`.
- Every font file is precached, so a font chosen on one device works offline on the next. Only the fonts in use are loaded into the page. The build reports the fonts' total size: keep it under 3 MB, and state the new total in any change that adds a font.
- Fonts reach the page through CSS variables: `--font-ui`, `--font-text`, `--font-mono`, `--font-size`, `--line-height`. No font name appears anywhere but `fonts.ts`.
- A font id this version does not know, saved by a newer version, shows as Inter without changing the saved setting.

### 4.10 Math

- `$...$` is inline math and `$$...$$` is block math. Both render with KaTeX.
- A `$` opens inline math only when the next character is not a space. A `$` closes it only when the previous character is not a space and the next is not a digit. "It costs $5 and $10" stays plain text.
- `\$` is a literal dollar sign. Math is never parsed inside code.
- A formula KaTeX cannot parse shows its source in red, with the error as a tooltip. It never throws.
- `\(...\)` and `\[...\]` are not supported.
- KaTeX and its fonts load the first time a note contains math, and are precached so they work offline.

### 4.11 Export to PDF

- Ctrl+P, or "Export to PDF" in a tab's right-click menu, renders the current note into a print-only container and opens the browser's print dialog. The user picks "Save as PDF" as the destination. Browsers cannot save a PDF silently to a path, so there is no such option.
- The page is built from the note's text by markdown-it, not captured from the editor, which draws only the visible lines.
- markdown-it is set up to read exactly what the editor reads (4.2): GFM tables and strikethrough from its core, and rules for task lists, footnotes, `==highlight==`, math with the delimiter rules of 4.10, front matter (printed as a dim monospace block) and the colour span of 4.14. Use an existing plugin under an allowed licence where it matches the editor's behaviour, and a small rule of our own where none does. Record each choice in `DECISIONS.md`.
- **Parity.** `tests/fixtures/parity/` holds short Markdown cases, each with its expected reading: which spans are bold, italic, code, highlight, math or coloured, and which stay plain text. It includes the edge cases of 4.10 and the colour spans that must be rejected. The editor's parser and the print renderer are both tested against this one list, so the PDF cannot drift from the screen.
- Print style: A4, 20 mm margins, always in the Tamanduá Light theme, in the font for notes, code wrapped and highlighted, table rows kept whole, images (from the vault) scaled to the page width, math by KaTeX, no app chrome. The note's name is the document title.
- The print container is removed after the `afterprint` event.

### 4.12 Keyboard shortcuts

A web page cannot use every shortcut a desktop app can: browsers keep some for themselves. The table avoids those. Spike B in M0 checks every row in a Brave tab and in the installed Brave window, on Fedora (and on Windows at the M0 gate). A shortcut that does not reach the page gets the fallback in the last column, recorded in `docs/DECISIONS.md`.

| Shortcut | Action | Fallback if the browser keeps it |
|---|---|---|
| Alt+N | New note | none needed |
| Ctrl+O | Quick switcher | Alt+O |
| Alt+W | Close tab | Alt+Shift+W |
| Alt+PageDown, Alt+PageUp | Next tab, previous tab in the focused pane | Alt+Shift+Right, Alt+Shift+Left |
| Ctrl+Shift+\ | Split right, or close the split | Alt+\ |
| Alt+1, Alt+2 | Focus the left pane, the right pane | Alt+Shift+1, Alt+Shift+2 |
| Ctrl+S | Save now and sync now | none needed |
| Ctrl+E | Switch between live preview and source mode | Alt+Shift+E |
| Ctrl+F, Ctrl+H | Find, replace in the note | none needed (CodeMirror handles them) |
| Ctrl+Shift+F | Search all notes | Alt+Shift+F |
| Ctrl+P | Export to PDF | none needed |
| Alt+C | Calendar | none needed |
| Alt+T | Text colour palette for the selection | none needed |
| Ctrl+, | Settings | Alt+, |
| Ctrl+\ | Show or hide the sidebar | Alt+Shift+\ |
| Ctrl+B, Ctrl+I, Ctrl+K | Bold, italic, link | none needed |
| Alt+=, Alt+-, Alt+0 | Font size up, down, reset | none needed |
| Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z | Undo, redo | none needed |
| F2, Delete | Rename, delete (in the file tree) | none needed |

Rules:

- Never bind these, because browsers keep them or because they open developer tools: Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1 to Ctrl+9, Ctrl+PageUp, Ctrl+PageDown, Ctrl+L, Ctrl+R, F5, F11, F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+Shift with any of A, B, M, N, O, Q, T and W, Alt+D, Alt+E, Alt+F, Alt+Left, Alt+Right, Alt+Home.
- Never use Ctrl+Alt combinations: on Windows they act as AltGr, which Portuguese keyboard layouts need for characters.
- Match letters on `event.key`, case-insensitively. Match punctuation and digits on `event.code`, so `\`, `=`, `-` and `,` work on Portuguese and US layouts alike.
- Shortcuts are fixed in version 1. The README lists them.
- **Spike B result (20 November 2026).** In Brave 157 on Fedora and Brave 158 on Windows, in a tab and in the installed window, every primary and every fallback above reaches the page, and Brave takes no action of its own once the page cancels the key press. Every primary therefore stands as written. The fallbacks are not bound; they stay in the table in case a later Brave keeps a primary. Details in `docs/DECISIONS.md`.

### 4.13 Other settings

| Setting | Default | Scope |
|---|---|---|
| Always open notes in a new tab | Off | Synced |
| Confirm before deleting forever | On | Synced |
| Show all files in the tree | Off | Synced |
| New tabs start in | Live preview | Synced |
| Pasted images go to | The note's own folder (alternative: a subfolder named `attachments`) | Synced |
| Week chip in the status bar | On | Synced |
| Keep items in the Trash for | 30 days (7 to 365) | Synced |
| Remind me to export after | 7 days (1 to 90, or never) | Synced |
| Device name | Operating system and browser, for example "Windows · Brave" | This device |

### 4.14 Text colour

Markdown has no colour syntax, so coloured text is stored as one small, fixed HTML pattern. Obsidian and many other Markdown apps display the same pattern.

- **Stored form:** `<span style="color:#dc322f">text</span>`. Exactly this shape is recognised: a `span` whose style holds a single `color` property with a six-digit hex value. Nothing else is.
- **The tool:** select text, then press the text-colour button at the right end of the tab bar, or Alt+T. A small palette opens with eight colours, a custom colour field and "Remove colour". The custom field is the app's own hex input with a preview swatch, so it behaves the same everywhere. With nothing selected the button is disabled.
- **Palette:** the eight Solarized accents. On Tamanduá Light's paper they reach 3.0:1 to 4.4:1, and on Solarized Light's 2.9:1 to 4.3:1: enough to mark a few words, but not for long passages. Yellow `#b58900`, orange `#cb4b16`, red `#dc322f`, magenta `#d33682`, violet `#6c71c4`, blue `#268bd2`, cyan `#2aa198`, green `#859900`.
- **Applying:** the selection is wrapped in the span. If it already sits inside a colour span, the colour is changed, never nested. "Remove colour" unwraps it. A selection that crosses lines or blocks is wrapped line by line, because an inline span cannot cross a block boundary.
- **Live preview:** the tags are hidden and the text shows in its colour. Touching it reveals the tags, as for any inline element. Colour combines with bold, italic and the other inline styles.
- **Safety:** note HTML is never inserted into the page. The app parses this one pattern, validates the hex value and applies the colour through a CodeMirror decoration. Any other `span`, any other style property and any other tag stay dim source text.
- **Export:** the PDF page renders the same pattern through a markdown-it rule with the same validation.
- The stored colour is shown as it is. It does not adapt to the theme.

### 4.15 Plain Markdown in and out: export, import and recovery

The notes must never depend on Tamanduá. Everything in the vault can leave it at any time as ordinary, unencrypted `.md` files in their folders, and come back the same way. This is requirement R12. It is also the one backup that needs neither the passphrase nor the database.

**What an export looks like.** The vault's tree becomes folders and files, exactly as the sidebar shows it:

```text
tamandua-2026-11-18.zip
  todo.md
  ideas/
    plan.md
    pasted-20261118-101500.png
    drafts/
      talk.md
  recipes/                      an empty folder is kept
```

- Every note is one `.md` file: plain UTF-8 text with `\n` line endings, byte for byte the note's Markdown. Nothing in the file is encrypted or wrapped.
- Every folder is a folder, nested to any depth. Empty folders are kept as folder entries.
- Images sit at their own paths, so relative image links keep working in Obsidian or any other editor.
- Names that clash ignoring case get ` (2)`, so the archive unpacks on Windows.
- The Trash is left out unless "Include the Trash" is ticked. Its items then go under a top-level `.trash/` folder, which an import skips.
- Snapshots, settings, the workspace, the sync key and the passphrase are never exported.

**Export** (Settings → Data, and the tree's right-click menu)

| Action | Where | Result |
|---|---|---|
| Export vault | Settings → Data, and the reminder below | `tamandua-YYYY-MM-DD.zip` with the whole tree |
| Export folder | A folder's right-click menu | `<folder name>-YYYY-MM-DD.zip` with that folder at the top and everything below it |
| Download as .md | A tab's menu and a note's right-click menu | One `.md` file |

- Export reads only this device's storage. It works offline, with sync off, with sync paused and with the passphrase forgotten.
- The export dialog says in plain words that the files are not encrypted: anyone who gets the archive can read the notes.
- The archive is built by `fflate` in a worker and saved through the browser's ordinary download, so no access to a folder is needed.
- Settings → Data shows when the vault was last exported from this device.
- **Reminder.** When the vault has changed since the last export, and that export is older than the setting "Remind me to export after" (4.13, 7 days by default), a banner offers "Export now" and "Later", which waits a day. A vault that was never exported counts as overdue once it holds ten notes.

**Import** (Settings → Data → "Import Markdown", and a folder's right-click menu → "Import here")

- Sources: a folder (a file input with `webkitdirectory`, which Brave supports), a `.zip`, or several `.md` files. The user picks the target folder in the vault; the default is the root.
- The folder structure is kept. Every folder in the source becomes a folder in the vault, nested as it was, and every note lands in its folder. The picked folder itself is not recreated: its contents land in the target folder. The same holds for a `.zip`: its top level lands in the target folder. So importing an export of the vault into an empty vault rebuilds the vault exactly.
- `.md` and `.markdown` files become notes. PNG, JPEG, GIF, WebP and SVG files up to 7 MB become files. Everything else, and every entry whose name starts with a dot (`.obsidian`, `.git`, `.trash`), is skipped.
- Text must be valid UTF-8; a file that is not is skipped and listed. `\r\n` becomes `\n`, and a byte-order mark is dropped.
- A name that breaks the rules of 4.3 (a character Windows forbids, a trailing dot, a reserved name) is changed to the nearest valid one, with `_` for each forbidden character, and the change is listed. If the renamed item is an image, links to it in the notes of the same import are updated.
- If an item with the same path already exists, the imported one gets ` (2)` and nothing existing is changed.
- A summary lists what was imported, renamed and skipped, with reasons. The import is one undoable operation until the app closes ("Undo import" moves everything it created to the Trash).
- Imported items are ordinary items. With sync on they are encrypted and uploaded like any others.

**The recovery tool** (`tools/recover.mjs`)

If the app, the browser or every device is gone, the encrypted copy in the database can still be turned back into the same folders of `.md` files.

- It is one stand-alone script for Node.js 20 or newer, with no dependencies: it uses Node's own Web Crypto and zlib. It is written from the specification of format 1 (5.6) and shares no code with the app, so it also cross-checks the format.
- Input: either `--file`, a JSON export of the vault's branch (Firebase console → Realtime Database → the `/tamandua/<key>` node → Export JSON), or `--url <database address> --key <sync key>`, to download the vault itself. The passphrase is asked for on the terminal and is never taken as an argument.
- Output: a folder laid out exactly like "Export vault" above, with the Trash under `.trash/`. It prints a summary: the notes, folders and images written, and every item it could not open, with the reason. It never writes to the database.
- Felipe runs it himself. The agent runs it only against fixtures and the emulator (section 10).
- The README has a section "If everything else is lost" that walks through it.

### 4.16 Installing, updates, offline use and storage

- **Manifest:** name and short name "Tamanduá", `id`, `start_url` and `scope` all `/`, `display: standalone`, `theme_color` `#F2E6CF` (the cream of the tab bar, so an installed window's title bar blends in), `background_color` `#FCF9F3`, and the icons of Appendix A. The next channel's name is "Tamanduá (next)". The two channels are different sites, so both can be installed side by side.
- **Installing:** Brave's menu offers "Install Tamanduá". Settings → About also shows an "Install as an app" button when the browser fires `beforeinstallprompt`.
- **Offline:** the first visit needs the network. After that the service worker serves every file of the app from the device, and the vault is in IndexedDB, so the app opens and works with no connection. After that, the only network traffic is sync and the service worker's check for updates.
- **Updates:** the service worker checks for a new version when the app starts and every hour. When one is ready, a snackbar says "A new version is ready" with "Reload". Reload saves everything first. The app never reloads by itself.
- **Data from a newer version.** If the app finds that this device's data was written by a newer version of itself (a higher schema version, 5.3), it changes nothing and shows "This device's notes were saved by a newer version of Tamanduá", with Reload to fetch the current version. This is what makes it safe to put an older release back (section 9).
- **Reset app files:** Settings → About → "Reset app files" removes the service worker and its caches, keeps the vault, and reloads the app from the network. It is the way out if an update ever breaks the app.
- **Persistent storage:** at every start, until it is granted, the app calls `navigator.storage.persist()`. Chromium decides without a prompt, from how much the site is used and whether it is installed, so a first refusal is normal and a later call succeeds. Settings → About shows whether storage is persistent and repeats the Brave advice of section 1.6. Persistent storage stops the browser from evicting the vault. It does not survive "Clear browsing data", which is one reason export matters (4.15).
- **One window at a time:** a second tab or window shows "Tamanduá is open in another window" with "Use it here". Choosing that asks the other window to save and step aside; it then shows the same message with its own "Use it here" button (5.10).
- **Lost storage:** if the browser has cleared the site's data, the app starts at the welcome screen. With sync, "Connect to my vault" brings everything back except edits that never reached the database. The README explains this.
- **Channels:** stable and next are separate sites with separate databases (section 9). They share no storage, no service worker and no sync key, and nothing one writes can be read by the other. Storage names still carry the channel (`tamandua-stable`, `tamandua-next`), so that copies of both on one development machine cannot collide.

## 5. Architecture

The app is one page with no server code. The interface edits notes held in memory and IndexedDB; a sync engine copies changes to and from the database in the background; a service worker serves the app's own files offline. Nothing on the editing path waits for the network.

### 5.1 Overview

```text
 Brave tab or installed window (one at a time, 5.10)
 +-------------------------------------------------------------------+
 |  Svelte UI: sidebar, tab bars, panes, dialogs, status bar         |
 |        |                                ^                         |
 |        v                                |                         |
 |  Vault model in memory  <------->  Editors (CodeMirror 6 +        |
 |        |                            live preview, 6.1)            |
 |        | save (6.2)                     ^ remote changes, merges  |
 |        v                                |                         |
 |  IndexedDB (one per channel): items, texts, files, snapshots,     |
 |  state, keys, workspace, log                                      |
 |        |  queue: items marked dirty     ^ pulled items            |
 |        v                                |                         |
 |  Sync engine (6.3): Web Crypto, compression, three-way merge      |
 |        |  fetch / XHR to the REST API   ^ EventSource on "head"   |
 +--------|-------------------------------|--------------------------+
          v                               |
   Firebase Realtime Database (Tamanduá's own; one project per channel)
     /tamandua/<key>/      info, moved, head, items/<id>, blobs/<id>

 Search worker: reads the notes from IndexedDB for each search (4.7)
 Service worker (Workbox): serves every file of the app from the device
 Outside the app: tools/recover.mjs rebuilds .md files from the database (4.15)
```

Read it top to bottom. An edit changes the vault model and the editor at once, reaches IndexedDB within a second, and is marked dirty. The sync engine uploads dirty items when it can, and applies items that changed elsewhere, merging when both sides changed.

### 5.2 Repository layout

This is the source repository, `NEXT_ORG/NEXT_ORG.github.io`. The stable repository holds only a copy of `deploy/stable-deploy.yml` (section 9).

```text
tamandua/
  PLAN.md                  this plan
  CLAUDE.md                short working notes for the agent: commands, conventions
  README.md  CHANGELOG.md  THIRD_PARTY_LICENSES.md
  index.html               the page, with its content security policy (5.9)
  vite.config.ts           channel, PWA plugin
  database.rules.json      the complete rules, the same for both databases (Appendix B)
  firebase.json            emulator settings only: no hosting, no deploy targets
  deploy/
    stable-deploy.yml      master copy of the stable repository's one workflow;
                           Felipe pastes it there (section 9)
  docs/
    PROGRESS.md            milestone status, updated every session
    DECISIONS.md           every choice the plan left open, with its reason
    ARCHITECTURE.md        module map and "how to add..." guides for later changes
    MANUAL_TESTS.md        checks only a person can make
    reference/  icon.svg  whatweekisit.jpg  obsidian/
  public/
    icons/                 generated from docs/reference/icon.svg (Appendix A)
    fonts/                 WOFF2 files of any font without a Fontsource package (4.9)
  src/
    main.ts  App.svelte  app.css
    lib/
      config.ts            every tunable value, each with a comment
      channel.ts           stable or next: app name, storage prefix, database address
      strings.ts           every text shown to the user
      store/               IndexedDB schema, migrations, typed access through idb
      vault/               items, tree, names, paths, operations, Trash, snapshots,
                           image links
      workspace/           panes, tab lists, split view, restore
      autosave/            the per-note save state machine (6.2)
      sync/
        rest.ts            every request to the database (5.8); nothing else calls fetch
        stream.ts          the EventSource on head
        crypto.ts          key derivation, seal and open (5.6)
        format.ts          database records <-> local items, with validation
        engine.ts          queue, push, pull, catch-up, status
        merge.ts           three-way merge of text, metadata, settings and deletions
        folders.ts         a folder's deletion against changes inside it (6.3)
        purge.ts           emptying the Trash by the database's time (6.3)
        reconcile.ts       full download and reconcile (6.3)
        keys.ts            sync key and passphrase flows (4.5)
      instance/            the one-window lock (5.10)
      editor/
        setup.ts           base CodeMirror extensions, keymap, theme
        color.ts           the text colour tool (4.14)
        livePreview/       inline.ts  blocks.ts  reveal.ts  widgets/  parser/
      search/              worker.ts, in-note panel, all-notes panel
      calendar/            weeks.ts  Calendar.svelte
      settings/            schema, store, dialog, fonts, themes
      transfer/            exportZip.ts  importFiles.ts  reminder.ts (4.15)
      print/               renderHtml.ts  print.ts  print.css
      ui/                  Sidebar FileTree TabBar SplitView StatusBar SyncChip
                           QuickSwitcher Banner Snackbar Welcome TrashView History
  tools/
    recover.mjs            stand-alone recovery tool: database export to .md files (4.15)
  tests/
    fixtures/              notes, folders and images for every case in section 8
    unit/  rules/  sync/  sim/  ui/  perf/
  scripts/                 fixture and performance generators, icon generation
  .github/workflows/       ci.yml  deploy.yml  release.yml
```

### 5.3 Local data model

One IndexedDB database, named by the channel prefix (`tamandua-stable` or `tamandua-next`), opened through `idb`.

| Store | Key | Holds |
|---|---|---|
| `items` | id | One record per note, folder, file and the settings item: `kind`, `name`, `parent`, `created`, `updated`, `deleted`, `deletedAt`, `size`, `mime`, `sha256`, `device`. Sync fields: `rev` (last revision known from the database, 0 if never uploaded), `ts` (database time of that revision), `dirty` (changes not yet uploaded), `dirtySince` (time of the oldest change not uploaded, which orders the upload queue), `seq` (raised by every local change, so an upload can tell whether the item changed meanwhile), `base` (the metadata as of `rev`, kept while dirty, for merges), `unreadable` (a remote version failed to open). |
| `texts` | id | The text of a note or of the settings item, and `baseText`: the text as of `rev`, kept only while dirty |
| `files` | id | A file's bytes, as a Blob |
| `snapshots` | [id, time] | Up to 20 per note: time, reason, text |
| `state` | name | `deviceId`, `deviceName`, sync `key`, `salt`, `cursor` (latest database time seen), `lastSync`, `lastExport`, `changedSinceExport`, `exportSnoozedUntil`, `schemaVersion` |
| `keys` | salt | The derived AES key, as a non-extractable CryptoKey |
| `workspace` | `"current"` | Panes, tabs, cursors, scroll positions, expanded folders, sidebar width |
| `log` | auto-increment | The last 500 diagnostic entries, never with note text |

- Every change that touches several records (an edit, a rename, a deletion, applying a remote item, a merge) is one IndexedDB transaction. Every transaction that writes user data asks for `durability: 'strict'` (4.4).
- Start-up reads `items` (metadata only) and `workspace`, then the texts of the open tabs. The search worker holds no texts of its own: it reads `items` and `texts` afresh for each search (4.7).
- The schema has a version number and migrations. A migration never deletes user data, and each one is tested on a fixture database of the previous version. An app that meets a schema version higher than its own opens nothing, writes nothing, and shows the message of 4.16.

### 5.4 Where state lives

| What | Where |
|---|---|
| Notes, folders, files, synced settings | IndexedDB on every device; an encrypted copy in the database when sync is on |
| Workspace, snapshots, device name | IndexedDB, this device only |
| Sync key, salt, cursor | IndexedDB `state`, this device only. The key also appears in the path of every database request. |
| Derived encryption key | IndexedDB `keys`, non-extractable |
| Passphrase | Nowhere. It is used once to derive the key, then dropped. |
| The app's own files | The service worker's cache, named with the channel prefix |
| Search index, copies of notes on any server other than the database | None exist |
| `localStorage` | Not used. Everything lives in IndexedDB, under the channel prefix. |

### 5.5 Remote data model

Each channel has its own database (`STABLE_DB`, `NEXT_DB`). In each, everything lives under one branch:

```text
/tamandua/<key>/
  info          { format: 1, salt, check, created }   written once when the vault is created
  moved         { ts, check }                          written once when the vault moves to a new key
  head          { ts, id, rev }                        rewritten by every upload
  items/<id>    { rev, ts, kind, enc, meta, body, size, deleted }
  blobs/<id>    a file's sealed bytes, base64          written once; removed when the file is deleted forever
```

| Item field | Type | Meaning |
|---|---|---|
| `rev` | number | Revision: 1 for the first upload, exactly one more for every later upload. The rules enforce this, which is what detects conflicts. |
| `ts` | number | Server time of the upload, written as `{".sv": "timestamp"}` |
| `kind` | `"note"`, `"folder"`, `"file"` or `"settings"` | Never changes |
| `enc` | `1` | Encryption format (5.6) |
| `meta` | string | Sealed JSON metadata. Always present. After "delete forever" it is the sealed marker `{"gone": true}`. |
| `body` | string | Sealed, compressed text, for notes and the settings item. Absent after "delete forever". |
| `size` | number | Plaintext size in bytes: the note's UTF-8 text or the file |
| `deleted` | `true` | Present while the item is in the Trash, and after "delete forever" |

- **Metadata** (inside `meta`): `name`, `parent` (a folder id, or `""` for the root), `created` and `updated` (device time in ms, for display), `device` (the device name), `deletedAt` (device time in ms, while deleted, for display), and for files `mime` and `sha256` (hex SHA-256 of the bytes). Unknown fields are kept when an item is rewritten, so an older version never erases a newer version's data.
- **Ids** are 20 characters of lowercase base 36: 9 for the creation time in ms, then 11 random. The settings item's id is fixed: `settings000000000000`.
- **Deleted forever** means a tombstone: `{rev, ts, kind, enc, deleted: true, meta}`, where `meta` is the seal of `{"gone": true}`, with no `body`, and the blob removed. The marker is sealed with the vault's key and bound to the item and its revision (5.6), so only a device that holds the passphrase can write a tombstone that other devices obey. Tombstones stay, so every device learns of the deletion. The app never removes an item record.
- **`head`** names the item and the revision of the latest upload. A device uses it to tell its own uploads from another device's (5.8).
- **`moved`** holds the server time and a sealed marker (5.6). A device believes it only if the marker opens with the vault's key.
- **Limits:** a note syncs while its text is at most 4,000,000 bytes of UTF-8; a larger note stays on the device and the chip reports it. Files are at most 7,000,000 bytes. The rules allow `meta` up to 8,192 characters, `body` up to 7,000,000 and blobs up to 9,500,000, which leaves room for base64 and the 28 bytes of each seal.

### 5.6 Encryption, format 1

Every device must produce and read exactly this, so never change it in place. A new scheme gets `enc: 2` and readers keep format 1. An item in an unknown format is shown as "needs a newer version of Tamanduá" and is never overwritten.

- **Key:** PBKDF2-HMAC-SHA-256 over the passphrase, normalised to Unicode NFC and encoded as UTF-8, with the vault's 16-byte random salt (`info.salt`, base64) and 600,000 iterations. It derives an AES-GCM 256-bit key, non-extractable, for encrypt and decrypt. Every vault has its own random salt.
- **Seal:** a fresh 12-byte random nonce; AES-GCM over the plaintext with the AAD string below (UTF-8) as additional data; the result stored as standard base64, with padding, of nonce ‖ ciphertext ‖ 16-byte tag. A seal is 28 bytes longer than its plaintext before base64.
- **What is sealed, and with which AAD:**

| Field | Plaintext | AAD |
|---|---|---|
| `meta` | UTF-8 of the metadata as JSON | `tamandua:1:meta:<id>:<rev>` |
| `body` | `deflate-raw` (CompressionStream) of the UTF-8 text | `tamandua:1:body:<id>:<rev>` |
| blob | The file's bytes, not compressed; `meta.sha256` is checked after opening | `tamandua:1:blob:<id>` |
| `info.check` | UTF-8 of `tamandua check v1` | `tamandua:1:check` |
| `meta` of a tombstone | UTF-8 of `{"gone":true}` | `tamandua:1:meta:<id>:<rev>` |
| `moved.check` | UTF-8 of `tamandua moved v1` | `tamandua:1:moved` |

- **Why the revision is in the AAD:** a record copied from another item, or an older revision put back, fails to open. A record that fails to open is never applied: the local copy stays, the item is marked unreadable, and the chip shows a sync problem. The same holds for a tombstone: one written without the vault's key does not open and deletes nothing.
- **Checking a passphrase:** derive the key from `info.salt` and open `info.check`.
- **Test vectors:** in M3a, generate vectors with a fixed passphrase, salt, nonce and plaintexts, commit them as `tests/unit/crypto-vectors.json`, and test sealing and opening against them, so a later change cannot break old data unnoticed.

### 5.7 Security rules

The complete rules file is in Appendix B. The same file is published to both databases. It allows nothing outside `/tamandua`:

- **Keys:** `/tamandua/<key>` can be read and written only by someone who knows a key of 32 or more characters. Nothing allows listing keys.
- **`info` and `moved`** can be written once and never changed or deleted.
- **`head`** must hold the server time, an id and a revision number.
- **`items/<id>`:** a new item must have `rev` 1; an existing one must get exactly `rev + 1`; `ts` must be the server time; `kind` never changes; only the listed fields are allowed; `meta` is always required; and an item record can never be deleted, only tombstoned. The `ts` index makes the catch-up query possible.
- **`blobs/<id>`:** a string of at most 9,500,000 characters, which can be created and removed but never overwritten.
- **Changing the rules:** tighten freely; ask before loosening anything. Every rule has a test in `tests/rules/`. Felipe publishes rules by hand, to the test database first (section 1.5); the agent never does.

What the rules cannot prevent, because there is no login: anyone with a database address can write data under made-up keys and use up that project's free quota. Anyone with the key can download the ciphertext, try passphrase guesses offline, overwrite items with data that will not open, and write a false `moved` marker. None of that can change or delete a note:

- An item that does not open is never applied. The local copy stays, the chip reports it, and "Overwrite with this device's copy" puts a good version back (4.5).
- A tombstone that does not open deletes nothing, however often it is written.
- A `moved` marker that does not open is reported and not believed.

Firebase Authentication would close the gaps that remain (quota abuse, and holding up sync by overwriting) and is listed as later work in section 11.

### 5.8 Requests to the database

`BASE` is `<the channel's database address>/tamandua/<key>`. In development and tests, the emulator's address is used and `?ns=<namespace>` is added to every request. `SV` is `{".sv": "timestamp"}`.

| Request | When |
|---|---|
| `GET BASE/info.json` | Connecting a device, and once per session to check the format |
| `PUT BASE/info.json` | Creating a synced vault. The rules refuse it if `info` exists. |
| `GET BASE/moved.json` | At each catch-up |
| `PUT BASE/moved.json` with `{"ts": SV, "check": sealed}` | Moving to a new key, on the old key |
| `EventSource BASE/head.json` | While the app is visible and online and has a key |
| `GET BASE/items.json?orderBy="ts"&startAt=<cursor − 60000>` | Catch-up: every item changed since the cursor, with a minute of overlap |
| `GET BASE/items.json`, by XHR with progress | Full download: connecting, Repair sync, moving to a new key |
| `PATCH BASE.json?print=silent` with `{"items/<id>": item, "head": {"ts": SV, "id": id, "rev": rev}}` | Uploading one item |
| The same `PATCH` with `"blobs/<id>": sealed` added, by XHR with progress | Uploading a new file with its item, in one atomic write |
| The same `PATCH` with `"blobs/<id>": null` and a tombstone | Deleting a file forever |
| `GET BASE/blobs/<id>.json`, by XHR with progress | Downloading a file |

- **When to upload.** An item is uploaded once no new save has reached it for 1 s, and no later than 10 s after its oldest change that is not uploaded yet (`dirtySince`). Ctrl+S, the window losing focus, the page being hidden and a tab closing upload at once. Each upload sends the whole item; there are no partial updates. Both delays live in `config.ts`. Together with the save delays of 4.4 they give the timeline that R5 and the budgets of section 8 promise: in the database within 3 s after typing stops and within 15 s during unbroken typing, and on another device that has the note open within 2 s more.
- **Order of uploads.** Items upload in the order of their oldest change. One rule overrides that order: a folder's deletion is never uploaded while this device still has changes to upload for items inside that folder. Rule F3 of 6.3 relies on it.
- **Responses:** 200 and 204 are success. **401** means a rule refused the write: the engine then reads the item, and a different `rev` means a conflict (6.3); otherwise sync stops with "The database refused a change: check the rules and the key". **400** is a bug or a missing index: stop and report. **429**, **5xx** and network errors are retried after 2 s, 5 s, 15 s, 30 s and then every 60 s. **Any other status** (403, 404, 413 and the rest) stops sync and is shown in the chip's details with the status and the kind of request; it is never retried in a loop. While `navigator.onLine` is false, no request is attempted; the `online` event resumes them.
- **Timeouts:** small requests are aborted after 20 s. Large transfers are aborted when no progress arrives for 30 s, then retried.
- **Concurrency:** at most four requests in flight.
- **The stream** carries `put` events with the new `head`. `keep-alive` needs nothing. `cancel` closes the stream and shows a sync problem. After three failed reconnections, a plain `GET BASE/head.json` is sent and its result is shown in the chip's details, so that the cause (the rules, the network, a blocked request) is visible.
- **When to catch up:** at start, on `online`, when the page becomes visible or regains focus, and after a `put` on the stream that is not this device's own. If `head.id` is a note open in an editor, catch up after 250 ms; otherwise wait 20 s and let further events join the same catch-up.
- **Own uploads.** The engine remembers the id and the revision of each of its uploads for a minute. A `put` whose `id` and `rev` match one of them is this device's own and is ignored. Any other `put` is another device's, also when it names an item this device has just uploaded, and starts a catch-up.
- **Hidden page:** after the page has been hidden for 60 s, close the stream; reopen it and catch up when the page is visible again. A device left in the background then downloads nothing.

### 5.9 Security and privacy rules

1. **Content security policy**, as a `<meta http-equiv>` tag in `index.html` (GitHub Pages cannot send headers): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://*.firebasedatabase.app; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. Inline styles are allowed because CodeMirror and KaTeX set them. The database is matched by a wildcard because Firebase may redirect a stream to another server of the same domain. Development builds add `http://127.0.0.1:9000` for the emulator. There are no inline scripts.
2. **No note text becomes HTML**, except through KaTeX, markdown-it with `html: false` and highlight.js, for printing. The colour span of 4.14 is parsed and validated. Nowhere else is note text or a name passed to `innerHTML` or `{@html}`.
3. **Links** are checked against `http`, `https` and `mailto` before they open.
4. **Network:** the only destinations are the app's own origin and the database. A CI step fails the build if the built files reference any other origin, other than the channel's database address in `channel.ts`.
5. **Secrets:** the sync key and the passphrase are never logged, never put in diagnostics, and never sent anywhere except the key in database request paths. The passphrase field uses the right `autocomplete` values so a password manager can save it.
6. **An origin of its own.** Nothing but Tamanduá is served from `STABLE_URL` or `NEXT_URL`, and neither GitHub organisation publishes any other site. Every storage, cache, lock and broadcast-channel name the app uses starts with its channel prefix, and the app never touches a name that does not.
7. **Diagnostics:** Settings → About → "Copy diagnostics" copies the version, channel, browser, storage state and the log. The log holds ids and error codes, never note text, names, keys or passphrases.

### 5.10 Making the web app behave like a desktop app

A web page comes with browser habits that make an app feel wrong or break features. Handle them in M1, and keep a test for each.

- **Context menus.** The app shows its own menus on tabs, the tree and the Trash. The editor keeps the browser's menu, for spelling suggestions.
- **Drag and drop.** HTML5 drag and drop serves tabs, the tree and image drops. A file dropped anywhere else must not open in the page: cancel `dragover` and `drop` at the document level.
- **Navigation.** The app never navigates away from its page. Links open in new tabs (4.6).
- **Selection.** `user-select: none` on the app's chrome; text stays selectable in the editor, inputs and dialogs.
- **Start-up.** `index.html` shows the icon on the theme's background until the first render, so there is no white flash. The saved theme is applied before the first paint by a small module, with no inline script.
- **Window title.** `<note name> — Tamanduá`, or `— Tamanduá (next)` on the next channel.
- **One window at a time.** The page holds the Web Lock `<prefix>-instance` for its lifetime, requested with `ifAvailable`. A second page that cannot get it shows "Tamanduá is open in another window" with "Use it here", which posts `{type: "yield"}` on the `BroadcastChannel` named `<prefix>`. The holder saves everything, closes its stream, releases the lock and shows the same screen. If the holder does not answer within 2 s, the new page takes the lock with `steal: true`.
- **Fonts.** Inter for the interface and, until the user picks another, for notes; JetBrains Mono for code. While a font loads, `system-ui` and `ui-monospace` stand in (`font-display: swap`).
- **Clipboard images.** Read pasted images from the paste event's `clipboardData`.

## 6. The three hard parts

Live preview, saving on the device, and sync carry most of the risk. Build each exactly as described here, and get its tests passing before adding features on top.

### 6.1 Live preview in CodeMirror 6

**Principle.** The document is always the plain Markdown string. Rendering is done only with CodeMirror decorations, computed from the syntax tree and the selection. Display state is never stored in the text.

**Parser**

- Use `@codemirror/lang-markdown` on the CommonMark base with GFM: tables, task lists, strikethrough, autolinks. Leave out subscript, superscript and emoji so parsing matches Obsidian.
- Add four small `@lezer/markdown` extensions under `livePreview/parser/`: highlight (`==`), inline and block math (rules in 4.10), front matter at the top of the note, and the colour span of 4.14.
- Load code-block languages lazily from `@codemirror/language-data`. Precache them, so highlighting works offline.

**Two decoration providers**

| Module | CodeMirror mechanism | Handles | Reason |
|---|---|---|---|
| `inline.ts` | View plugin, visible ranges only | Styling marks, hidden markers, line classes for headings, quotes and code, bullets, checkboxes, inline math, links, horizontal rules, text colour | The work stays proportional to what is on screen |
| `blocks.ts` | State field | Images, tables, block math | CodeMirror requires decorations that change vertical layout or span line breaks to come from state, not from a view plugin |

Both are thin shells around pure functions, `buildInline(state, ranges, options)` and `buildBlocks(state, options)`, which return decoration sets. That makes them testable without a DOM.

**Reveal logic, in `reveal.ts`**

- One function decides whether a syntax node is touched by the current selection (rules 1 and 2 of section 4.2). Every decoration asks it. No element implements its own rule.
- Do not make hidden markers atomic. Touching reveals them, so the cursor can always reach them.
- While a mouse drag-selection is in progress, freeze the set of revealed elements and recompute on mouse-up. Otherwise text shifts under the pointer.
- Do not change decorations on a line with an input-method composition in progress.

**Widgets**

- Every widget class implements `eq()` so unchanged widgets are reused. Without it, images and formulas flicker on every keystroke.
- The checkbox handles its own click and dispatches a text change. All other widgets let clicks through, so the cursor lands in the source and reveals it.
- Images resolve their path by the lookup of 4.3 (the note's folder first), load the file's Blob from IndexedDB, and show it through an object URL that is revoked when the widget is destroyed. A file not yet downloaded shows a placeholder of the remembered size and fills in when it arrives. Remember each image's rendered height, report it as the estimated height, and request a measure after load. This prevents scroll jumps.
- The table widget renders cells with a small inline renderer: bold, italic, code, links, math.

**Layout stability**

- Heading sizes come from line classes, so a heading line has the same height touched or untouched.
- Hidden code fences keep their lines. Only their text is hidden, and the empty line serves as the box's padding.
- List indentation is a per-line hanging indent computed from nesting depth, so wrapped lines align with the item text.

**Performance**

- Rebuild inline decorations only when the document, viewport, selection or syntax tree changed, and only for visible ranges.
- Rebuild block decorations when the document or tree changed, or when the selection moves into or out of a block. A cursor move inside ordinary text must not trigger a block rebuild.
- Measure against the 10,000-line fixture before M5 is called done.

**Styling**

- One theme module. Every size, colour and font is a CSS variable set from settings. Tamanduá Light and Solarized Light are two sets of values for the same variables (4.9). There is no dark set.

**How to check it**

- Golden tests. Each file in `tests/fixtures/live-preview/` holds Markdown with a cursor mark, and the expected decoration list is stored beside it. There is one fixture per row of the table in 4.2, with cursor-inside and cursor-outside variants.
- Screenshot tests in Chromium of one "kitchen sink" note, in both themes.
- Verify every CodeMirror API name against the installed package's type definitions before using it. Do not write CodeMirror code from memory.

**Accented input test.** Simulate a dead-key sequence (composition start, update, end) inside a heading, a bold span and a list item, and directly after a hidden marker. The resulting text is correct and no decoration changed while the composition was open. Felipe repeats this by hand in M4.

**References, for ideas only.** [Obsidian's notes on CodeMirror decorations](https://docs.obsidian.md/Plugins/Editor/Decorations), [codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc), and the `codemirror-live-markdown` package. Check a project's licence before borrowing code, and record it in `DECISIONS.md`.

### 6.2 Saving on the device

Every open note is in exactly one of four states. Notes that are not open are written directly by the operation that changes them (rename, move, delete, import, a remote change).

| State | Meaning |
|---|---|
| clean | The editor's text equals the text in IndexedDB |
| dirty | Unsaved edits exist and a save timer is running |
| saving | An IndexedDB transaction is in flight |
| failed | The last save failed; a retry is scheduled |

| State | Event | Action | Next state |
|---|---|---|---|
| clean | Edit | Start the 300 ms timer. Record the time of the first unsaved edit. | dirty |
| dirty | Edit | Restart the timer, but fire no later than 2 s after the first unsaved edit | dirty |
| dirty | Timer, blur, tab close, page hidden, `pagehide`, Ctrl+S | One transaction with strict durability (4.4): text, `updated`, `size`, `seq + 1`, `dirty: true` (the sync mark) | saving |
| saving | Transaction completed | If the text changed during the write, go to dirty. Tell the sync engine the item changed. | clean or dirty |
| saving | Transaction failed | Show the error banner. Keep the text. Retry after 2 s, 5 s, 15 s, then every 30 s. | failed |
| failed | Retry succeeded | Hide the banner | clean or dirty |
| any | A remote version is applied by sync (6.3, "applying to an open note") | Cancel the timer; the apply step saves the editor's text itself | clean |

**Rules around the table**

- **Closing the page.** On `visibilitychange` to hidden and on `pagehide`, start a save of every dirty note at once. If any note is still dirty or saving at `beforeunload`, request the browser's standard prompt. This is the only prompt the app ever shows about saving.
- **Edits made by the app.** Restoring a snapshot and find-and-replace go through the editor as ordinary transactions, so Ctrl+Z undoes them. A change applied from another device also goes through the editor as a transaction, but it is marked as remote and kept out of the undo history (`addToHistory: false`). CodeMirror maps the history over it, so Ctrl+Z still undoes this device's earlier edits and never the other device's work. Remote changes are not counted as user edits.
- **Snapshots** (4.3) run on their own idle timer and on tab close; the save machine does not take them.
- **Shape of the code.** The machine lives in `src/lib/autosave/` as a pure reducer plus an effects layer. It is tested with fake timers and a fake store.

### 6.3 The sync engine

The engine runs in the page that holds the one-window lock. It is a queue driven by events: local saves, stream events, timers, `online`, focus and visibility. It never blocks the interface. On connecting, reconnecting or waking up, it pulls first and then pushes, so a device always learns what changed elsewhere before it uploads.

**Push: uploading one dirty item**

1. Pick the next dirty item that is due (5.8, "When to upload" and "Order of uploads"). Read it and its text in one transaction, and note its `seq`.
2. The next revision is `rev + 1` (1 when `rev` is 0). Seal `meta`, and `body` for notes and settings, with that revision in the AAD (5.6). A note over 4,000,000 bytes is not uploaded; it is marked "too large" and the chip says so.
3. Send the `PATCH` of 5.8 with the item and `head`, plus the blob for a new file. Remember the id and the revision as this device's own upload (5.8).
4. On success, in one transaction: `rev` becomes the new revision. If `seq` has not moved, `dirty` becomes false and `base` and `baseText` are cleared. If it moved, the item changed during the upload: it stays dirty, and `base` and `baseText` become what was uploaded.
5. On 401, read `items/<id>`. A different `rev` means another device wrote first: pull that record (below), then push again. The same `rev` means a real refusal: stop and report.

**Pull: applying one record R from the database**

1. If `R.rev` is lower than the local `rev`, ignore it. If it is equal, only store `R.ts`, because an upload with `print=silent` does not return the time. Applying a record twice changes nothing.
2. Open R (5.6). If it fails, mark the item unreadable, keep the local copy, and report. This includes a tombstone whose marker does not open. The item stays unreadable until a later revision opens, or until the user chooses "Overwrite with this device's copy" (4.5), which uploads the local version as revision `R.rev + 1`. If this device has no copy of the item, there is nothing to overwrite it with, and it stays listed until a readable revision arrives.
3. If the item is new here, create it. Files download their blob in the background, at most two at a time.
4. If the local item is clean, replace it with R. A note's old text is snapshotted first when the 10-minute rule of 4.3 allows it.
5. If the local item is dirty, snapshot a note's text, then merge (below). Afterwards `rev` is `R.rev`, `base` and `baseText` are R's, and the item stays dirty if the merged result differs from R.
6. Move the cursor to the largest `ts` applied. The cursor is also this device's reading of the database's clock ("Purging the Trash" below).

When all the records of one catch-up are applied, run the folder rules, the tree repair and the purge, in that order.

**Applying to an open note.** Wait for any save of that note to finish. Then, in one synchronous step: take the editor's current text as "ours", compute the merge, dispatch the change from ours to the merged text as one minimal transaction (common prefix and suffix kept, so cursor and scroll survive), marked as remote and outside the undo history (6.2), and create the IndexedDB transaction that stores the merged text. No keystroke can land between reading "ours" and applying the result, and IndexedDB commits transactions in the order they were created, so later typing is saved after it.

**Merge rules (`merge.ts`)**

Every rule compares three versions of one item: the base (the last revision both sides had), ours and theirs. No rule compares clocks. An item is "in the Trash" when it is marked deleted itself or lies inside a deleted folder (4.3).

| Part | Rule |
|---|---|
| Text | If ours equals base, take theirs. If theirs equals base, take ours. Otherwise run `node-diff3` on lines (base, ours, theirs). With no conflicting regions, take the merged text. With conflicts, keep ours in the note and create a new note beside it holding theirs, named `<name> (conflict YYYY-MM-DD HHmm, <their device>)`, with `<name>` shortened to keep the 200-character limit, and show the banner of 4.5. |
| Name and parent | Per field: if only one side changed it, take that side. If both changed it differently, take theirs, because the database's version is the same on every device. |
| Unknown metadata fields | Keep the union; theirs wins a clash |
| Settings | The JSON is merged per key, with the name and parent rule. |
| The deleted mark | If only one side changed anything since the base, take that side, a deletion or a restore included. If one side deleted the item and the other changed its text, name or parent, the change wins: the item is not deleted, and it keeps the change. If both deleted it, it is deleted. |
| Deleted forever (a tombstone that opens) | If this device has an edit to the item that is not uploaded yet (to its text, name or parent), the edit wins: the item is uploaded again as a live item, with its blob if it is a file. If the item is clean and outside the Trash here, it only moves to the Trash, and that state is uploaded, so a device that missed the deletion never loses a note in one step (I2). If the item is in the Trash here, or absent, the local copy, its file and its snapshots are deleted and a local tombstone is kept. A file whose bytes this device never downloaded is simply removed. |

**Folders: a deletion against changes inside (`folders.ts`)**

Deleting a folder marks only the folder (4.3), so the merge table alone cannot see a change that another device made inside it. Three rules cover that. In them, "an item inside" is any note, file or folder below the deleted folder, at any depth, that is not marked deleted itself.

| Rule | Situation | What this device does |
|---|---|---|
| F1 | A folder's deletion arrives from the database, and this device has changes inside the folder that are not uploaded yet: an edit, a new item, or an item moved in | The folder comes back. `deleted` is cleared on it and on every deleted folder between it and the changed item, and they upload as ordinary changes. |
| F2 | This device deleted a folder and has not uploaded that yet, and a catch-up brings a newer revision of an item inside it, or a new item inside it | The deletion is cancelled on this device and is never uploaded. The snackbar names the item that kept the folder. |
| F3 | After a catch-up, a deleted folder holds an item whose database time (`ts`) is later than the database time of the folder's deletion | The folder comes back, as in F1. Every device applies this rule to the same two database times, so they agree. |

Why three rules are enough: a device that knows a folder is deleted cannot change anything inside it, because the Trash hides it. A change inside a deleted folder was therefore always made by a device that had not seen the deletion. F1 catches it when the change is still waiting on this device, F2 when the deletion is, and F3 when both reached the database before either device saw the other's. The upload order of 5.8, a folder's deletion after this device's own changes inside it, keeps a device's earlier edits from looking like later ones: a note edited and then deleted with its folder on the same device stays deleted.

**Tree repair after pulling**

- **Cycles:** if following parents loops, move the item with the smallest id in the loop to the root, and upload that change. Every device applies the same rule, so they agree.
- **Orphans:** an item whose parent is unknown or deleted forever shows at the root. Nothing is written. This is left only for an item that another device added or changed without having seen its folder purged.
- **Name clashes** stay, marked in the tree (4.3).

**Purging the Trash (`purge.ts`)**

- **The clock.** With sync on, an item's time in the Trash runs from the `ts` of its current revision, which is the upload that put it in the Trash or a later one, to the cursor, which is the latest database time this device has seen. Both are the database's own times, so a wrong device clock can neither purge early nor keep an item for ever. A deletion that is not uploaded yet has no `ts` and is not purged. With sync off, `deletedAt` and the device's clock are used.
- **When.** After each catch-up, and once a day while the app stays open.
- **What.** Every item marked deleted for longer than the setting (4.13) is deleted forever: its record becomes a tombstone (5.5), and a file's blob is removed.
- **Folders.** Purging a folder, or deleting it forever by hand, first deletes forever every item that is inside it at that moment, the deepest first, each with its own tombstone, and the folder last. An item that F1 to F3 brought back out before then is no longer inside. The work is ordinary queued uploads, so it survives going offline or closing the app half-way.
- **Races.** Two devices that purge the same item race harmlessly: the second upload gets a 401, pulls the tombstone and is done.

**Catch-up (incremental pull)**

1. `GET moved`. If it is set and its marker opens (5.6), stop syncing and show "Your vault moved to a new key". If it is set and does not open, report a sync problem ("this vault's 'moved' marker is not valid"), do not believe it, and carry on.
2. `GET` the items changed since the cursor, minus a minute of overlap.
3. Pull each record in `ts` order. Run the folder rules, the tree repair and the purge. Then push whatever is dirty.

**Reconcile (full)**, used by "Connect to my vault", "Repair sync" and after moving to a new key. When a device connects to a key other than the one it last used, it first sets every local item's `rev` to 0; reconnecting to the same key keeps them.

1. `GET info`, check `format`, and check the passphrase against `check`.
2. Download every item, with progress.
3. Pull every record. A local item whose `rev` is 0 (never uploaded under this key) is merged with R, using as the common ancestor its `baseText` if it is dirty, or its own text if it is clean, because a clean item's text is the last version it synced.
4. Every local item missing from the database is marked dirty with `rev` 0, so it uploads as new. **Nothing local is ever deleted because the database lacks it.**
5. Set the cursor to the largest `ts`, then push everything dirty.

**Move to a new key**

1. Generate a key and a salt, derive the new key from the new passphrase, and `PUT info` under the new key.
2. Set every local item's `rev` to 0, keep `base` and `baseText`, and mark everything dirty.
3. Switch this device to the new key and push everything, with progress.
4. `PUT moved` under the old key, with its marker sealed by the old vault's key. If the rules refuse it because a marker is already there, tell the user that the other devices will not be told by themselves and must be given the new key by hand.
5. Show the new key with Copy. Other devices, once given the new key, reset their own `rev` values to 0 and reconcile, which merges any edits they made in the meantime.

**Invariants with their own tests**

- I1. Every saved edit is either in the database or marked dirty on the device.
- I2. Nothing the database says ever deletes a note that is outside the Trash on this device.
- I3. Applying the same record twice, or catching up twice, changes nothing.
- I4. Devices that stop editing reach identical vaults (items, names, parents, texts, deletion states) once each has caught up and has nothing left to upload.
- I5. After any merge, every text that existed on either device is still in the vault, in the note or in a conflict copy.
- I6. Nothing is ever written outside `/tamandua/<key>`.
- I7. A record that fails to open is never applied. That includes a tombstone and a `moved` marker.
- I8. A deletion never overrides a change that the deleting device had not seen: when sync settles, the changed item and every folder above it are outside the Trash.
- I9. While sync is on, nothing is purged from the Trash by a device clock.

**Performance.** The engine runs on the main thread, in chunks that yield every 50 items, so no task blocks input for more than 50 ms. If the M3c measurement of a 5,000-note download shows longer tasks, move the download, parsing and decryption into a dedicated worker. That fallback is approved in advance.

## 7. Milestones

There are twelve milestones, M0 to M11, done strictly in order. M3, sync, is the largest and the riskiest, so it is split into three gates (M3a, M3b, M3c): fourteen gates in all. Local data safety comes first, because losing a note is the worst possible bug. Sync comes next, because it shapes the data model. Live preview follows, because it is the hardest part of the interface. Everything after that is independent and lower risk.

| #   | Milestone                                          | What to build                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Accepted when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0  | Environment, skeleton and deploy                   | Check the toolchain, what the `gh` token can reach, and that the table of section 1.4 is filled in. Scaffold Vite, Svelte 5 and TypeScript with the two channels (`channel.ts`). Set up `npm run check`, `ci.yml`, `deploy.yml`, `release.yml` and `deploy/stable-deploy.yml` (section 9), `CLAUDE.md` and `docs/`. Manifest, icons (Appendix A) and service worker. **Spike A:** publish a skeleton to `NEXT_URL`, then take it through the real release path twice: Felipe pastes the stable workflow into the stable repository and deploys `v0.0.1` and then `v0.0.2` to `STABLE_URL`. Check on both sites the service worker, an offline reload, installing both apps side by side in Brave, the update prompt on stable, and putting `v0.0.1` back. **Spike B:** a shortcut probe page (`?probe`, on the next channel only) that logs which shortcuts of 4.12 reach the page. **Spike C:** test tooling on Fedora: Playwright's Chromium (natively, or in its container with podman), Brave through `executablePath`, and the Realtime Database emulator with the rules of Appendix B and one smoke test. **Spike D:** from the browser to the emulator: `PUT`, a multi-path `PATCH`, a 401 on a wrong revision, `print=silent`, the `ns` parameter and `EventSource` events; and a read-only button in the probe page that sends one `GET` for `/tamandua/<32 random characters>/head.json` to `NEXT_DB`, which is still locked. A 401 proves that Brave's Shields and the content security policy let the request through; a network error or a policy violation does not. | CI is green. Felipe opens `NEXT_URL` in Brave on Fedora, installs it, reloads it offline, and runs the probe. He deploys `v0.0.1` and `v0.0.2` to `STABLE_URL`, installs the stable app beside the test app, takes the update, and puts `v0.0.1` back. Then he repeats the checks on Windows. All four spikes are written up in `DECISIONS.md`, and 4.12 is updated from spike B.                                                                                                                               |
| M1  | Vault, tree and plain editor (on this device only) | The IndexedDB schema of 5.3, the vault model, the tree, name rules, create, rename, move, duplicate, the Trash with Undo, one CodeMirror editor in source mode, the welcome screen with only "Use only on this device for now" enabled, the one-window lock, and the 5.10 list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Unit tests pass for names, paths, the tree and the Trash. UI tests: nested folders and notes are created, renamed, moved, deleted, undone and restored, and everything survives a reload. A second tab shows the lock screen. Each rule of 5.10 has a passing test. Felipe approves screenshots of the shell.<br>Felipe requires change in the indent of the tree view. Align the first letter of folder and file names on the same level. The icon of the Settings should look like a cogwheel (gear)          |
| M2  | Saving, history, and plain Markdown in and out     | The save state machine of 6.2 with strict durability, the status bar's save state, the failure banner, the persistent-storage request, local snapshots and the History view, files in the vault with the image-link rules of 4.3, and everything in 4.15 that needs no database: export of the vault and of a folder to `.zip`, "Download as .md", import with its summary and Undo, and the export reminder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Typed text is in IndexedDB within 1 s. Closing the page abruptly 1 s after the last keystroke loses nothing. The snapshot rules pass with fake timers. Export then import into an empty vault reproduces every path, text and image byte for byte, nested and empty folders included (R12). The import fixtures of section 8 pass. A moved note's image links still resolve.                                                                                                                                    |
| M3a | Sync, part 1: format, rules and transport          | `crypto.ts` with its test vectors, `format.ts`, `rest.ts`, `stream.ts`, the upload schedule of 5.8, push and pull for every kind of item, files and their blobs included, catch-up, the sync chip, "Start a new synced vault", "Connect to my vault" for a device with no notes of its own, `database.rules.json` with its tests, and `tools/recover.mjs`. Merging comes in M3b: until then, a pulled record that meets local changes not yet uploaded is not applied, and the chip's details list the item as waiting for a merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Rules tests pass for every rule of Appendix B. The crypto vectors pass. Against the emulator: an edit, a new note, a rename and an imported image made on A appear on B within the budgets; offline changes upload on reconnecting; a page closed in mid-upload finishes later without duplicates; I1, I3, I6 and I7 hold. The recovery tool rebuilds the fixture vault exactly. Felipe publishes the rules to the test database (1.5) and syncs test notes between two Brave profiles on Fedora at `NEXT_URL`. |
| M3b | Sync, part 2: merges and deletions                 | `merge.ts` for text, names, parents and settings, conflict copies and their banner, the deletion rules across devices (the merge table and F1 to F3 in `folders.ts`), tombstones, `purge.ts` with the automatic emptying of the Trash, tree repair, snapshots before remote changes, remote changes outside the undo history, and the three-device simulation of section 8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Unit tests pass for every row of the merge table and for F1 to F3. The merge and deletion tests of section 8 pass against the emulator. The simulation passes 50,000 seeded runs, with I1 to I5, I8 and I9 checked after each. Felipe tries, on two Fedora profiles: edits to different lines, a deliberate conflict, and a note edited on one profile while its folder is deleted offline on the other.                                                                                                        |
| M3c | Sync, part 3: whole-vault flows                    | `reconcile.ts`, "Connect to my vault" on a device that already has notes, "Repair sync", the `moved` check, Settings → Sync (everything but "Move to a new key"), "Overwrite with this device's copy", and the handling of every response of 5.8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The remaining sync tests of section 8 pass. The initial-sync budget is met. Felipe syncs test notes between Fedora and a Windows PC at `NEXT_URL` with a test key: edits both ways, an offline edit, a deliberate conflict, and a deletion against an edit. The report says whether to release this state as `v0.1.0`, the first release with sync; if Felipe agrees, he first publishes the rules to the production database (1.5).                                                                            |
| M4  | Live preview, inline                               | Parser extensions, `reveal.ts`, `inline.ts` for headings, emphasis, strikethrough, highlight, code, links, lists, tasks, quotes, rules and escapes. Typing behaviours. The source-mode switch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Golden tests pass for every inline row of 4.2. Screenshot tests pass in both themes. Felipe's typing check finds no jumps, no lost cursor and no broken accented characters.                                                                                                                                                                                                                                                                                                                                    |
| M5  | Live preview, blocks and images                    | `blocks.ts` for images and tables. Code blocks with highlighting. Front matter. Pasting and dropping images. The large-note fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Golden and screenshot tests pass for the block rows. An image pasted on one device appears on the other. The typing budget is met on the 10,000-line fixture.                                                                                                                                                                                                                                                                                                                                                   |
| M6  | Tabs, split view and navigation                    | Tab bar, split view with two side-by-side panes, workspace restore, quick switcher, link opening, and the shortcuts of 4.12, as settled by spike B, for everything built so far. Each later milestone adds and tests the shortcuts of its own features.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | UI tests pass for tab behaviour, splitting, moving tabs between panes and workspace restore. Every shortcut of a feature that exists has a test. Felipe checks those shortcuts in a Brave tab and in the installed window, on Fedora and on Windows.                                                                                                                                                                                                                                                            |
| M7  | Search                                             | Find and replace in the note. All-notes search in a worker that reads the notes afresh for each search (4.7), with streaming results and cancel. Their shortcuts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Unit tests pass for the match options. A search made right after an edit, after a change synced from another device, after an import and after a deletion reflects each of them. The search budget is met on the 500-note fixture, and the time on the 5,000-note fixture is recorded. The search shortcuts have tests.                                                                                                                                                                                         |
| M8  | Appearance and settings                            | The settings dialog, the font list and picker for notes, size, line height, line width, the Solarized Light theme, and settings sync through the settings item. Their shortcuts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Font, size and theme changes apply live, survive a reload, and reach the other device. The contrast test of 4.9 passes. A check proves no font name appears outside `fonts.ts`. No dark styling appears when the system is in dark mode. The settings and font-size shortcuts have tests. Felipe approves both themes on screen.                                                                                                                                                                                |
| M9  | Calendar                                           | `weeks.ts`, the Calendar tab, the status-bar chip, midnight rollover, and Alt+C.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Every test vector in 4.8 passes. Alt+C has a test. Felipe compares the tab with the reference screenshot.                                                                                                                                                                                                                                                                                                                                                                                                       |
| M10 | Math, text colour and PDF                          | KaTeX inline and block widgets. The colour tool and colour span of 4.14. The print view and print flow, with the markdown-it rules and the parity list of 4.11. Their shortcuts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Golden tests pass for the math rules and for the colour span, including the patterns that must be rejected. The parity list passes in both the editor's parser and the print renderer. Alt+T and Ctrl+P have tests. Felipe produces a PDF of the kitchen-sink note, coloured text and images included, on Fedora. The Windows PDF is checked at the M11 gate.                                                                                                                                                   |
| M11 | Polish and release                                 | "Move to a new key", Settings → About (version, storage state, install button, "Reset app files", diagnostics), README, `THIRD_PARTY_LICENSES.md`, a performance pass against every budget, the full manual checklist on both systems, which on Windows includes the PDF and the shortcuts added since M6, and release `v1.0.0` to the stable channel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | The definition of done in section 2 is met.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Build it right the first time

Some features arrive late but shape code written early. Follow these from M1, so that later milestones add to the code and do not rewrite it.

- **The data model from the start.** Items, ids, every sync field of 5.3 (`rev`, `dirty`, `dirtySince`, `seq`, `base`, `baseText`), and the one-transaction rule exist from M1, even though nothing uploads until M3a. Every local change marks its item dirty.
- **Channels from the start.** Every storage name, cache name, lock name, app name and database address comes from `channel.ts`.
- **The look from the start.** The Tamanduá Light palette, the component styles and the fonts of 4.9 are in place from the first UI commit, as CSS variables. M8 adds only the settings screen and the Solarized values.
- **Panes from the start.** The workspace model holds a list of panes, each with a tab list, even while there is one pane. M6 adds only the second.
- **Settings store from the start.** Every tunable is read through the settings store with its default, even before a settings screen exists.
- **One strings file.** All text shown to the user lives in `src/lib/strings.ts`, so wording is easy to change later.
- **The hardening list.** Section 5.10 is done in M1, not at the end.
- **Look and feel.** The app is calm and uncluttered. Obsidian's default light layout, as `docs/reference/obsidian/` shows it, is the reference for spacing, sizes and proportions; the colours and fonts are those of 4.9. At the M1 gate Felipe approves screenshots of the empty shell, the tree and the welcome screen before more interface is built.

### The gate at the end of every milestone

1. `npm run check` and the unit, rules, sync and UI tests pass locally, and CI is green.
2. Comments are current: every new file has its header comment and every exported item its doc comment (section 10). `docs/ARCHITECTURE.md` matches the code.
3. `docs/PROGRESS.md` is updated. Anything decided along the way is in `docs/DECISIONS.md`.
4. `docs/MANUAL_TESTS.md` has five to ten new checks for Felipe, to run at `NEXT_URL`. He runs the Fedora checks at every gate. He runs the Windows checks only after M0, M3c, M6 and M11, so Windows checks accumulate between those points.
5. The work is merged to `main`, which publishes the next channel (section 9). After Felipe accepts the milestone, tag it `m<N>` (`m3a`, `m3b` and `m3c` for the three sync gates).
6. You post the milestone report (format in section 10) and stop. From M3c on, the report also says whether this state is worth releasing to stable, and why. Do not start the next milestone until Felipe says so.

## 8. Testing and verification

You cannot see the app, so every claim that something works needs evidence from one of the layers below. A feature with no test in any layer is not done.

| Layer | Tool | Covers | Runs |
|---|---|---|---|
| Logic | Vitest | `weeks.ts`, names, paths and the tree, the save reducer with fake timers, merge rules, the crypto format and its vectors, `reveal.ts`, decoration builders against golden files, parser extensions, fuzzy matching, import parsing | Every commit |
| Rules | Vitest sending REST requests to the Realtime Database emulator | Every rule of Appendix B, both allowed and refused: revisions, items with and without `meta`, `head`, `moved`, blobs that may be created and removed but not overwritten, and nothing readable or writable outside `/tamandua` | Every commit, and CI |
| Sync | Vitest for the engine with a fake clock and a fake transport, which includes the three-device simulation; Playwright with two or three browser contexts against `vite preview` and the emulator | The sync tests and the simulation below | Every commit, and CI |
| Interface | Playwright with Chromium against `vite preview`, so the real service worker runs | Every UI flow, offline mode (`context.setOffline(true)`), reloads, and screenshots of the kitchen-sink note in both themes compared with committed baselines | Every commit, and CI. Locally on Fedora. A Brave smoke run locally. |
| Plain Markdown | Vitest, Playwright, and Node.js for the recovery tool | The round trip of 4.15, the import fixtures, and `tools/recover.mjs` against the format-1 fixture | Every commit, and CI |
| Performance | Scripts in `scripts/perf/` using Playwright tracing and the Performance API | The budgets below | M3c, M5, M7, M11 |

Look at the screenshots yourself. After each UI change, take one, open it, and compare it with section 4. Report what you saw, not what you expected.

### Where each layer runs

- **Playwright on Fedora.** Playwright officially supports Ubuntu and Debian, but its Chromium usually runs on Fedora. Ask Felipe before running `npx playwright install chromium`, which downloads into `~/.cache/ms-playwright`. If it will not start, run Playwright in its official container image with podman, mounting only the project folder, and ask before pulling the image. CI on Ubuntu runs it natively.
- **Brave smoke run.** A small Playwright project launches the installed Brave through `executablePath` (find the binary with `which brave-browser brave-browser-stable`) and runs the critical flows: first run, typing, offline reload, a sync round trip with the emulator. It runs locally only, never in CI.
- **The emulator.** `firebase-tools` is a dev dependency, never installed globally. Tests run inside `npx firebase emulators:exec --project demo-tamandua --only database "<test command>"`. A project id that starts with `demo-` needs no login and cannot reach real Firebase. The emulator needs Java 21 or newer, and its first run downloads into `~/.cache/firebase`; ask Felipe before that download. `firebase.json` names `database.rules.json` and the emulator port, and nothing else.
- **CI** runs on `ubuntu-latest` with `actions/setup-node` and `actions/setup-java`, caching npm, Playwright's browser and the emulator.
- **Time box.** If Playwright or the emulator is not running reliably after one working session in M0, stop and report with a proposal.

### Fixtures

`tests/fixtures/` contains:

- A kitchen-sink note with every element of section 4.2, coloured text and images included.
- Notes whose names have accents, non-Latin scripts and spaces; one very long name; one at the 200-character limit.
- Folders nested five levels deep, and one empty folder.
- A note with colour spans that must be rejected: a second style property, a named colour, an unclosed span, a nested span.
- PNG, JPEG, GIF, WebP and SVG images; one image over 7 MB; one reference to a missing image.
- Import material: a folder with CRLF notes, a byte-order mark, a file that is not UTF-8, `.obsidian/` and `.git/` folders, unsupported file types, and a `.zip` of the same.
- A database export of a small vault in format 1, made with the test passphrase, to prove that old data keeps opening in every later version of the app and of `tools/recover.mjs`. Beside it, the folder of `.md` files and images that the recovery tool must produce from it.
- The parity list of 4.11.
- Generated by script and not committed: a 10,000-line note, a vault of 500 notes with about 2.5 MB of text for the search budget, and a vault of 5,000 notes with about 25 MB of text for the stress tests.

### Sync tests

"Devices" are Playwright browser contexts with separate storage, connected to the emulator with the same test key. Most tests use two, A and B. Those marked (3) use three.

Edits and merges:

- An edit on A appears on B within the budget while B shows the note. B's cursor and scroll position survive, and Ctrl+Z on B does not undo A's edit.
- A and B, both offline, edit line 2 and line 40 of one note. After reconnecting, both have both edits and no conflict copy exists.
- A and B, both offline, edit the same line. After reconnecting, the note keeps one version and a conflict copy holds the other, on both devices, and no text is lost (I5).
- (3) A, B and C, all offline, edit the same line. After all reconnect, the note holds one version, conflict copies hold the other two, and the three vaults are identical.
- A renames a folder while B moves a note into it. Both changes survive.
- A moves folder X into Y while B moves Y into X. After catching up, there is no cycle, and both vaults are identical (I4).
- A and B both have a note open. A uploads an edit, and B uploads its own edit to the same note within a second. A shows B's edit within the budget: the `put` for B's revision is not taken for A's own.
- B only receives A's typing for half an hour. B's history of that note gains at most one snapshot per 10 minutes.

Deletions:

- A deletes a folder while B, offline, edits a note inside it. After B reconnects, the folder and the note are back on both devices, with B's edit (F1).
- The other way round: A deletes the folder while offline and reconnects only after B's edit is in the database. The folder and the note stay on both devices (F2).
- A deletes a folder and B edits a note inside it, both online, with B's upload leaving before B has seen the deletion. The folder comes back on both (F3).
- A edits a note and then deletes its folder, both offline. After reconnecting, the folder stays deleted on both devices.
- A deletes a note while B, offline, edits it. The note is outside the Trash on both, with B's edit. The same holds when A is the one that was offline (I8).
- A deletes a note forever while B is offline with that note outside its Trash and unchanged. On B the note moves to the Trash and is not deleted (I2). With an edit on B that is not uploaded, the note comes back as a live note on both.
- A folder with notes and an image stays in the Trash past its time. It is purged with everything inside, the blob is gone from the database, and nothing reappears at the root on either device.
- With A's device clock set a year ahead, and again a year back, nothing is purged early, and the purge still happens when the database's time says so (I9).

Damage and refusals:

- A tombstone written without the vault's key, with the emulator's owner token, deletes nothing: not on the first write, and not on a second one after the device has synced again (I7).
- A record overwritten with garbage, written with the emulator's owner token, is never applied and is flagged unreadable (I7). "Overwrite with this device's copy" then uploads the local version, and both devices are clean again.
- A record replaced by an older revision with its `rev` raised fails to open and is not applied.
- A `moved` marker written without the vault's key is reported and not believed.
- The rules refuse a write. Sync stops with the "refused" message and does not retry in a loop. A 403 and a 413 stop sync in the same way.
- Requests fail at random, through route interception, during 200 edits on both devices. Afterwards both vaults are identical.

Whole-vault flows:

- A's page is closed in the middle of uploading 50 notes. After reopening, everything uploads once, without duplicates.
- A device with 30 notes kept only on the device connects to a vault of 100 notes. Both end with 130 notes and nothing is deleted.
- A moves the vault to a new key. B shows "moved", is given the new key, and keeps the edit it had not yet uploaded.
- Every request URL during the whole suite starts with the emulator's `/tamandua/<test key>/` path (I6), checked by request interception.
- The initial download of the 5,000-note vault meets its budget, with no task over 50 ms.

### The simulation

The engine, the merge rules, the folder rules and the purge are logic over a store and a transport, so they can run thousands of times without a browser. `tests/sim/` does that:

- Three simulated devices, each with an in-memory store, share one simulated database that enforces the revision rule and hands out rising times.
- A seeded random generator picks each step: create, edit, rename, move, delete, restore, delete forever, go offline, come back, catch up, upload one item, crash between an upload and its local commit, let the Trash time run out, or set a device clock wrong.
- At the end of a run all devices come online and sync until nothing is left to do. The test then checks I1 to I5, I8 and I9, and that the run settled within a bounded number of rounds.
- A failing seed is printed, and replaying it gives the same run. Every failure found becomes a named regression test.
- CI runs 2,000 seeds on every commit. A longer run of 50,000 seeds is part of the M3b gate and of every later change under `src/lib/sync/`.

### Invariants with their own tests

- Those of section 6.3, I1 to I9.
- Opening and browsing the app, with sync on, no edits and nothing due in the Trash, writes nothing to the database.
- The built app references no remote origin except its channel's database.
- Every storage, cache, lock and broadcast-channel name starts with the channel prefix.
- No note text, name, sync key or passphrase appears in the log store or the console during the whole UI suite.
- The contrast test of 4.9 passes for Tamanduá Light.
- Export, then import into an empty vault, reproduces every path, text and image byte for byte (R12).

### Budgets

These are targets. Figures are measured in Brave on Felipe's laptop unless noted. If one cannot be met, record the measurements and the cause in `DECISIONS.md` and ask.

| Measure | Budget |
|---|---|
| JavaScript needed for the first screen, gzipped | 300 KB or less. KaTeX, printing, the calendar, import and export, and the search worker load on demand. |
| Everything precached | 5 MB or less |
| Installed app started from the device to an editable note | 1 s or less |
| First visit over broadband to the welcome screen | 3 s or less |
| Opening a 50 KB note | 100 ms or less |
| Keystroke to paint in the 10,000-line note with live preview on, 95th percentile | 16 ms or less |
| Tree visible with 5,000 notes | 300 ms or less after start |
| All-notes search over 500 notes with 2.5 MB of text, two and a half times the expected vault | First results within 150 ms and complete within 500 ms, the reading of the notes from IndexedDB included |
| All-notes search over 5,000 notes with 25 MB of text | No budget. Measured in M7 and recorded in `DECISIONS.md`, to show how far the simple design reaches. |
| Edit stored on the device | 1 s or less after the last keystroke |
| Edit in the database, while online | 3 s or less after typing stops; 15 s or less during unbroken typing |
| Edit visible on another online device that has the note open | 5 s or less after typing stops |
| Initial sync of the 5,000-note vault over broadband | 60 s or less, with progress and no task over 50 ms |
| Memory with one note open | 200 MB or less for the page |
| CPU when idle | Near zero: no polling timers; only the stream's keep-alive |
| Database downloads for a device used two hours a day | 20 MB a day or less |

### What only Felipe can check

Put these in `docs/MANUAL_TESTS.md`, milestone by milestone: how typing feels, cursor jumps, text sharpness at 150% scaling on the 4K screen, font rendering, scrolling, installing both apps side by side in Brave on Fedora and Windows, Brave's Shields and storage settings, the release path and putting an older release back, printing to PDF, both themes, the split view, the calendar against its reference, shortcuts in a tab and in the installed window, and a real sync round trip between Fedora and Windows that includes a deliberate offline conflict and a deletion against an edit.

## 9. Build, deploy and release

Each channel is its own GitHub Pages site, in its own organisation, at the root of its own origin. The source repository publishes the next channel by itself. The stable site changes only when Felipe starts its deploy by hand.

| Channel | Address | Repository | Built from | Database | Storage prefix | App name |
|---|---|---|---|---|---|---|
| next | `NEXT_URL` | `NEXT_ORG/NEXT_ORG.github.io`, the source repository | The latest commit on `main`, at every push | `NEXT_DB` | `tamandua-next` | Tamanduá (next) |
| stable | `STABLE_URL` | `STABLE_ORG/STABLE_ORG.github.io`, one workflow and no code | A `vX.Y.Z` release of the source repository, when Felipe runs the deploy | `STABLE_DB` | `tamandua-stable` | Tamanduá |

**Builds**

- `npm run build:stable` and `npm run build:next` set `VITE_CHANNEL`. Vite's `base` is `/` for both. `channel.ts` derives everything that differs from the channel: the app name and the window title, the prefix of storage, cache, lock and broadcast-channel names, and the database address. The manifest's `id`, `start_url` and `scope` are `/` in both.
- Every build injects the version (from `package.json`, the only place it is written), the channel, the commit and the build date. Settings → About shows them.

**Workflows in the source repository**

- `ci.yml` runs on every pull request and every push to `main`: `npm ci`, `npm run check`, unit tests, the simulation, rules and sync tests inside the emulator, the recovery tool's test, both builds, Playwright against the next build, the remote-origin check and the bundle-size budget. Public repositories get Actions minutes free.
- `deploy.yml` runs on every push to `main`, and by hand. It builds the next channel and deploys it with `actions/upload-pages-artifact` and `actions/deploy-pages` (`pages: write`, `id-token: write`). A `concurrency` group stops two deployments overlapping.
- `release.yml` runs on every `v*` tag. It builds the stable channel from the tag, zips it as `tamandua-stable.zip`, and attaches the zip and its SHA-256 to the GitHub Release of that tag (`contents: write`). The release notes state the schema version of 5.3. It deploys nothing.

**The workflow in the stable repository**

- `deploy/stable-deploy.yml` in the source repository is the master copy. Felipe pastes it into the stable repository as `.github/workflows/deploy.yml` in M0, and again whenever the agent changes it. A milestone report must say when it has changed.
- It is named "Deploy stable" and runs only by hand (`workflow_dispatch`), with one input: the tag. It refuses anything that is not `vX.Y.Z`, downloads `tamandua-stable.zip` and its checksum from that release of the source repository (a public download that needs no token), verifies the checksum, and deploys the unpacked files to Pages (`pages: write`, `id-token: write`). It builds nothing, so the bytes that CI tested are the bytes that are served.
- The agent has no access to the stable repository (section 1.4). It can neither start nor change a stable deploy.

**Release steps**

1. Felipe says "release it".
2. The agent bumps the version in `package.json`, updates `CHANGELOG.md`, tags `vX.Y.Z` and pushes. `release.yml` builds the asset and creates the release.
3. The agent reports the tag, the schema version, and anything Felipe must do first. For the first release with sync, that is publishing the rules to the production database (1.5).
4. Felipe opens the stable repository → Actions → "Deploy stable" → Run workflow, and enters the tag.
5. Felipe opens `STABLE_URL`, takes the "A new version is ready" reload, and runs the release checklist from `docs/MANUAL_TESTS.md`.

**Planned releases.** `v0.0.1` and `v0.0.2` in M0 are skeletons that prove this path. From M3c on, every milestone report says whether the state is worth releasing. The plan recommends `v0.1.0` after M3c, the first release with sync, and `v0.2.0` after M5, with live preview and images, so that real use begins long before `v1.0.0` in M11. Felipe decides each time.

**Putting an older release back**

- Felipe runs "Deploy stable" with the older tag. The stable site changes only when that workflow runs, so the older release stays until he deploys another.
- Devices receive it like any update: "A new version is ready", then Reload.
- An older release is safe to put back only if its schema version (5.3) equals the current one; the release notes of each say which it has. If the schema has moved on, the older app refuses to open the data and offers only Reload (4.16). Nothing is damaged, but the fix must then be a new release and not an old one.

**Details**

- No workflow needs a secret. The source repository's workflows use only their own `GITHUB_TOKEN`, and the stable repository's workflow reads a public release. The database addresses in `channel.ts` are public by nature.
- Icons are generated once from `docs/reference/icon.svg` and its maskable variant (Appendix A) by `scripts/icons.ts`, which renders them with Playwright's Chromium, so no image tool is needed. The PNGs are committed.
- `THIRD_PARTY_LICENSES.md` is generated at release time from the production dependencies and the bundled fonts, and served with the app. The Solarized palette (MIT) is listed there.
- There is no other update mechanism: the service worker's prompt (4.16) is how a device moves to a new version. Data in IndexedDB is never touched by an update, except by a tested migration (5.3).

## 10. Working rules for the LLM

Work one milestone at a time, prove each claim with output, and stop at every gate. These rules outrank convenience.

### Process

1. Read `PLAN.md` in full at the start of the project. At the start of every later session, read `docs/PROGRESS.md` and `docs/DECISIONS.md` first, because you keep no memory between sessions.
2. Do the milestones in order. Inside a milestone, split the work into tasks small enough to commit separately, and list them in `PROGRESS.md` before starting.
3. For each task: write or extend the tests, implement, run `npm run check`, run the affected tests, look at a screenshot if the UI changed, commit.
4. Work on a branch named `m<N>-<name>`. Open a pull request, let CI finish, merge. After Felipe accepts the milestone, tag it.
5. End every session by updating `PROGRESS.md`: done, in progress, next, blockers.

### Deciding versus asking

| Situation | What to do |
|---|---|
| The plan fixes it | Follow the plan |
| The plan is silent on an implementation detail | Decide, and write one line in `DECISIONS.md` |
| The plan is silent on visible behaviour | Copy Obsidian as `docs/reference/obsidian/` shows it. Where the screenshots are silent too, use your knowledge of Obsidian. Record the choice, and list it in the milestone report as not verified against Obsidian. |
| It affects data safety, the database rules, the data or encryption format, security, scope, or a decision in section 3 | Stop and ask |
| The plan seems wrong | Stop and say why, with a proposal |
| The same failure survives three attempts | Stop, write up what was tried, and propose options |
| A spike or a tool set-up has taken a whole session without success | Stop, report what was tried, and propose the fallback |

### Code and dependencies

- Verify APIs against the installed versions. Read the type definitions in `node_modules`.
- Known traps: Svelte 4 syntax is wrong for Svelte 5 runes. `vite-plugin-pwa` and Workbox options change between major versions. Do not write CodeMirror code from memory.
- Never add the Firebase JavaScript SDK or any other library that talks to a server. All database traffic goes through `src/lib/sync/rest.ts`.
- Add a dependency only when it is needed. Record its purpose, licence and size in `DECISIONS.md`.
- Commit the lockfile. Use no pre-release versions.
- No `any` in TypeScript without a comment that justifies it. No swallowed errors: every failure reaches the user, the log, or both.
- Keep modules small, one job each, laid out as in section 5.2.
- Logs never contain note text, names, sync keys or passphrases.

### Comments and maintainability

Felipe will change this code later, possibly with a different agent. Every file must explain itself.

- Every source file starts with a header comment: what the module is for, what it owns, and which other modules it talks to.
- Every exported function, type and component has a doc comment (`/** */`) that states what it does, its parameters, its return value and how it can fail.
- Inside functions, comment the reason, not the mechanics: why a non-obvious step exists, which bug a workaround avoids, which rule of this plan a line implements. Cite the section, for example "PLAN 6.3".
- Every tunable value lives in `config.ts`, with a comment giving its unit, its sensible range and what changes when it is raised or lowered. No unexplained numbers anywhere else.
- Theme variables are declared in one file. Each has a comment saying where it is used.
- `docs/ARCHITECTURE.md` holds a module map and short how-to guides: how to add a Markdown element to live preview, a setting, a theme, a font, a shortcut, a field to the item metadata, a new encryption format, and a database rule.
- Comments are written in English and updated in the same commit as the code they describe. A stale comment is a defect.
- Do not comment the obvious, and do not leave commented-out code behind.
- A lint rule fails `npm run check` when an exported item has no doc comment (`eslint-plugin-jsdoc` or an equivalent).

### Evidence

- Never report that something works without the command output or screenshot that shows it.
- Never weaken, skip or delete a test to make the suite pass. If a test is wrong, say so and fix it in its own commit.
- State plainly what you could not verify and add it to `MANUAL_TESTS.md`. Brave-specific and visual behaviour belong there by default.

### Safety on this machine

The laptop dual-boots Fedora and Windows 11 from one disk.

- Work only inside the project folder and the system temporary directory, plus the tool caches named in section 8 (`~/.cache/ms-playwright`, `~/.cache/firebase`) after Felipe has approved the download.
- Never run `sudo`. Print the exact command and ask Felipe to run it.
- Never touch `/boot`, the EFI partition, the bootloader, Secure Boot keys, disk partitions, or any mounted Windows volume.
- Never delete files outside the repository.
- Never use `git push --force`, `git reset --hard` on pushed history, or `git clean -fdx` without asking.
- Ask before installing any global tool or pulling any container image. Name the tool and say why. Run containers rootless with podman, mounting only the project folder.
- Use only the GitHub token Felipe set up (section 1.4). Never ask for a wider one, never use an SSH key or another account, and never touch any repository other than the source repository.

### Safety for the databases and the stable site

`STABLE_DB` holds Felipe's real notes, and `STABLE_URL` is where he reads them.

- Never send a request to `STABLE_DB` or `NEXT_DB` from tests, scripts or your own commands. Their addresses appear only in `channel.ts` and are used only by built apps running in Felipe's browser. The single exception is the read-only probe button of spike D, which Felipe presses himself, against `NEXT_DB`.
- Never run `firebase login`, `firebase deploy`, `firebase use` with a real project, or any `firebase database:*` command. Use only `firebase emulators:exec` with the `demo-tamandua` project.
- Never publish rules. Felipe does it by hand, to the test database first.
- Never ask for, store or use Felipe's real sync key or passphrase. Tests use generated test keys and the test passphrase in the emulator.
- Run `tools/recover.mjs` only against fixtures and the emulator. Never point it at a real database.
- Deploy the next channel only through `deploy.yml`, by merging to `main`. You cannot deploy the stable channel, and you must not look for a way to: tag a release only when Felipe asks, and leave the deploy to him (section 9).

### Milestone report format

```text
Milestone M<N>: <name>
Built:            three to six bullets
Evidence:         test counts per layer, CI run link, screenshot paths, measurements
Deviations:       none, or each one with its reason
Decisions:        entries added to DECISIONS.md
Not verified:     what you could not check yourself
For Felipe:       five to ten checks at NEXT_URL, marked Fedora or Windows
Release:          from M3c on: whether this state is worth releasing, and why
Questions:        none, or a list
```

## 11. Risks and fallbacks

The risks most likely to cost time are sync correctness and the polish of live preview. Both are tested early, in M3a to M3c and in M4. The risks most likely to cost data are a browser clearing its storage and a passphrase being lost, which the settings of section 1.6, sync, export and the recovery tool guard against.

| Risk | How it shows | Fallback |
|---|---|---|
| The notes now live only in a browser profile and an encrypted database (1.1) | A lost profile, a cleared browser or a fault in sync could lose notes that plain files in Dropbox would have kept | Plain Markdown export with a reminder (4.15); the recovery tool, which needs neither the app nor a browser; the simulation and the invariants of section 8; early releases, so that real use starts while the app is still small |
| Brave clears the site's data ("Forget me when I close this site", clearing on exit, or "Clear browsing data") | The app starts at the welcome screen; edits that never synced are gone | The settings of 1.6, the persistent-storage request at every start, sync, the export reminder, and the README |
| Brave's Shields or the content security policy block the database | Sync never connects | Spike D in M0; a documented Shields exception for the site |
| The browser keeps some shortcuts | A shortcut does nothing, or the browser acts instead | Spike B in M0 and the fallbacks of 4.12 |
| The free plan's limits (1 GB stored, 10 GB downloaded a month, 100 connections, per project) | Writes fail, or the database stops serving until the next month | Each channel has its own project, so a fault on the test channel cannot use up the real vault's quota. Compression, the 7 MB file limit, streams closed when the page is hidden, coalesced catch-ups, and the size estimate in Settings. Moving to the paid Blaze plan is Felipe's decision. |
| Strangers who learn a database address write junk under made-up keys | The free quota runs out | Accepted for version 1; the addresses are public in the built app. Later work: Firebase Authentication (anonymous or Google sign-in), rules on `auth.uid`, and an ID token on every request. |
| Someone obtains the sync key | They can download ciphertext, guess passphrases offline, overwrite records with data that will not open, or write a false `moved` marker | A strong passphrase (4.5). Nothing they write is applied: items, tombstones and markers that do not open are ignored (5.7, I7), and "Overwrite with this device's copy" repairs an item. "Move to a new key" ends it. |
| The passphrase is forgotten | A new device cannot connect | Devices that have the notes keep them readable; "Move to a new key" from such a device; export |
| The sync key is lost with the only device | A new device cannot connect | The key is the name of the vault's branch, which Felipe can read in the Firebase console under `/tamandua`. The app tells the user to store it with the passphrase. |
| A stale deletion meets newer edits | A note edited on one device lands in the Trash because another device deleted it earlier, while offline | The rules of 6.3: a deletion never overrides a change its device had not seen (I8). The Trash keeps items for 30 days by the database's clock (I9). |
| A merge reads oddly when two devices edited nearby lines | The merged note needs a manual touch | Line-based merge only; conflict copies when lines overlap; a snapshot before every merge (History) |
| Device clocks disagree | Shown times look wrong | While sync is on, no rule of sync or of the Trash uses a device clock (6.3); device time is for display |
| The emulator behaves unlike the real database | Sync passes its tests and fails for Felipe | The probe of spike D, and Felipe's checks against the test database at the M3a, M3b and M3c gates, before any real note is synced |
| A broken version reaches devices | The app fails after an update | Updates only by the user's click; tested migrations; "Reset app files" in Settings → About; an older release put back by Felipe, which stays until he deploys again (section 9); an app that meets newer data refuses to touch it (4.16) |
| A fault in the test channel | Test code damages real notes | Ruled out by construction: the channels share no origin and no database, and the agent cannot deploy to stable |
| Live preview feels jumpy or loses the cursor | Text shifts while typing or selecting | The rules in 6.1, the golden tests and the M4 manual check. Source mode always works as an escape. |
| Typing is slow in long notes | The typing budget in section 8 is missed | Limit decoration work to the viewport, lower the large-note threshold, record the measurements |
| The vault grows far beyond the expected 200 notes | All-notes search takes longer than its budget | The simple design holds to about 10 MB of text (4.7), and M7 records the time at 25 MB. The approved next step is to keep the texts in the worker and send it each note that changes. |
| The installed app's launcher is missing from GNOME's app grid | The app opens only from `brave://apps` | Reported for Brave installed as a Snap. The README advises Brave from its RPM repository and names the workaround. |
| GitHub Pages is down | The app cannot be installed or updated | Installed copies keep working offline, and sync does not depend on Pages |
| The agent mixes old and new APIs | Build errors or subtle runtime bugs | Verify against installed types (section 10). Strict type checks in CI. |
| Scope creeps toward Obsidian | Features outside section 2 appear | The non-goals list. Ask before adding anything. |
| Coloured text is stored as an HTML span | Some Markdown viewers, GitHub among them, ignore the colour | Accepted. The text is never lost, and Obsidian shows the colour. |

## 12. Decisions confirmed by Felipe

Felipe has confirmed every ticked line below. Treat them as settled.

- [x] The app is named Tamanduá (`tamandua` where plain ASCII is needed).
- [x] It is a web app, not a desktop app: fast, offline-first, synced when the connection returns (17 November 2026).
- [x] It is published with GitHub Pages from a public repository, at two addresses of its own in two GitHub organisations: `STABLE_URL` for the stable app and `NEXT_URL` for the test channel (18 November 2026; this replaces `saddamware.github.io/tamandua/`).
- [x] Every note is encrypted on the device before it goes to Firebase (17 November 2026).
- [x] Sync uses Firebase of Tamanduá's own, not the homepage's database (18 November 2026).
- [x] The other changes of the review of 18 November are adopted, as section 1.11 lists them: the deletion rules, the Trash on the database's clock, sealed tombstones, strict durability, sync in three gates, the three-device simulation, and a GitHub token for the agent that reaches only the source repository.
- [x] Notes can always leave and enter the app as unencrypted `.md` files nested in their folders (4.15, R12) (18 November 2026).
- [x] The vault is expected to hold at most about 200 notes. All-notes search reads the notes afresh for each search and is sized for that (18 November 2026).
- [x] The icon is the tamanduá-bandeira drawing of Appendix A.
- [x] The calendar is display-only, with no notes or events attached to days. It opens as a tab, and a week chip sits in the status bar.
- [x] Links open with Ctrl+click.
- [x] Clicking a note opens it in the current tab, and Ctrl+click opens a new tab, as in Obsidian.
- [x] Images from the internet are never loaded. The app talks only to its own site and the database.
- [x] PDF export goes through the print dialog.
- [x] The interface is in English.
- [x] Settings travel between devices, the font for notes included.
- [x] Felipe starts with an empty vault. No Obsidian-specific syntax needs support.
- [x] Felipe tests on Windows at four points: after M0, M3c, M6 and M11.
- [x] The look is Tamanduá's own: a light theme in the icon's colours plus the gold `#E0A43A`, with Solarized Light as the alternative and no dark mode (17 November 2026).
- [x] The font for all notes is chosen in Settings from a short list of fonts made for reading on screens. Felipe will extend the list later (17 November 2026).
- [x] The code is heavily commented.

**To confirm before M0.** Revision 2 introduced these to make the confirmed decisions work. The rest of the plan assumes them. Felipe ticks each one, or tells the agent what to change, before M0 starts.

- [x] There are two Firebase projects, one per channel, and not one: test code and test data never share a database or a quota with the real vault (1.5).
- [x] The source code lives in `NEXT_ORG`'s repository. Stable deploys are started by Felipe by hand, and the agent has no access to the stable repository (1.4, section 9).
- [x] Stable releases are offered from M3c on, and the plan recommends `v0.1.0` after M3c and `v0.2.0` after M5 (section 9).
- [x] The app reminds Felipe to export when the last export is more than 7 days old, and he can change or silence that in Settings (4.13, 4.15).
- [x] The recovery tool `tools/recover.mjs` is part of version 1 (4.15).

## 13. Kickoff prompts

Paste the first block into Claude Code, in the project folder, to start. Paste the second at the start of every later session.

```text
Read PLAN.md completely before doing anything. You are the implementing agent it addresses.

Follow section 10 (working rules) at all times, especially the safety rules for this machine, for the databases and for the stable site.

Start with milestone M0 only:
1. Check that the table in section 1.4 is filled in and that every line under "To confirm before M0" in section 12 is ticked. If not, stop and ask me.
2. Check the toolchain: print the versions of node, npm, java, git and gh, the path of Brave, and what `gh auth status` reports. If anything from sections 1.3 and 1.4 is missing, give me the exact commands to run. Do not run sudo yourself.
3. Ask me before any download: Playwright's Chromium, the Firebase emulator, container images.
4. Scaffold the project as laid out in section 5.2, with the two channels of section 9.
5. Set up npm run check, ci.yml, deploy.yml, release.yml, deploy/stable-deploy.yml, CLAUDE.md and the docs/ files. Add database.rules.json from Appendix B with its first rules tests.
6. Run spikes A, B, C and D from section 7 and record the results in docs/DECISIONS.md. For spike A, give me the stable workflow to paste and tell me when to run it.
7. Merge to main so that the test channel is published, and tell me exactly what to check in Brave on Fedora and on Windows.

Stop when M0's acceptance criteria are met and give me the milestone report from section 10.
Ask before deviating from any decision in section 3.
```

```text
Read docs/PROGRESS.md and docs/DECISIONS.md, then the parts of PLAN.md that cover the next unfinished milestone.
Tell me in three lines where things stand and what you will do next, then continue.
Stop at the milestone gate.
```

## Appendix A. The app icon

Use this drawing everywhere the app shows an icon. Never redraw, simplify or "improve" it; generate every size from it (section 9). Felipe made it in the Tamanduá icon chat; it is also the file `docs/reference/icon.svg`.

| Colour | Hex | Where |
|---|---|---|
| Dark green | `#1F3A34` | Background, the dark band, the eye, the wrist patch; the theme's text colour (4.9) |
| Cream | `#F2E6CF` | Body, head, near legs; the theme's panels and the manifest's `theme_color` |
| Light cream | `#E9DCC3` | Tail and ear; hovered and selected rows |
| Shaded cream | `#CFC0A3` | Far legs; dividers |
| Nib gold | `#E0A43A` | Not in the final drawing (it coloured the pen nib of the first concept); the theme's accent (4.9) |

Files to generate into `public/icons/`, and commit:

| File | From | Purpose |
|---|---|---|
| `favicon.svg` | The icon, as is | Browser tab icon |
| `icon-32.png` | The icon | Fallback favicon |
| `icon-192.png`, `icon-512.png` | The icon | Manifest icons, `purpose: "any"` |
| `icon-maskable-512.png` | The maskable variant below | Manifest icon, `purpose: "maskable"` |

The welcome screen shows the icon at 96 px; the start-up splash shows it at 128 px on the theme's background.

**The icon** (`docs/reference/icon.svg`, 512 × 512, rounded corners):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Tamanduá-bandeira (giant anteater) icon -->
  <defs>
    <path id="bodyShape" d="M165 240 C200 215 270 212 330 222 C360 226 380 238 400 252 C438 272 474 288 492 310 C498 318 494 328 486 326 C464 314 432 304 404 302 C378 300 360 310 352 325 C340 345 300 352 255 352 C210 352 175 340 160 318 C145 295 145 258 165 240 Z"/>
    <path id="frontLeg" d="M294 318 C290 350 292 378 296 394 C293 403 298 410 308 410 L346 410 C355 410 355 399 346 397 L334 395 C334 372 338 345 340 322 Z"/>
    <clipPath id="bodyClip"><use href="#bodyShape"/></clipPath>
    <clipPath id="frontLegClip"><use href="#frontLeg"/></clipPath>
  </defs>
  <rect width="512" height="512" rx="112" fill="#1F3A34"/>
  <g transform="translate(256 256) scale(0.864) translate(-224 -316)">

    <!-- banner tail: long hair hanging down in a fringe -->
    <path d="M170 250 C118 230 30 234 -36 264 C-46 284 -40 312 -28 334 Q-18 352 -8 340 Q4 366 16 350 Q28 374 40 352 Q52 374 64 350 Q76 372 88 348 Q100 368 112 346 Q124 364 136 342 Q148 352 152 324 C158 304 162 284 174 270 Z" fill="#E9DCC3"/>

    <!-- far-side legs -->
    <path d="M200 312 C197 346 203 376 210 396 C208 402 212 404 218 404 L244 404 C251 404 251 396 244 395 L238 394 C239 368 243 342 247 320 Z" fill="#CFC0A3"/>
    <path d="M338 316 C335 348 337 374 340 390 C338 398 342 402 350 402 L376 402 C383 402 383 393 376 392 L368 391 C368 366 370 340 372 314 Z" fill="#CFC0A3"/>

    <!-- ear -->
    <ellipse cx="352" cy="230" rx="11" ry="14" fill="#E9DCC3"/>

    <!-- body, neck, head and long snout; deep sagging belly -->
    <use href="#bodyShape" fill="#F2E6CF"/>

    <!-- dark band: from the bottom of the neck up over the shoulder, tapering on the back -->
    <path clip-path="url(#bodyClip)" d="M320 364 L374 318 C344 280 304 242 262 233 C240 228 222 228 198 233 C250 248 292 300 320 364 Z" fill="#1F3A34"/>

    <!-- near hind leg: thick thigh, flat plantigrade foot -->
    <path d="M158 294 C153 334 165 370 174 394 C171 404 176 410 186 410 L224 410 C233 410 233 400 224 398 L212 396 C214 370 222 340 228 312 Z" fill="#F2E6CF"/>

    <!-- near front leg: heavy forearm, knuckle-walking fist -->
    <use href="#frontLeg" fill="#F2E6CF"/>
    <!-- dark wrist patch -->
    <rect clip-path="url(#frontLegClip)" x="280" y="364" width="80" height="20" fill="#1F3A34"/>
    <!-- folded claw -->
    <path d="M326 404 Q338 398 346 404" fill="none" stroke="#1F3A34" stroke-width="3.5" stroke-linecap="round"/>

    <!-- eye -->
    <circle cx="392" cy="262" r="5.5" fill="#1F3A34"/>
  </g>
</svg>
```

**The maskable variant** (`public/icons/icon-maskable.svg`): the same drawing on a full-bleed square, scaled to 82% so that the tail and the snout stay inside the central safe circle, whose radius is 40% of the size, when an operating system crops the icon to a circle or a squircle.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Tamanduá-bandeira (giant anteater) icon, maskable variant: full-bleed background,
       drawing scaled to 82% so it stays inside the central safe circle (radius 40% of the size) -->
  <defs>
    <path id="bodyShape" d="M165 240 C200 215 270 212 330 222 C360 226 380 238 400 252 C438 272 474 288 492 310 C498 318 494 328 486 326 C464 314 432 304 404 302 C378 300 360 310 352 325 C340 345 300 352 255 352 C210 352 175 340 160 318 C145 295 145 258 165 240 Z"/>
    <path id="frontLeg" d="M294 318 C290 350 292 378 296 394 C293 403 298 410 308 410 L346 410 C355 410 355 399 346 397 L334 395 C334 372 338 345 340 322 Z"/>
    <clipPath id="bodyClip"><use href="#bodyShape"/></clipPath>
    <clipPath id="frontLegClip"><use href="#frontLeg"/></clipPath>
  </defs>
  <rect width="512" height="512" fill="#1F3A34"/>
  <g transform="translate(256 256) scale(0.82) translate(-256 -256)">
  <g transform="translate(256 256) scale(0.864) translate(-224 -316)">

    <!-- banner tail: long hair hanging down in a fringe -->
    <path d="M170 250 C118 230 30 234 -36 264 C-46 284 -40 312 -28 334 Q-18 352 -8 340 Q4 366 16 350 Q28 374 40 352 Q52 374 64 350 Q76 372 88 348 Q100 368 112 346 Q124 364 136 342 Q148 352 152 324 C158 304 162 284 174 270 Z" fill="#E9DCC3"/>

    <!-- far-side legs -->
    <path d="M200 312 C197 346 203 376 210 396 C208 402 212 404 218 404 L244 404 C251 404 251 396 244 395 L238 394 C239 368 243 342 247 320 Z" fill="#CFC0A3"/>
    <path d="M338 316 C335 348 337 374 340 390 C338 398 342 402 350 402 L376 402 C383 402 383 393 376 392 L368 391 C368 366 370 340 372 314 Z" fill="#CFC0A3"/>

    <!-- ear -->
    <ellipse cx="352" cy="230" rx="11" ry="14" fill="#E9DCC3"/>

    <!-- body, neck, head and long snout; deep sagging belly -->
    <use href="#bodyShape" fill="#F2E6CF"/>

    <!-- dark band: from the bottom of the neck up over the shoulder, tapering on the back -->
    <path clip-path="url(#bodyClip)" d="M320 364 L374 318 C344 280 304 242 262 233 C240 228 222 228 198 233 C250 248 292 300 320 364 Z" fill="#1F3A34"/>

    <!-- near hind leg: thick thigh, flat plantigrade foot -->
    <path d="M158 294 C153 334 165 370 174 394 C171 404 176 410 186 410 L224 410 C233 410 233 400 224 398 L212 396 C214 370 222 340 228 312 Z" fill="#F2E6CF"/>

    <!-- near front leg: heavy forearm, knuckle-walking fist -->
    <use href="#frontLeg" fill="#F2E6CF"/>
    <!-- dark wrist patch -->
    <rect clip-path="url(#frontLegClip)" x="280" y="364" width="80" height="20" fill="#1F3A34"/>
    <!-- folded claw -->
    <path d="M326 404 Q338 398 346 404" fill="none" stroke="#1F3A34" stroke-width="3.5" stroke-linecap="round"/>

    <!-- eye -->
    <circle cx="392" cy="262" r="5.5" fill="#1F3A34"/>
  </g>
  </g>
</svg>
```

## Appendix B. The database rules

This is the complete `database.rules.json`. The same file is published to both databases, and it allows nothing outside `/tamandua`. Treat it as the starting point: prove every line with tests in the emulator during M0 and M3a, tighten it if a test shows a gap, and ask before loosening anything. Felipe publishes the file by hand: to the test database at the M3a gate, and to the production database before the first release with sync (section 1.5).

```json
{
  "rules": {
    "tamandua": {
      "$key": {
        "info": {
          ".read": "$key.length >= 32",
          ".write": "$key.length >= 32 && !data.exists() && newData.exists()",
          ".validate": "newData.hasChildren(['format', 'salt', 'check', 'created'])",
          "format":  { ".validate": "newData.val() === 1" },
          "salt":    { ".validate": "newData.isString() && newData.val().length <= 64" },
          "check":   { ".validate": "newData.isString() && newData.val().length <= 512" },
          "created": { ".validate": "newData.val() === now" },
          "$other":  { ".validate": false }
        },
        "moved": {
          ".read": "$key.length >= 32",
          ".write": "$key.length >= 32 && !data.exists() && newData.exists()",
          ".validate": "newData.hasChildren(['ts', 'check'])",
          "ts":     { ".validate": "newData.val() === now" },
          "check":  { ".validate": "newData.isString() && newData.val().length <= 512" },
          "$other": { ".validate": false }
        },
        "head": {
          ".read": "$key.length >= 32",
          ".write": "$key.length >= 32 && newData.exists()",
          ".validate": "newData.hasChildren(['ts', 'id', 'rev'])",
          "ts":     { ".validate": "newData.val() === now" },
          "id":     { ".validate": "newData.isString() && newData.val().length <= 40" },
          "rev":    { ".validate": "newData.isNumber()" },
          "$other": { ".validate": false }
        },
        "items": {
          ".read": "$key.length >= 32",
          ".indexOn": ["ts"],
          "$id": {
            ".write": "$key.length >= 32 && $id.length >= 16 && $id.length <= 40 && newData.exists()",
            ".validate": "newData.hasChildren(['rev', 'ts', 'kind', 'enc', 'meta']) && ((!data.exists() && newData.child('rev').val() === 1) || (data.exists() && newData.child('rev').val() === data.child('rev').val() + 1 && newData.child('kind').val() === data.child('kind').val()))",
            "rev":     { ".validate": "newData.isNumber()" },
            "ts":      { ".validate": "newData.val() === now" },
            "kind":    { ".validate": "newData.val() === 'note' || newData.val() === 'folder' || newData.val() === 'file' || newData.val() === 'settings'" },
            "enc":     { ".validate": "newData.val() === 1" },
            "meta":    { ".validate": "newData.isString() && newData.val().length <= 8192" },
            "body":    { ".validate": "newData.isString() && newData.val().length <= 7000000" },
            "size":    { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 7000000" },
            "deleted": { ".validate": "newData.val() === true" },
            "$other":  { ".validate": false }
          }
        },
        "blobs": {
          "$id": {
            ".read": "$key.length >= 32",
            ".write": "$key.length >= 32 && $id.length >= 16 && $id.length <= 40 && (!data.exists() || !newData.exists())",
            ".validate": "newData.isString() && newData.val().length <= 9500000"
          }
        }
      }
    }
  }
}
```

What changed from the first version of these rules: the homepage's `s` block is gone, because the databases are Tamanduá's own; `meta` is required on every item, tombstones included; `head` carries `rev`; `moved` carries a sealed `check`; and a blob can be created and removed but not overwritten.

## Sources

Checked on 17 and 18 November 2026. Re-check anything version-specific in M0.

- [Firebase Database REST API reference](https://firebase.google.com/docs/reference/rest/database): query parameters (`print=silent`, `shallow`, `timeout`), streaming events, error codes (a refused write is 401), conditional requests.
- [Firebase: saving data with REST](https://firebase.google.com/docs/database/rest/save-data) and [retrieving data with REST](https://firebase.google.com/docs/database/rest/retrieve-data): multi-path updates, server timestamps, `orderBy` with `startAt`, indexes.
- [Realtime Database limits](https://firebase.google.com/docs/database/usage/limits): 10 MB per string, 256 MB per REST write, key characters, depth 32.
- [Firebase pricing](https://firebase.google.com/pricing): Spark plan, 1 GB stored, 10 GB downloaded a month, 100 connections, one database per project.
- [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure): installation, Java requirement, `demo-` projects. Recent `firebase-tools` releases require Java 21 for the emulators.
- [Stack Overflow 70705753](https://stackoverflow.com/questions/70705753): the Realtime Database's JavaScript SDK has no disk persistence on the web.
- [GitHub Pages: what it is](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages): free accounts publish from public repositories; project sites live at `<owner>.github.io/<repository>`.
- [GitHub Pages: creating a site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site): an organisation's site is the repository named `<organization>.github.io`; Pages is free for public repositories of free organisations.
- [GitHub Pages sites of one account share browser storage](https://tomashubelbauer.github.io/github-pages-local-storage): storage belongs to the origin, not the path, which is why each channel has an organisation of its own.
- [GitHub: managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens): a fine-grained token is limited to one resource owner and to the repositories chosen for it.
- [Vite: deploying a static site](https://vite.dev/guide/static-deploy): the GitHub Pages workflow and the `base` option.
- [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa): Workbox `generateSW`, prompt-for-update.
- [MDN: Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API): one tab doing a job, `ifAvailable` and `steal`.
- [web.dev: persistent storage](https://web.dev/persistent-storage): `navigator.storage.persist()`, how Chromium decides without a prompt, that a refused request can be repeated, and that persistence does not survive the user clearing site data.
- [Chrome: IndexedDB durability](https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed/): relaxed by default since Chrome 121; `durability: 'strict'` waits for the disk.
- [Chrome keyboard shortcuts](https://support.google.com/chrome/answer/157179): Alt+F and Alt+E open the browser's menu.
- [Brave: Forgetful Browsing](https://brave.com/privacy-updates/25-forgetful-browsing/): "Forget me when I close this site" clears cookies, localStorage and IndexedDB.
- [Brave: language and font fingerprinting protections](https://brave.com/privacy-updates/17-language-fingerprinting/): why installed fonts may be hidden from pages.
- [Chrome developers: the File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) and [Brave issue 44411](https://github.com/brave/brave-browser/issues/44411): the API is off by default in Brave.
- [Brave community: PWAs on Linux missing from the application menu](https://community.brave.app/t/brave-pwas-on-linux-do-not-appear-in-application-menu-and-require-manual-launch-via-brave-apps/647785): the Snap-related launcher problem and its workaround.
- [Chromium: browser shortcuts in fullscreen](https://groups.google.com/a/chromium.org/g/blink-dev/c/wlRDnLbyVlk): Ctrl+T, Ctrl+W and Ctrl+N are not sent to web pages.
- [Playwright: browsers](https://playwright.dev/docs/browsers): channels and running an installed Chromium-based browser.
- [node-diff3](https://github.com/bhousel/node-diff3): three-way merge, MIT licence.
- Fonts for notes: [Inter](https://github.com/rsms/inter) (designed for computer screens, tall x-height), [Atkinson Hyperlegible Next](https://fonts.adobe.com/fonts/atkinson-hyperlegible-next) (Braille Institute, 2025, seven weights with italics), [Literata](https://fonts.google.com/specimen/Literata/about) (created for Google Play Books, for comfortable reading on any device), [Merriweather](https://rightfontapp.com/family/merriweather) (designed to be pleasant to read on screens), and [Fontsource](https://fontsource.org/fonts/literata/install) for the variable packages.
- [Obsidian developer docs: decorations](https://docs.obsidian.md/Plugins/Editor/Decorations) and [codemirror-rich-markdoc](https://github.com/segphault/codemirror-rich-markdoc): live-preview references.
- The review of this plan's first version (18 November 2026): the findings behind revision 2, summarised in section 1.11.
- whatweekisit.org, from Felipe's screenshot of 11 November 2026: calendar layout.
