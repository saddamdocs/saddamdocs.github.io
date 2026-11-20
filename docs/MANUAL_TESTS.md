# Manual tests

Checks only a person can make (PLAN 8, "What only Felipe can check"). Each milestone adds five to
ten. Run the Fedora checks at every gate; run the Windows checks after M0, M3c, M6 and M11, which
include every Windows check added since the last Windows run.

NEXT_URL is https://saddamdocs.github.io and STABLE_URL is https://tamanduanotes.github.io.

GitHub Pages can take up to about 10 minutes after a deploy to serve the new files everywhere.
If a check expects a new version and does not see one, wait and reopen the app.

## M0: skeleton, install, offline, release path, probes

### Before the first check (both systems)

In Brave, for both NEXT_URL and STABLE_URL: Shields panel → "Forget me when I close this site" off,
and neither site on a "clear data on exit" list (PLAN 1.6).

### Fedora

- [x] **F-M0-1 Next opens.** Open NEXT_URL in a Brave tab. It shows the anteater icon,
      "Tamanduá (next)", version 0.0.x, channel `next`, "Online", and a link to the probe. Within a
      few seconds the snackbar says "Tamanduá is ready to work offline".
- [x] **F-M0-2 Install next.** Brave menu → "Install Tamanduá (next)" (in recent Brave: menu →
      "Save and share" or "Cast, save and share" → "Install page as app"). A window opens with a
      cream title bar, and "Tamanduá (next)" appears in the GNOME app grid with the anteater icon.
- [x] **F-M0-3 Offline.** Turn the network off (Wi-Fi off, or unplug). Close the installed window and
      open it again from the app grid. It opens and says "Offline: the app still opens from this
      device." Turn the network back on.
- [x] **F-M0-4 Shortcut probe, tab.** In a Brave tab, open NEXT_URL/?probe. Press every shortcut in
      the table once, primary and fallback. Where Brave did something of its own (a menu, a dialog,
      a new tab, a bookmark star, the downloads page), tick "Brave also acted". Press "Copy results"
      and paste the JSON into the chat.
- [x] **F-M0-5 Shortcut probe, installed window.** In the installed "Tamanduá (next)" window, click
      "Open the shortcut and database probe" and repeat F-M0-4. "Display mode" must say
      "standalone (installed app)". Copy and paste the results.
- [x] **F-M0-6 Database probe (spike D).** On the probe page, press "Send the probe request".
      Expected: "PASS: the database answered 401…". Paste the line into the chat whatever it says.
      If it fails, try once more with Shields down for the site and say which result you got.
- [x] **F-M0-7 Paste the stable workflow.** In the stable repository
      (`tamanduanotes/tamanduanotes.github.io`) on github.com: Add file → Create new file, name
      `.github/workflows/deploy.yml`, content: the whole of `deploy/stable-deploy.yml` from the source
      repository. Commit to `main`.
- [x] **F-M0-8 Deploy v0.0.1.** Stable repository → Actions → "Deploy stable" → Run workflow → tag
      `v0.0.1`. When it is green, open STABLE_URL: "Tamanduá" (no "(next)"), version 0.0.1, channel
      `stable`, and no probe link. STABLE_URL/?probe shows the same screen, not the probe.
- [x] **F-M0-9 Both apps side by side.** Install STABLE_URL from Brave's menu ("Install Tamanduá").
      The app grid now has "Tamanduá" and "Tamanduá (next)", and both windows can be open at once.
- [x] **F-M0-10 Update prompt.** Run "Deploy stable" with `v0.0.2`. Close and reopen the installed
      "Tamanduá". Within a few seconds the snackbar says "A new version is ready" with "Reload".
      Nothing changes until you press Reload; then the version reads 0.0.2.
- [x] **F-M0-11 Put an older release back.** Run "Deploy stable" with `v0.0.1`. Reopen "Tamanduá":
      the prompt appears again, and after Reload the version reads 0.0.1.

### Windows (any PC with Brave)

- [x] **W-M0-1 Next opens and installs.** As F-M0-1 and F-M0-2, on Windows. The app appears in the
      Start menu.
- [x] **W-M0-2 Offline.** As F-M0-3 (airplane mode, or Wi-Fi off).
- [x] **W-M0-3 Shortcut probe, tab and window.** As F-M0-4 and F-M0-5. Paste both JSON results.
      Note anything Windows does with Alt (for example the browser menu opening).
- [x] **W-M0-4 Database probe.** As F-M0-6.
- [x] **W-M0-5 Stable app and update.** Install STABLE_URL beside the next app. Run "Deploy stable"
      with `v0.0.2`, reopen the stable app, take the update; then deploy `v0.0.1` again and take the
      update back. (Do this after the Fedora checks, or together with F-M0-10 and F-M0-11.)
