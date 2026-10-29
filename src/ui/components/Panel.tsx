import { useState } from 'preact/hooks';
import type { PrefsAdapter } from '../../adapters/types';
import type { Controller } from '../../app/controller';
import { shield, useDraggable } from './common';
import { FriendsTab } from './FriendsTab';
import { MapTab } from './MapTab';
import { OptionsTab } from './OptionsTab';
import { TrackTab } from './TrackTab';

export const TABS = [
  ['friends', 'Friends', FriendsTab],
  ['track', 'Track', TrackTab],
  ['map', 'Map', MapTab],
  ['options', 'Options', OptionsTab],
] as const;
export type TabId = (typeof TABS)[number][0];

/** The ⚙ settings panel with its four tabs. */
export function Panel(props: { c: Controller; prefs: PrefsAdapter; onClose: () => void }) {
  const { c, prefs } = props;
  const [tab, setTab] = useState<TabId>(() => prefs.get('tab', 'friends'));
  const drag = useDraggable(prefs, 'panelPos');
  const Body = (TABS.find((t) => t[0] === tab) ?? TABS[0])[2];
  return (
    <div class="slc-panel" ref={drag.box} style={drag.style} {...shield}>
      <div class="ph" onMouseDown={drag.onHandleDown}>
        <h2>Slither Coop</h2>
        <button class="x" title="Close (Esc)" onClick={props.onClose}>×</button>
      </div>
      <div class="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} class={'tab' + (id === tab ? ' on' : '')} onClick={() => { setTab(id); prefs.set('tab', id); }}>{label}</button>
        ))}
      </div>
      <div class="pb"><Body c={c} /></div>
    </div>
  );
}
