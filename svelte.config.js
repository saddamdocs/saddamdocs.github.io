/**
 * Svelte compiler settings, read by the Vite plugin, svelte-check and the ESLint plugin.
 *
 * Runes mode is forced for every component (PLAN 3: Svelte 5, runes syntax only), so
 * Svelte 4 syntax such as `export let` or `$:` fails to compile instead of silently working.
 */

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
  compilerOptions: {
    runes: true,
  },
};
