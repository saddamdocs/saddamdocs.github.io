/**
 * Entry point of the page: applies the theme, mounts the Svelte app and removes the start-up
 * splash (PLAN 5.10, "Start-up").
 *
 * Talks to: `settings/themes.ts` for the colours and `App.svelte` for everything else.
 */

import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { TAMANDUA_LIGHT, applyTheme } from './lib/settings/themes.ts';

// M1 reads the saved theme before the first paint. Until a settings store exists, the default.
applyTheme(TAMANDUA_LIGHT, document.documentElement);

const target = document.getElementById('app');
if (target === null) throw new Error('index.html has no #app element');

mount(App, { target });
document.getElementById('splash')?.remove();
