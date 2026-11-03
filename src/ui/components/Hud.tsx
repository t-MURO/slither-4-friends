import type { PrefsAdapter } from '../../adapters/types';
import type { Controller } from '../../app/controller';
import { useStore } from '../../core/store';
import { fmtScore } from '../../core/util';
import { RequestRow, shield, useDraggable } from './common';
import { useState } from 'preact/hooks';

/** The small "Coop" box: friend list with live status, plus Pause / Mouse / ⚙ buttons. */
export function Hud(props: { c: Controller; prefs: PrefsAdapter; onOpenPanel: () => void }) {
  const { c, prefs } = props;
  const v = useStore(c.view, (v) => ({
    rows: v.friendRows, requests: v.requests, signal: v.signal, pending: v.pendingJoin, showList: v.settings.hud,
    paused: v.paused, mouseLocked: v.mouseLocked, phase: v.phase, zoom: v.settings.zoom,
  }));
  const [minimized, setMin] = useState(() => prefs.get('min', false));
  const drag = useDraggable(prefs, 'pos');
  const connected = v.rows.some((r) => r.state === 'ok');
  const collapsed = minimized || !v.showList;
  const toggleMin = () => { setMin(!minimized); prefs.set('min', !minimized); };

  return (
    <div class="slc-hud" ref={drag.box} style={drag.style} {...shield}>
      <div class="hd" onMouseDown={drag.onHandleDown}>
        <span class={'dot' + (connected ? ' on' : '')} />
        <span>Coop</span>
        <button class={'pz first' + (v.paused ? ' on' : '')} disabled={!v.paused && v.phase !== 'playing'}
          title="Pause: your snake circles in place (key: P)" onClick={() => c.setPaused(!v.paused)}>
          {v.paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button class={'pz ms' + (v.mouseLocked ? ' on' : '')} title="Turn mouse control off/on: steer with arrow keys, boost with space (key: M)"
          onClick={() => c.setMouseLocked(!v.mouseLocked)}>
          {v.mouseLocked ? '🖱 off' : '🖱'}
        </button>
        <button class={'pz zm' + (v.zoom !== 1 ? ' on' : '')} title="Zoom: mouse wheel or + / − keys. Click for 100%"
          onClick={() => c.updateSettings({ zoom: 1 })}>{Math.round(v.zoom * 100)}%</button>
        <button class="ib" title="Coop settings & friends" onClick={props.onOpenPanel}>⚙</button>
        {v.showList && <button class="ib" title="Minimize" onClick={toggleMin}>{minimized ? '+' : '–'}</button>}
      </div>
      {v.requests.length > 0 && (
        <div class="bd">{v.requests.map((r) => <RequestRow key={r.code} c={c} code={r.code} name={r.name} />)}</div>
      )}
      {!collapsed && (
        <div class="bd">
          {v.signal === 'id-taken' && <div class="hint">The game is open in another tab with the same code; Coop runs there.</div>}
          {!v.rows.length && <div class="hint">Click <b>⚙</b> to see your friend code and add friends.</div>}
          {v.rows.map((r) => (
            <div class="fr" key={r.code}>
              <span class={'slc-sw' + (r.state === 'ok' ? '' : ' off')} style={{ background: r.color }} />
              <span class="slc-nm">{r.label}</span>
              {r.score != null && <span class="slc-scr" title="Length">{fmtScore(r.score)}</span>}
              <span class={'slc-in' + (r.near ? ' near' : '')}>{r.short}</span>
              {r.canJoin && <button class="slc-go" title="Join this friend's server" onClick={() => c.joinFriend(r.code)}>Join</button>}
            </div>
          ))}
          {v.pending && <div class="hint">Next game: <b>{v.pending}</b>'s server</div>}
        </div>
      )}
    </div>
  );
}
