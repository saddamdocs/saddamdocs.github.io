/**
 * This device's identity (PLAN 4.5, 4.13): a default device name from the operating system and the
 * browser, for example "Linux · Brave", and the device id kept in the `state` store.
 *
 * Talks to: `navigator` only.
 */

/** Browser fields this module reads that TypeScript's DOM types do not declare. */
interface NavigatorExtras {
  readonly brave?: { isBrave?: () => Promise<boolean> };
  readonly userAgentData?: {
    readonly platform?: string;
    readonly brands?: readonly { brand: string }[];
  };
}

/**
 * The operating system, from the user-agent data or the user-agent string.
 *
 * @param nav - The navigator; injected for tests.
 * @returns "Windows", "Linux", "macOS", "ChromeOS" or "This computer".
 */
export function operatingSystem(nav: Navigator & NavigatorExtras = navigator): string {
  const source = `${nav.userAgentData?.platform ?? ''} ${nav.userAgent}`;
  if (/Windows/i.test(source)) return 'Windows';
  if (/CrOS|Chrome OS/i.test(source)) return 'ChromeOS';
  if (/Mac/i.test(source)) return 'macOS';
  if (/Linux|X11/i.test(source)) return 'Linux';
  return 'This computer';
}

/**
 * The browser. Brave hides its name from the user-agent string but exposes `navigator.brave`.
 *
 * @param nav - The navigator; injected for tests.
 * @returns "Brave", "Edge", "Chrome" or "Browser".
 */
export async function browserName(nav: Navigator & NavigatorExtras = navigator): Promise<string> {
  try {
    if (nav.brave?.isBrave !== undefined && (await nav.brave.isBrave())) return 'Brave';
  } catch {
    // A failing check only changes the suggested name, which the user can edit.
  }
  const brands = nav.userAgentData?.brands?.map((b) => b.brand).join(' ') ?? nav.userAgent;
  if (/Edge?\b|Microsoft Edge/.test(brands)) return 'Edge';
  if (/Chrom/.test(brands)) return 'Chrome';
  return 'Browser';
}

/**
 * The default name of this device (PLAN 4.5): "Linux · Brave".
 *
 * @returns The suggested device name.
 */
export async function defaultDeviceName(): Promise<string> {
  return `${operatingSystem()} · ${await browserName()}`;
}
