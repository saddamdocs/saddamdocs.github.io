/**
 * Facts about this build, injected by Vite at build time (PLAN 9, "Builds"): the version from
 * `package.json`, the commit and the build date. Settings → About shows them from M11; the M0
 * skeleton shows them on its only screen.
 *
 * Talks to: nothing. The values come from `define` in vite.config.ts.
 */

declare const __TAMANDUA_BUILD__: BuildInfo;

/** What a build knows about itself. */
export interface BuildInfo {
  /** Semantic version from `package.json`, the only place it is written. */
  readonly version: string;
  /** Short git commit hash, or `unknown` when the build ran outside git. */
  readonly commit: string;
  /** Build time as an ISO 8601 string in UTC. */
  readonly date: string;
}

/** This build's version, commit and date. */
export const build: BuildInfo = __TAMANDUA_BUILD__;
