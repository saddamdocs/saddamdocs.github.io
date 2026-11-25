/**
 * Spike D (PLAN 7, M0): from a page of the app to the Realtime Database emulator, with the app's
 * real content security policy (the emulator build adds only the emulator to connect-src).
 *
 * Proves, from inside the browser: `PUT`, a multi-path `PATCH`, a 401 on a wrong revision,
 * `print=silent`, the `ns` parameter, and `EventSource` events on `head`. Also runs the probe
 * button against an emulator namespace in locked mode, which must report the 401.
 *
 * These requests run against the emulator only (PLAN 10). Run with `npm run test:ui`.
 */

import { expect, test } from '@playwright/test';
import { EMULATOR_PORT } from '../../playwright.config.ts';
import {
  EMULATOR_URL,
  LOCKED_RULES,
  RULES,
  SV,
  loadRules,
  namespace,
  randomId,
  randomKey,
  rest,
} from '../support/emulator.ts';

const APP = `http://127.0.0.1:${String(EMULATOR_PORT)}/`;
const SEALED = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/** The answer of a request sent from the page. */
interface PageResponse {
  status: number;
  text: string;
}

test.describe('spike D: browser to emulator', () => {
  const ns = namespace('spiked');
  const key = randomKey();

  test.beforeAll(async () => {
    await loadRules(ns, RULES);
  });

  test('REST requests and the stream work from the page under the CSP', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Content Security Policy')) violations.push(msg.text());
    });
    await page.goto(APP);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tamanduá');

    const base = `${EMULATOR_URL}/tamandua/${key}`;
    const id = randomId();

    // Open the stream first, as the app will (PLAN 5.8): EventSource on head.
    await page.evaluate(
      ({ url }) => {
        const w = window as unknown as { events: { type: string; data: string }[] };
        w.events = [];
        const source = new EventSource(url);
        for (const type of ['put', 'patch', 'keep-alive', 'cancel', 'auth_revoked']) {
          source.addEventListener(type, (e) => {
            w.events.push({ type, data: (e as MessageEvent<string>).data });
          });
        }
      },
      { url: `${base}/head.json?ns=${ns}` },
    );
    // The stream starts with a put of the current value (null for a new vault).
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { events: unknown[] }).events.length))
      .toBeGreaterThan(0);

    const send = (method: string, url: string, body?: unknown): Promise<PageResponse> =>
      page.evaluate(
        async ({ method, url, body }) => {
          const r = await fetch(url, {
            method,
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          return { status: r.status, text: await r.text() };
        },
        { method, url, body },
      );

    const item = (rev: number): Record<string, unknown> => ({
      rev,
      ts: SV,
      kind: 'note',
      enc: 1,
      meta: SEALED,
      body: SEALED,
      size: 3,
    });

    // PUT one item.
    const put = await send('PUT', `${base}/items/${id}.json?ns=${ns}`, item(1));
    expect(put.status).toBe(200);
    expect(JSON.parse(put.text)).toMatchObject({ rev: 1, kind: 'note' });

    // Multi-path PATCH with print=silent: item and head in one atomic write, empty 204 answer.
    const patch = await send('PATCH', `${base}.json?ns=${ns}&print=silent`, {
      [`items/${id}`]: item(2),
      head: { ts: SV, id, rev: 2 },
    });
    expect(patch).toEqual({ status: 204, text: '' });

    // A wrong revision is refused with 401, which the engine reads as a possible conflict.
    const stale = await send('PATCH', `${base}.json?ns=${ns}`, {
      [`items/${id}`]: item(2),
      head: { ts: SV, id, rev: 2 },
    });
    expect(stale.status).toBe(401);

    // The server time was filled in.
    const read = await send('GET', `${base}/items/${id}.json?ns=${ns}`);
    const record = JSON.parse(read.text) as { rev: number; ts: number };
    expect(record.rev).toBe(2);
    expect(Math.abs(record.ts - Date.now())).toBeLessThan(60_000);

    // The ns parameter isolates databases: another namespace does not see this vault.
    const other = await rest('GET', `/tamandua/${key}/items/${id}`, undefined, {
      ns: `${ns}-other`,
      owner: true,
    });
    expect(other.body).toBeNull();

    // The stream reported the new head to the page.
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { events: { type: string; data: string }[] }).events
            .filter((e) => e.type === 'put' || e.type === 'patch')
            .map((e) => e.data),
        ),
      )
      .toContainEqual(expect.stringContaining(`"rev":2`));

    // A write by another device (here: Node.js) also arrives on the stream.
    const otherId = randomId();
    const fromB = await rest(
      'PATCH',
      `/tamandua/${key}`,
      { [`items/${otherId}`]: item(1), head: { ts: SV, id: otherId, rev: 1 } },
      { ns },
    );
    expect(fromB.status).toBe(200);
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { events: { type: string; data: string }[] }).events.map(
            (e) => e.data,
          ),
        ),
      )
      .toContainEqual(expect.stringContaining(otherId));

    expect(violations).toEqual([]);
  });

  test('the probe button reports PASS against a locked database', async ({ page }) => {
    // The emulator build's probe talks to the default namespace. Lock it like a new database.
    await loadRules('demo-tamandua-default-rtdb', LOCKED_RULES);
    try {
      await page.goto(`${APP}?probe`);
      await page.getByRole('button', { name: 'Send the probe request' }).click();
      await expect(page.getByTestId('db-result')).toHaveText(/^PASS/);
    } finally {
      // The sync tests use this namespace with the real rules.
      await loadRules('demo-tamandua-default-rtdb', RULES);
    }
  });
});
