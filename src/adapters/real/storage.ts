// Storage adapters for the page script.
//  - extension: talks to bridge.js (extension storage, shared by slither.com and slither.io)
//  - local:     this site's localStorage (used when there is no extension, e.g. the dev loader)
import type { PrefsAdapter, StorageAdapter } from '../types';

const KEY = 'slcoop.cfg';

export function localPrefs(prefix = 'slcoop.'): PrefsAdapter {
  return {
    get(key, fallback) {
      try { const v = localStorage.getItem(prefix + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };
}

export function createLocalStorage(): StorageAdapter {
  return {
    kind: 'local',
    async load() {
      try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
    },
    save(cfg) {
      try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
    },
    onExternalChange(fn) {
      addEventListener('storage', (e) => {
        if (e.key !== KEY || !e.newValue) return;
        try { fn(JSON.parse(e.newValue)); } catch { /* ignore */ }
      });
    },
  };
}

/** Extension storage via bridge.js; falls back to localStorage when no bridge answers. */
export function createBridgeStorage(timeoutMs = 800): StorageAdapter {
  let kind: StorageAdapter['kind'] = 'extension';
  const local = createLocalStorage();
  let first = true;
  const listeners: ((raw: unknown) => void)[] = [];
  let resolveFirst: ((raw: unknown) => void) | null = null;

  document.addEventListener('slcoop:config', (e) => {
    let raw: unknown;
    try { raw = JSON.parse((e as CustomEvent).detail); } catch { return; }
    if (first) { first = false; resolveFirst?.(raw); return; }
    for (const fn of listeners) fn(raw);
  });

  return {
    get kind() { return kind; },
    load() {
      return new Promise((resolve) => {
        resolveFirst = resolve;
        document.dispatchEvent(new CustomEvent('slcoop:ready'));
        setTimeout(() => {
          if (!first) return;
          first = false;
          kind = 'local';
          resolve(local.load());
        }, timeoutMs);
      });
    },
    save(cfg) {
      if (kind === 'extension') document.dispatchEvent(new CustomEvent('slcoop:save', { detail: JSON.stringify(cfg) }));
      else local.save(cfg);
    },
    onExternalChange(fn) {
      listeners.push(fn);
      local.onExternalChange((raw) => { if (kind === 'local') fn(raw); });
    },
  };
}
