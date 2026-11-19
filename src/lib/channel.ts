/**
 * Channel identity: everything that differs between the stable app and the test app (PLAN 9, 4.16).
 *
 * Owns the table of the two channels (name, app name, storage prefix, database address) and the
 * `channel` value the running app uses. This is the only file in the repository that holds the
 * database addresses (PLAN 10, "Safety for the databases").
 *
 * Talks to: nothing at run time. `vite.config.ts` imports `channelDefinition()` at build time to
 * name the manifest and the window title; the app imports `channel`.
 *
 * How the right channel ends up in a build: Vite replaces `__TAMANDUA_CHANNEL__` and
 * `__TAMANDUA_EMULATOR__` with literals (see vite.config.ts). The ternaries below then fold to a
 * single branch, so a stable build contains only the stable database address and a next build only
 * the next one. `scripts/check-origins.ts` proves this after every build (PLAN 5.9 rule 4).
 */

/** The two published channels (PLAN 1.7). */
export type ChannelName = 'stable' | 'next';

/** What a channel is, independent of how the app was built. */
export interface ChannelDefinition {
  /** `stable` or `next`. */
  readonly name: ChannelName;
  /** The name shown in the window title, the manifest and the install menu (PLAN 4.16). */
  readonly appName: string;
  /**
   * Prefix of every IndexedDB, cache, Web Lock and BroadcastChannel name (PLAN 5.9 rule 6).
   * Never change it for a published channel: the user's notes are stored under it.
   */
  readonly prefix: string;
  /** Origin of the channel's Firebase Realtime Database, with no trailing slash (PLAN 1.4). */
  readonly databaseUrl: string;
}

/** The channel as the running build sees it. */
export interface Channel extends ChannelDefinition {
  /**
   * The database namespace to send as `?ns=` when talking to the local emulator (PLAN 5.8),
   * or `null` for a real database.
   */
  readonly emulatorNamespace: string | null;
}

/** Stable: Felipe's real notes (PLAN 1.7). */
const STABLE: ChannelDefinition = {
  name: 'stable',
  appName: 'Tamanduá',
  prefix: 'tamandua-stable',
  databaseUrl: 'https://tamandua-notes-default-rtdb.europe-west1.firebasedatabase.app',
};

/** Next: the test channel, published from every merge to `main` (PLAN 1.7). */
const NEXT: ChannelDefinition = {
  name: 'next',
  appName: 'Tamanduá (next)',
  prefix: 'tamandua-next',
  databaseUrl: 'https://tamandua-test-default-rtdb.europe-west1.firebasedatabase.app',
};

/**
 * Returns the definition of a channel. Used at build time by `vite.config.ts`; the app itself
 * uses `channel`.
 *
 * @param name - `stable` or `next`.
 * @returns The channel's definition.
 */
export function channelDefinition(name: ChannelName): ChannelDefinition {
  return name === 'stable' ? STABLE : NEXT;
}

/**
 * Checks a string read from the environment.
 *
 * @param value - Any value, typically `process.env.VITE_CHANNEL` or a Vite mode.
 * @returns True when the value names a channel.
 */
export function isChannelName(value: unknown): value is ChannelName {
  return value === 'stable' || value === 'next';
}

/** Emulator settings injected by an `emulator` or `development` build; `null` otherwise. */
interface EmulatorTarget {
  readonly url: string;
  readonly namespace: string;
}

declare const __TAMANDUA_CHANNEL__: ChannelName;
declare const __TAMANDUA_EMULATOR__: EmulatorTarget | null;

// Outside a Vite build (for example when vite.config.ts imports this file in Node.js), the two
// constants do not exist. Fall back to `next` with no emulator so the import cannot throw.
const BUILT_CHANNEL: ChannelName =
  typeof __TAMANDUA_CHANNEL__ === 'undefined' ? 'next' : __TAMANDUA_CHANNEL__;
const BUILT_EMULATOR: EmulatorTarget | null =
  typeof __TAMANDUA_EMULATOR__ === 'undefined' ? null : __TAMANDUA_EMULATOR__;

/** The channel this build belongs to. Every channel-specific value in the app comes from here. */
export const channel: Channel = {
  ...(BUILT_CHANNEL === 'stable' ? STABLE : NEXT),
  ...(BUILT_EMULATOR === null
    ? { emulatorNamespace: null }
    : { databaseUrl: BUILT_EMULATOR.url, emulatorNamespace: BUILT_EMULATOR.namespace }),
};

/**
 * True in a next-channel build. A plain constant, so that code guarded by it (the probe page of
 * spikes B and D) folds away at build time and is left out of the stable build.
 */
export const IS_NEXT_BUILD: boolean = BUILT_CHANNEL === 'next';

/**
 * Builds a name for browser storage, caches, locks or broadcast channels (PLAN 5.9 rule 6).
 *
 * @param suffix - What the name is for, for example `instance`. Empty for the bare prefix.
 * @returns `<prefix>` or `<prefix>-<suffix>`.
 */
export function storageName(suffix = ''): string {
  return suffix === '' ? channel.prefix : `${channel.prefix}-${suffix}`;
}
