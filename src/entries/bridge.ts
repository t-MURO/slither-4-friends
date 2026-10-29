// Extension content script (isolated world, has chrome.storage). Passes the
// stored config to the page script and saves what the page sends back, so
// slither.com and slither.io share one friend code, friend list and settings.
import { newCode } from '../core/util';

declare const browser: typeof chrome | undefined;
declare const chrome: any;

const api = typeof browser !== 'undefined' ? browser : chrome;
const store = api.storage.local;

async function push() {
  const d = await store.get(['profile', 'friends', 'settings']);
  let profile = d.profile;
  if (!profile?.code) {
    profile = { code: newCode(), name: profile?.name ?? '' };
    await store.set({ profile });
  }
  const cfg = { profile, friends: d.friends ?? [], settings: d.settings ?? {} };
  document.dispatchEvent(new CustomEvent('slcoop:config', { detail: JSON.stringify(cfg) }));
}

document.addEventListener('slcoop:ready', () => { void push(); });

document.addEventListener('slcoop:save', (e) => {
  const detail = (e as CustomEvent).detail;
  if (typeof detail !== 'string' || detail.length > 50_000) return;
  let c: any;
  try { c = JSON.parse(detail); } catch { return; }
  if (!c || typeof c !== 'object') return;
  const out: Record<string, unknown> = {};
  if (c.profile && typeof c.profile.code === 'string') out.profile = { code: c.profile.code, name: String(c.profile.name ?? '') };
  if (Array.isArray(c.friends)) out.friends = c.friends.slice(0, 50);
  if (c.settings && typeof c.settings === 'object') out.settings = c.settings;
  store.set(out);
});

// changes from another tab
api.storage.onChanged.addListener((changes: Record<string, unknown>, area: string) => {
  if (area === 'local' && (changes.profile || changes.friends || changes.settings)) void push();
});
