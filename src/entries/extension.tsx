// Extension page script (runs in the game page's own JS world).
import { createPeerNet } from '../adapters/real/peer-net';
import { createSlitherGame } from '../adapters/real/slither-game';
import { createBridgeStorage, localPrefs } from '../adapters/real/storage';
import { mountCoop, type CoopApp } from '../app/mount';

declare global {
  interface Window { __slcApp?: CoopApp | null; __slcBooting?: boolean }
}

if (!window.__slcApp && !window.__slcBooting) {
  window.__slcBooting = true;
  mountCoop({ game: createSlitherGame(), net: createPeerNet(), storage: createBridgeStorage(), prefs: localPrefs() })
    .then((app) => { window.__slcApp = app; })
    .finally(() => { window.__slcBooting = false; });
}
