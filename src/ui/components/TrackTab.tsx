import { useEffect, useRef, useState } from 'preact/hooks';
import type { Candidate, Controller } from '../../app/controller';
import { useStore } from '../../core/store';
import { fmtDist, fmtScore, nameKey } from '../../core/util';
import { Card, Segmented, Toggle } from './common';

export function TrackTab(props: { c: Controller }) {
  const { c } = props;
  const v = useStore(c.view, (v) => ({ rows: v.trackRows, partial: v.settings.trackPartial, mark: v.settings.markMode }));
  const [query, setQuery] = useState('');
  const [color, setColor] = useState(() => c.nextTrackColor());
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [list, setList] = useState<Candidate[]>([]);
  const combo = useRef<HTMLDivElement>(null);

  // live candidate list while the dropdown is open
  useEffect(() => {
    if (!open) return;
    const update = () => setList(c.candidates());
    update();
    const t = setInterval(update, 700);
    const close = (e: MouseEvent) => { if (!combo.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close, true);
    return () => { clearInterval(t); document.removeEventListener('mousedown', close, true); };
  }, [open]);

  const q = nameKey(query);
  const shown = list.filter((x) => !q || nameKey(x.name || '(no name)').includes(q)).slice(0, 80);
  const typed = query.trim();
  const pick = (x: Candidate) => {
    if (x.snakeId != null && !x.name) c.toggleTrackSnake(x.snakeId, x.tracked ? undefined : color);
    else c.toggleTrackName(x.name, x.tracked ? undefined : color);
    if (!x.tracked) setColor(c.nextTrackColor());
    setList(c.candidates());
  };
  const trackTyped = () => {
    const e = c.trackName(typed, color);
    setErr(e ?? '');
    if (!e) { setQuery(''); setColor(c.nextTrackColor()); }
  };

  return (
    <>
      <Card label="Track a player">
        <div class="slc-combo" ref={combo}>
          <div class="slc-row">
            <div class="slc-grow">
              <input type="text" maxLength={24} placeholder="Search players near you or on the leaderboard…" autocomplete="off" spellcheck={false}
                value={query} onFocus={() => setOpen(true)}
                onInput={(e) => { setQuery((e.currentTarget as HTMLInputElement).value); setErr(''); setOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { if (shown[0] && !(typed && !shown.some((x) => nameKey(x.name) === q))) pick(shown[0]); else trackTyped(); }
                  if (e.key === 'Escape') setOpen(false);
                }} />
            </div>
            <input type="color" value={color} title="Color for the next player you track" onInput={(e) => setColor((e.currentTarget as HTMLInputElement).value)} />
          </div>
          {open && (
            <div class="slc-dd">
              {typed && !shown.some((x) => nameKey(x.name) === q) && (
                <div class="slc-di typed" onMouseDown={(e) => e.preventDefault()} onClick={trackTyped}>
                  <span class="dn">Track "{typed}" by name</span>
                </div>
              )}
              {!shown.length && !typed && <div class="slc-de">{list.length ? 'No match.' : 'No other players known yet. Start a game.'}</div>}
              {shown.map((x) => (
                <div key={x.key} class={'slc-di' + (x.tracked ? ' on' : '')} title={x.tracked ? 'Click to stop tracking' : 'Click to track'}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)}>
                  <span class="dk" style={{ background: x.color }} />
                  <span class={'dn' + (x.name ? '' : ' anon')}>{x.name || '(no name)'}</span>
                  <span class="dm">{[x.pos ? '#' + x.pos : '', x.dist != null ? fmtDist(x.dist) + ' away' : '', fmtScore(x.score)].filter(Boolean).join(' · ')}</span>
                  <span class="dc">{x.tracked ? '✓' : '+'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {err && <div class="slc-err">{err}</div>}
        <div class="slc-muted" style={{ marginTop: '7px' }}>Pick someone from the list, click a name on the leaderboard, or click a snake in the game.</div>
      </Card>

      <Card label="Mark snakes in the game with">
        <Segmented value={v.mark} onChange={(markMode) => c.updateSettings({ markMode })}
          options={[['click', 'Click'], ['shift', 'Shift+click'], ['right', 'Right-click'], ['off', 'Off']]} />
        <div class="slc-muted" style={{ marginTop: '7px' }}>
          Clicking on a snake's body tracks it (click again to stop) instead of boosting; clicks anywhere else still boost. Nameless snakes are tracked for this game only.
        </div>
      </Card>

      <Card label="Tracked">
        <div class="slc-list">
          {!v.rows.length && <div class="slc-muted">Nobody tracked yet.</div>}
          {v.rows.map((t) => (
            <div class="slc-item" key={t.key}>
              <input type="color" value={t.color} title="Color on map, outline and leaderboard"
                onInput={(e) => c.setTrackColor(t.key, (e.currentTarget as HTMLInputElement).value)} />
              <div class="slc-nm">{t.label}{t.temp && <span class="cd">this game</span>}</div>
              <span />
              <button class="rm" title="Stop tracking" onClick={() => c.untrack(t.key)}>×</button>
              <div class={'st' + (t.nearby ? ' ok' : '')}>{t.status}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Toggle label='Match part of a name (e.g. "zain" matches "ZAINE")' checked={v.partial} onChange={(trackPartial) => c.updateSettings({ trackPartial })} />
        <div class="slc-muted" style={{ marginTop: '8px' }}>
          The game server only sends you snakes near you. Tracked players show on your map and get an outline while they're in your area;
          after they leave, a fading ring marks where they were last seen. The leaderboard always shows their rank.
        </div>
      </Card>
    </>
  );
}
