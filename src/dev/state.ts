// Scenario of the dev playground (mock world, mock friends, stored config,
// view options). Saved in localStorage so it survives live reloads.
import type { MockFriend } from '../adapters/mock/net';
import type { Phase, SignalState } from '../core/types';
import type { Layer } from '../ui/overlay/overlay';
import { ALL_LAYERS } from '../ui/overlay/overlay';
import type { ComponentName } from '../ui/App';

export interface DevState {
  mode: 'app' | ComponentName;
  viewport: string;
  layers: Layer[];
  phase: Phase;
  nickname: string;
  bots: number;
  namedRatio: number;
  zoom: number;
  signal: SignalState;
  friends: MockFriend[];
  /** what the "extension storage" contains */
  config: unknown;
}

const KEY = 'slcoop.devstate';

export const sampleFriend = (i: number, patch: Partial<MockFriend> = {}): MockFriend => ({
  code: ['LUKA-S2X7', 'MIAA-Q8ZZ', 'TOMM-K3F9', 'NOAH-PP42'][i % 4],
  name: ['Lukas', 'Mia', 'Tom', 'Noah'][i % 4],
  gnick: ['lukas_xx', 'mia', 'TomTom', 'noah'][i % 4],
  link: 'connected',
  addsMe: true,
  alive: true,
  server: 'same',
  otherSid: 4263,
  dist: 1800 + i * 900,
  angle: 40 + i * 110,
  orbit: true,
  score: 2400 + i * 1700,
  color: ['#ffa94d', '#c77dff', '#4dd2ff', '#ffe14d'][i % 4],
  sees: '',
  ...patch,
});

export function defaultState(): DevState {
  const friends = [sampleFriend(0), sampleFriend(1, { server: 'other', dist: 5000 }), sampleFriend(2, { addsMe: false })];
  return {
    mode: 'app',
    viewport: 'fill',
    layers: [...ALL_LAYERS],
    phase: 'playing',
    nickname: 'Tadeo',
    bots: 14,
    namedRatio: 0.6,
    zoom: 0.9,
    signal: 'online',
    friends,
    config: {
      profile: { code: 'DEVV-2345', name: 'Tadeo' },
      friends: friends.map((f) => ({ code: f.code, label: f.name, color: '' })),
      settings: { tracked: [{ name: 'MALFOY', color: '#ff4dd8' }] },
    },
  };
}

export function loadState(): DevState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultState();
}

export function saveState(s: DevState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export function resetState(): DevState {
  const s = defaultState();
  saveState(s);
  return s;
}

export const VIEWPORTS: Record<string, [number, number] | null> = {
  fill: null,
  '1920×1080': [1920, 1080],
  '1366×768': [1366, 768],
  '1280×720': [1280, 720],
  '800×600': [800, 600],
  'Phone 412×915': [412, 915],
};
