<!--
  @component
  Spikes B and D (PLAN 7, M0), shown at `NEXT_URL/?probe` on the next channel only.

  Spike B: lists every shortcut of PLAN 4.12 and marks each one whose key press reaches the page.
  Matching key presses are cancelled with preventDefault, so a shortcut that the browser lets
  through does not also trigger the browser's own action. Felipe ticks "Brave also acted" by hand
  where Brave did something anyway, then copies the results as JSON into the chat.

  Spike D: one button sends a read-only GET to the locked test database through
  `sync/rest.ts` and reports whether the answer was the expected 401, a network failure, or a
  content security policy violation.

  Talks to: `probe/shortcuts.ts` for the table and matcher, `sync/rest.ts` for the request,
  `strings.ts` for its texts.
-->
<script lang="ts">
  import { SHORTCUTS, matches, type ShortcutRow } from './shortcuts.ts';
  import { probeLockedDatabase } from '../sync/rest.ts';
  import { probe as t } from '../strings.ts';
  import { build } from '../build.ts';
  import { channel } from '../channel.ts';

  interface Props {
    /** Leaves the probe and returns to the main screen. */
    onBack: () => void;
  }
  let { onBack }: Props = $props();

  /** Per-row result: whether the primary and the fallback reached the page, and Felipe's tick. */
  interface RowState {
    primary: boolean;
    fallback: boolean;
    browserActed: boolean;
  }

  const blank = (): RowState[] =>
    SHORTCUTS.map(() => ({ primary: false, fallback: false, browserActed: false }));

  let results = $state<RowState[]>(blank());
  let lastKey = $state('');
  let copied = $state(false);
  let jsonFallback = $state('');
  let dbMessage = $state('');
  let dbRunning = $state(false);

  const displayMode = window.matchMedia('(display-mode: standalone)').matches
    ? 'standalone (installed app)'
    : 'browser tab';

  /** Records a key press against every row it matches, and cancels it if it matched. */
  function onKeydown(event: KeyboardEvent): void {
    const mods = [
      event.ctrlKey ? 'Ctrl' : '',
      event.altKey ? 'Alt' : '',
      event.shiftKey ? 'Shift' : '',
      event.metaKey ? 'Meta' : '',
    ].filter(Boolean);
    lastKey = `${[...mods, event.key].join('+')}  (code ${event.code})`;
    let hit = false;
    SHORTCUTS.forEach((row: ShortcutRow, i: number) => {
      const state = results[i];
      if (state === undefined) return;
      if (matches(row.primary, event)) {
        state.primary = true;
        hit = true;
      }
      if (row.fallback !== null && matches(row.fallback, event)) {
        state.fallback = true;
        hit = true;
      }
    });
    if (hit) event.preventDefault();
  }

  /** The results as JSON, with enough context to tell the runs apart. */
  function report(): string {
    return JSON.stringify(
      {
        probe: 'spike-b',
        version: build.version,
        commit: build.commit,
        displayMode,
        userAgent: navigator.userAgent,
        rows: SHORTCUTS.map((row, i) => ({
          action: row.action,
          primary: row.primary.label,
          primaryReached: results[i]?.primary ?? false,
          fallback: row.fallback?.label ?? null,
          fallbackReached: row.fallback === null ? null : (results[i]?.fallback ?? false),
          browserActed: results[i]?.browserActed ?? false,
        })),
      },
      null,
      2,
    );
  }

  async function copy(): Promise<void> {
    const text = report();
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      jsonFallback = '';
    } catch {
      // The clipboard can be refused (permissions, focus). Show the text so it can be copied by hand.
      jsonFallback = text;
    }
  }

  async function runDbProbe(): Promise<void> {
    dbRunning = true;
    dbMessage = t.dbRunning;
    let violation = '';
    const onViolation = (e: SecurityPolicyViolationEvent): void => {
      violation = `${e.violatedDirective} blocked ${e.blockedURI}`;
    };
    document.addEventListener('securitypolicyviolation', onViolation);
    const result = await probeLockedDatabase();
    // The violation event is queued as a task; give it one turn to arrive.
    await new Promise((resolve) => setTimeout(resolve, 50));
    document.removeEventListener('securitypolicyviolation', onViolation);
    if (violation !== '') dbMessage = t.dbCsp + violation;
    else if (result.kind === 'network') dbMessage = t.dbNetwork + result.message;
    else if (result.status === 401) dbMessage = t.dbPass;
    else dbMessage = `${t.dbOther}${String(result.status)}.`;
    dbRunning = false;
  }
</script>

<svelte:window onkeydowncapture={onKeydown} />

<main class="probe">
  <header>
    <h1>{t.title}</h1>
    <button type="button" class="secondary" onclick={onBack}>{t.back}</button>
  </header>
  <p>{t.intro}</p>
  <p class="meta">
    {t.mode}: <strong data-testid="display-mode">{displayMode}</strong> · {channel.appName} · v{build.version}
  </p>
  <p class="meta">{t.lastKey}: <code data-testid="last-key">{lastKey}</code></p>

  <table>
    <thead>
      <tr>
        <th>{t.action}</th>
        <th>{t.shortcut}</th>
        <th>{t.reached}</th>
        <th>{t.fallback}</th>
        <th>{t.reached}</th>
        <th>{t.browserActed}</th>
      </tr>
    </thead>
    <tbody>
      {#each SHORTCUTS as row, i (row.primary.label)}
        {@const state = results[i]}
        {#if state}
          <tr>
            <td>{row.action}</td>
            <td><kbd>{row.primary.label}</kbd></td>
            <td class:ok={state.primary} data-testid="reached-{row.primary.label}">
              {state.primary ? 'yes' : '–'}
            </td>
            <td>
              {#if row.fallback}<kbd>{row.fallback.label}</kbd>{/if}
            </td>
            <td class:ok={state.fallback}>
              {#if row.fallback}{state.fallback ? 'yes' : '–'}{/if}
            </td>
            <td>
              <input
                type="checkbox"
                aria-label="{t.browserActed}: {row.primary.label}"
                bind:checked={state.browserActed}
              />
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>

  <p class="actions">
    <button type="button" class="primary" onclick={copy}>{copied ? t.copied : t.copy}</button>
    <button type="button" class="secondary" onclick={() => (results = blank())}>{t.reset}</button>
  </p>
  {#if jsonFallback}
    <textarea readonly rows="12">{jsonFallback}</textarea>
  {/if}

  <h2>{t.dbTitle}</h2>
  <p>{t.dbIntro}</p>
  <p>
    <button type="button" class="primary" disabled={dbRunning} onclick={runDbProbe}>
      {t.dbButton}
    </button>
  </p>
  {#if dbMessage}<p class="result" data-testid="db-result">{dbMessage}</p>{/if}
</main>

<style>
  .probe {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .meta {
    color: var(--text-muted);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 16px 0;
  }
  th,
  td {
    text-align: left;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    background: var(--dark);
    color: var(--on-dark);
  }
  td.ok {
    background: var(--highlight);
    font-weight: 600;
  }
  textarea {
    width: 100%;
    font-family: ui-monospace, monospace;
  }
  .result {
    padding: 8px 12px;
    background: var(--panel);
    border-left: 4px solid var(--accent);
  }
</style>
