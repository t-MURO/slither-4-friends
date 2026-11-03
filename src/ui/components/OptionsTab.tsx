import type { Controller } from '../../app/controller';
import { useStore } from '../../core/store';
import { ZOOM_MAX, ZOOM_MIN } from '../../core/geometry';
import { Card, Range, Segmented, Toggle } from './common';

export function OptionsTab(props: { c: Controller }) {
  const { c } = props;
  const s = useStore(c.view, (v) => v.settings);
  const set = c.updateSettings;
  return (
    <>
      <Card>
        <Toggle label="Arrows pointing to friends" checked={s.arrows} onChange={(arrows) => set({ arrows })} />
        <Toggle label="Join friends' server automatically" checked={s.autoFollow} onChange={(autoFollow) => set({ autoFollow })} />
        <Toggle label="Show friend list in game" checked={s.hud} onChange={(hud) => set({ hud })} />
        <Toggle label="Subtle outline around friends' and tracked snakes" checked={s.outline} onChange={(outline) => set({ outline })} />
        <Toggle label="Improved leaderboard (off = the game's original)" checked={s.lbImproved} onChange={(lbImproved) => set({ lbImproved })} />
      </Card>
      <Card label="Zoom">
        <Range label="View" value={s.zoom} min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} format={(z) => Math.round(z * 100) + '%'}
          onChange={(zoom) => set({ zoom })} />
        <div class="slc-row" style={{ marginTop: '7px' }}>
          <div class="slc-muted slc-grow">Mouse wheel over the game or the <b>+</b> / <b>−</b> keys. 100% is the game's normal view.</div>
          <button class="slc-btn ghost" disabled={s.zoom === 1} onClick={() => set({ zoom: 1 })}>Reset</button>
        </div>
      </Card>
      <Card label="Pause">
        <div class="slc-set" style={{ marginTop: 0 }}>
          <span>Circle to the</span>
          <Segmented value={s.pauseSide} onChange={(pauseSide) => set({ pauseSide })} options={[['left', '↺ Left'], ['right', 'Right ↻']]} />
          <span />
        </div>
        <div class="slc-muted" style={{ marginTop: '7px' }}>
          Press <b>P</b> or the <b>⏸ Pause</b> button: your snake turns in a tight circle until you resume. Mouse, arrow keys and boost are ignored while paused.
        </div>
      </Card>
      <Card label="Mouse control">
        <div class="slc-muted">
          Press <b>M</b> or the <b>🖱</b> button to turn mouse steering and boosting off: your snake keeps its direction, you steer with the
          <b> ← →</b> arrow keys and boost with <b>space</b> / <b>↑</b>. Press again to turn the mouse back on. Clicking a snake to track it still works.
        </div>
      </Card>
    </>
  );
}
