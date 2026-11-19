/**
 * Unit tests for `src/lib/csp.ts`: the policy must be exactly the text of PLAN 5.9 rule 1.
 */

import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../../src/lib/csp.ts';

/** PLAN 5.9 rule 1, copied verbatim. */
const PLAN_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://*.firebasedatabase.app; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'";

describe('content security policy (PLAN 5.9)', () => {
  it('published builds use the policy of the plan, word for word', () => {
    expect(contentSecurityPolicy()).toBe(PLAN_POLICY);
  });

  it('development and test builds add the emulator to connect-src only', () => {
    const dev = contentSecurityPolicy(['http://127.0.0.1:9000']);
    expect(dev).toBe(
      PLAN_POLICY.replace(
        'https://*.firebasedatabase.app',
        'https://*.firebasedatabase.app http://127.0.0.1:9000',
      ),
    );
  });

  it('never allows inline or remote scripts', () => {
    expect(contentSecurityPolicy()).toContain("script-src 'self';");
    expect(contentSecurityPolicy()).not.toContain('unsafe-eval');
  });
});
