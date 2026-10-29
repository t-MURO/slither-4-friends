import type { Controller } from '../../app/controller';
import { useStore } from '../../core/store';
import { fmtScore } from '../../core/util';
import { shield } from './common';

/** Improved leaderboard (replaces the game's when enabled). Click a name to track it. */
export function Leaderboard(props: { c: Controller }) {
  const { c } = props;
  const v = useStore(c.view, (v) => ({
    rows: v.lbRows, rank: v.rank, count: v.playerCount, score: v.myScore,
    on: v.settings.lbImproved, phase: v.phase,
  }));
  if (!v.on || !v.rows.length || (v.phase !== 'playing' && v.phase !== 'dead')) return null;
  return (
    <div class="slc-lb" {...shield}>
      <div class="lh">
        <b>Leaderboard</b>
        <span>{v.count > 0 ? fmtScore(v.count) + ' players' : ''}</span>
      </div>
      {v.rows.map((r) => {
        const trackable = !r.me && !!r.name.trim();
        return (
          <div key={r.pos} class={'lr' + (r.me ? ' me' : '') + (r.mark ? ' mark' : '')}
            style={r.mark ? { borderLeftColor: r.mark } : undefined}
            title={trackable ? (r.tag === 'TRACKED' ? 'Click to stop tracking' : 'Click to track this player') : undefined}
            onClick={trackable ? () => c.toggleTrackName(r.name) : undefined}>
            <span class={'rk' + (r.pos <= 3 ? ' g' + r.pos : '')}>{r.pos}</span>
            <span class="sk" style={{ background: r.color }} />
            <span class="nm" style={r.mark ? { color: r.mark } : undefined}>
              {r.name.trim() ? r.name : <i>(no name)</i>}
              {r.tag && <span class="tg" style={{ background: r.tag === 'YOU' ? '#8fb3ff' : r.mark }}>{r.tag}</span>}
            </span>
            <span class="sc">{fmtScore(r.score)}</span>
          </div>
        );
      })}
      {v.rank > 0 && (
        <div class="lf">
          <span>Your rank <b>#{v.rank}</b> of {fmtScore(v.count)}</span>
          <span>Length <b>{fmtScore(v.score)}</b></span>
        </div>
      )}
    </div>
  );
}
