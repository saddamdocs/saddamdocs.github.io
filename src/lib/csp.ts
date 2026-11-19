/**
 * The content security policy of the page (PLAN 5.9 rule 1).
 *
 * GitHub Pages cannot send headers, so the policy is written into `index.html` as a
 * `<meta http-equiv>` tag by vite.config.ts at build time. Keeping the text here, as a pure
 * function, lets a unit test pin it to the plan.
 *
 * Talks to: nothing. Imported by vite.config.ts and tests/unit/csp.test.ts.
 */

/**
 * Builds the policy string.
 *
 * @param extraConnect - Origins added to `connect-src`, for example the local database emulator
 *   (`http://127.0.0.1:9000`) in development and test builds. Empty for published builds.
 * @returns The policy, ready for the `content` attribute of the meta tag.
 */
export function contentSecurityPolicy(extraConnect: readonly string[] = []): string {
  const connect = ["'self'", 'https://*.firebasedatabase.app', ...extraConnect].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    // CodeMirror and KaTeX set inline styles (PLAN 5.9 rule 1).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // A wildcard, because Firebase may redirect a stream to another server of the same domain.
    `connect-src ${connect}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}
