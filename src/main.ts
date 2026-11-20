/**
 * Entry point of the page: applies the default appearance, mounts the Svelte app and removes the start-up
 * splash (PLAN 5.10, "Start-up").
 *
 * Talks to: `settings/apply.ts` for the colours and fonts and `App.svelte` for everything else.
 */

import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { applyAppearance } from './lib/settings/apply.ts';
import { DEFAULT_SETTINGS } from './lib/settings/schema.ts';

// The default appearance paints the first screen at once. The saved settings live in IndexedDB,
// which is asynchronous; start-up applies them before the shell shows (app/boot.ts), and the
// splash in index.html covers the moment in between (PLAN 5.10, "Start-up").
applyAppearance(DEFAULT_SETTINGS, document.documentElement);

const target = document.getElementById('app');
if (target === null) throw new Error('index.html has no #app element');

mount(App, { target });
document.getElementById('splash')?.remove();
