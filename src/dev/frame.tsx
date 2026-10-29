// Runs inside the playground iframe: a mock game world with the Coop app
// mounted on top, driven by the scenario from the dev panel.
import { createMemoryStorage } from '../adapters/mock/storage';
import { createMockNet } from '../adapters/mock/net';
import { createMockGame, MockWorld } from '../adapters/mock/world';
import { localPrefs } from '../adapters/real/storage';
import { mountCoop, type CoopApp } from '../app/mount';
import type { Layer } from '../ui/overlay/overlay';
import { loadState, saveState, type DevState } from './state';

export interface DevApi {
  state: DevState;
  world: MockWorld;
  net: ReturnType<typeof createMockNet>;
  storage: ReturnType<typeof createMemoryStorage>;
  app: CoopApp;
  /** change the scenario and apply it */
  update(fn: (s: DevState) => void): void;
}

declare global {
  interface Window { __dev?: DevApi }
}

async function main() {
  const state = loadState();
  const world = new MockWorld();
  const net = createMockNet(world);
  const storage = createMemoryStorage(state.config, (cfg) => { state.config = cfg; saveState(state); });
  let app: CoopApp | undefined;

  const apply = () => {
    world.nickname = state.nickname;
    const respawn = world.opts.bots !== state.bots || world.opts.namedRatio !== state.namedRatio;
    world.opts = { ...world.opts, bots: state.bots, namedRatio: state.namedRatio, zoom: state.zoom };
    if (respawn) world.respawnBots();
    if (world.phase !== state.phase && !(state.phase === 'playing' && world.phase === 'connecting')) world.setPhase(state.phase);
    net.friends = state.friends;
    net.signal = state.signal;
    if (app?.overlay) { app.overlay.layers.clear(); for (const l of state.layers) app.overlay.layers.add(l as Layer); }
  };

  // fake game canvas below the Coop UI
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d')!;
  let last = performance.now();
  const loop = (t: number) => {
    requestAnimationFrame(loop);
    const dpr = devicePixelRatio || 1;
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    world.step(Math.min(0.05, (t - last) / 1000));
    last = t;
    world.render(ctx);
    // the world may change phase by itself (dead -> menu, connecting -> playing)
    if (state.phase !== world.phase && world.phase !== 'connecting') { state.phase = world.phase; saveState(state); }
  };
  requestAnimationFrame(loop);

  // game-like input: mouse steers relative to the center, click boosts, arrows/space work
  addEventListener('mousemove', (e) => { if (world.mouseEnabled && !world.steering) { world.mouse.x = e.clientX - innerWidth / 2; world.mouse.y = e.clientY - innerHeight / 2; } });
  addEventListener('mousedown', (e) => world.handleMouseDown(e));
  addEventListener('mouseup', () => { world.mouse.boost = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  const key = (down: boolean) => (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') world.keys.left = down;
    else if (e.key === 'ArrowRight') world.keys.right = down;
    else if (e.key === 'ArrowUp' || e.key === ' ') world.keys.boost = down && !world.steering;
    else if (e.key === 'Enter' && down && world.phase === 'menu') { state.phase = 'playing'; world.setPhase('connecting'); }
  };
  addEventListener('keydown', key(true));
  addEventListener('keyup', key(false));

  apply();
  app = await mountCoop(
    { game: createMockGame(world), net, storage, prefs: localPrefs('slcoop.dev.') },
    { only: state.mode === 'app' ? null : state.mode },
  );
  apply();

  window.__dev = {
    state, world, net, storage, app,
    update(fn) { fn(state); saveState(state); apply(); },
  };
}

void main();
