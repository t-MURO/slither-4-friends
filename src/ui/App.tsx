import { useEffect, useState } from 'preact/hooks';
import type { PrefsAdapter } from '../adapters/types';
import type { Controller } from '../app/controller';
import { Hud } from './components/Hud';
import { Leaderboard } from './components/Leaderboard';
import { Panel } from './components/Panel';
import { StatusPill, Toast } from './components/Toast';

export const COMPONENTS = ['Hud', 'Panel', 'Leaderboard', 'Toast', 'StatusPill'] as const;
export type ComponentName = (typeof COMPONENTS)[number];

/** All in-game UI. `only` renders a single component (dev playground isolation). */
export function App(props: { c: Controller; prefs: PrefsAdapter; only?: ComponentName | null }) {
  const { c, prefs, only } = props;
  const [panelOpen, setPanelOpen] = useState(only === 'Panel');

  // P = pause, M = mouse on/off, + / - = zoom, Esc = close panel (never while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { setPanelOpen(false); return; }
      const zoom = k === '+' || k === '=' ? 1 : k === '-' || k === '_' ? -1 : 0;
      if (k !== 'p' && k !== 'm' && !zoom) return;
      e.preventDefault();
      e.stopPropagation();
      const v = c.view.get();
      if (zoom) c.zoomBy(zoom);
      else if (k === 'm') c.setMouseLocked(!v.mouseLocked);
      else c.setPaused(!v.paused);
    };
    // mouse wheel over the game zooms (our own boxes stop wheel events, so they still scroll);
    // trackpads send many small deltas: one step per ~100 px
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (c.view.get().phase === 'menu') return;
      acc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const steps = Math.trunc(acc / 100);
      if (!steps) return;
      acc -= steps * 100;
      c.zoomBy(-steps);
    };
    addEventListener('keydown', onKey, true);
    addEventListener('wheel', onWheel, { passive: true });
    return () => { removeEventListener('keydown', onKey, true); removeEventListener('wheel', onWheel); };
  }, [c]);

  const show = (n: ComponentName) => !only || only === n;
  return (
    <div class="slc-root">
      {show('Hud') && <Hud c={c} prefs={prefs} onOpenPanel={() => setPanelOpen(!panelOpen)} />}
      {show('Panel') && panelOpen && <Panel c={c} prefs={prefs} onClose={() => setPanelOpen(false)} />}
      {show('Leaderboard') && <Leaderboard c={c} />}
      {show('Toast') && <Toast c={c} />}
      {show('StatusPill') && <StatusPill c={c} />}
    </div>
  );
}
