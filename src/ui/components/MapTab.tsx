import type { Controller } from '../../app/controller';
import { useStore } from '../../core/store';
import type { MapCorner } from '../../core/types';
import { Card, ColorSetting, Range, Segmented, Toggle } from './common';

const pct = (v: number) => Math.round(v * 100) + '%';

export function MapTab(props: { c: Controller }) {
  const { c } = props;
  const s = useStore(c.view, (v) => v.settings);
  const set = c.updateSettings;
  return (
    <>
      <Card>
        <Toggle label="Clear Coop minimap (replaces the game's)" checked={s.betterMap} onChange={(betterMap) => set({ betterMap })} />
        <div class="slc-set" style={{ marginTop: '10px' }}>
          <span>Position</span>
          <Segmented<MapCorner> value={s.mapCorner} onChange={(mapCorner) => set({ mapCorner })}
            options={[['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘']]} />
          <span />
        </div>
        <Range label="Size" value={s.mapSize} min={120} max={460} step={10} format={(v) => v + 'px'} onChange={(mapSize) => set({ mapSize })} />
      </Card>
      <Card label="Dots">
        <ColorSetting label="Your dot" value={s.myColor} onChange={(myColor) => set({ myColor })} />
        <ColorSetting label="Friends (default)" value={s.friendColor} onChange={(friendColor) => set({ friendColor })} />
        <Range label="Dot size" value={s.dotSize} min={3} max={12} step={1} format={(v) => v + 'px'} onChange={(dotSize) => set({ dotSize })} />
        <div class="slc-muted" style={{ marginTop: '6px' }}>Give a friend their own color with the swatch in the Friends tab.</div>
      </Card>
      <Card label="Look">
        <ColorSetting label="Background" value={s.mapBg} onChange={(mapBg) => set({ mapBg })} />
        <Range label="Background opacity" value={s.mapBgAlpha} min={0} max={1} step={0.05} format={pct} onChange={(mapBgAlpha) => set({ mapBgAlpha })} />
        <ColorSetting label="Other snakes" value={s.densityColor} onChange={(densityColor) => set({ densityColor })} />
        <Range label="Snake brightness" value={s.densityAlpha} min={0.1} max={1} step={0.05} format={pct} onChange={(densityAlpha) => set({ densityAlpha })} />
      </Card>
      <Card>
        <Toggle label="Names next to dots" checked={s.mapNames} onChange={(mapNames) => set({ mapNames })} />
        <Toggle label="Line from you to each friend" checked={s.mapLines} onChange={(mapLines) => set({ mapLines })} />
        <Toggle label="Grid lines" checked={s.mapGrid} onChange={(mapGrid) => set({ mapGrid })} />
        <div class="slc-row" style={{ marginTop: '10px' }}>
          <button class="slc-btn ghost" onClick={c.resetMap}>Reset map to defaults</button>
        </div>
      </Card>
    </>
  );
}
