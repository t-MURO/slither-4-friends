// Dev loader for the REAL game: `npm run dev` serves this file; load it into
// slither.com with the bookmarklet printed by the dev server. It replaces any
// running Coop instance (also the installed extension's) with the current
// source and swaps itself again on every rebuild — without reloading the
// game, so you keep your snake.
import { createPeerNet } from '../adapters/real/peer-net';
import { createSlitherGame } from '../adapters/real/slither-game';
import { createLocalStorage, localPrefs } from '../adapters/real/storage';
import { mountCoop, type CoopApp } from '../app/mount';

declare global {
  interface Window { __slcApp?: CoopApp | null; __slcDevSource?: EventSource }
}

async function boot() {
  window.__slcApp?.destroy();
  window.__slcApp = null;
  window.__slcApp = await mountCoop({ game: createSlitherGame(), net: createPeerNet(), storage: createLocalStorage(), prefs: localPrefs() });
  window.__slcApp.controller.toast('Coop dev build loaded');
}
void boot();

if (!window.__slcDevSource) {
  const es = new EventSource(__DEV_ORIGIN__ + '/esbuild');
  es.addEventListener('change', () => {
    const s = document.createElement('script');
    s.src = __DEV_ORIGIN__ + '/inject.js?' + Date.now();
    s.onload = () => s.remove();
    document.head.appendChild(s);
  });
  window.__slcDevSource = es;
}
