// Canvas overlay drawn on top of the game every frame: minimap, arrows,
// rings, outlines, tracked players. Each layer can be switched off (dev).
import type { GameAdapter } from '../../adapters/types';
import type { Controller } from '../../app/controller';
import { LAST_SEEN_MS } from '../../app/controller';
import { edgePoint, worldToMap } from '../../core/geometry';
import type { GameSnapshot, Settings, SnakeInfo } from '../../core/types';
import { fmtDist, fmtScore, hexA } from '../../core/util';

export type Layer = 'outlines' | 'minimap' | 'friends' | 'tracked' | 'banner';
export const ALL_LAYERS: Layer[] = ['outlines', 'minimap', 'friends', 'tracked', 'banner'];

export interface Overlay {
  canvas: HTMLCanvasElement;
  layers: Set<Layer>;
  destroy(): void;
}

export function startOverlay(c: Controller, game: GameAdapter, parent: HTMLElement = document.body): Overlay {
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147482000';
  parent.appendChild(cv);
  const ctx = cv.getContext('2d')!;
  const layers = new Set<Layer>(ALL_LAYERS);
  const dens = document.createElement('canvas');
  const dctx = dens.getContext('2d')!;
  let densAt = 0;
  let raf = 0;

  const label = (text: string, x: number, y: number, color: string, size = 13) => {
    ctx.font = `bold ${size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  const dot = (x: number, y: number, r: number, color: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.stroke();
  };
  const arrow = (sx: number, sy: number, color: string, l1: string, l2: string, pulse: number, scale: number) => {
    const p = edgePoint(sx, sy, innerWidth, innerHeight, 48);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ang);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(24, 0); ctx.lineTo(-11, -15); ctx.lineTo(-4, 0); ctx.lineTo(-11, 15); ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8 + pulse * 0.2;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.stroke();
    ctx.restore();
    const lx = p.x - Math.cos(p.ang) * 40, ly = p.y - Math.sin(p.ang) * 36;
    label(l1, lx, ly - 8, color, 13 * Math.max(scale, 0.9));
    label(l2, lx, ly + 8, '#ffffff', 12);
  };

  // thin ring around a snake body: stroke wider than the body, then cut out the inside
  function outline(snap: GameSnapshot, s: SnakeInfo, color: string) {
    const cam = snap.camera!;
    const pts = s.points();
    if (pts.length < 4) return;
    const path = new Path2D();
    let [x, y] = cam.toScreen(pts[0], pts[1]);
    path.moveTo(x, y);
    for (let i = 2; i + 1 < pts.length; i += 2) { [x, y] = cam.toScreen(pts[i], pts[i + 1]); path.lineTo(x, y); }
    const [ax] = cam.toScreen(0, 0), [bx] = cam.toScreen(s.width, 0);
    const w = Math.abs(bx - ax);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = w + 6;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = w + 1;
    ctx.stroke(path);
    ctx.restore();
  }

  function mapGeometry(snap: GameSnapshot, s: Settings) {
    const mm = snap.minimap;
    if (!mm) return null;
    let cx: number, cy: number, rad: number;
    if (s.betterMap) {
      rad = s.mapSize / 2;
      const m = 16;
      cx = s.mapCorner.endsWith('l') ? m + rad : innerWidth - m - rad;
      cy = s.mapCorner.startsWith('t') ? m + rad : innerHeight - m - rad - 14;
    } else {
      if (!mm.nativeRect) return null;
      ({ cx, cy, rad } = mm.nativeRect);
    }
    return { cx, cy, rad, at: (x: number, y: number) => worldToMap(x, y, mm.grd, mm.flux, cx, cy, rad) };
  }

  function drawMapBase(snap: GameSnapshot, s: Settings, g: NonNullable<ReturnType<typeof mapGeometry>>, t: number) {
    const { cx, cy, rad } = g;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = hexA(s.mapBg, s.mapBgAlpha);
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    if (s.mapGrid) {
      ctx.fillStyle = 'rgba(255,255,255,.045)';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, rad, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy); ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, rad / 2, 0, Math.PI * 2); ctx.stroke();
    }
    const src = snap.minimap?.density;
    if (src && src.width) {
      if (t - densAt > 120 || dens.width !== src.width) {
        densAt = t;
        dens.width = src.width;
        dens.height = src.height;
        dctx.clearRect(0, 0, dens.width, dens.height);
        dctx.globalCompositeOperation = 'source-over';
        dctx.drawImage(src, 0, 0);
        dctx.globalCompositeOperation = 'source-in';
        dctx.fillStyle = s.densityColor;
        dctx.fillRect(0, 0, dens.width, dens.height);
        dctx.globalCompositeOperation = 'source-over';
      }
      ctx.imageSmoothingEnabled = (rad * 2) / dens.width < 2.2;
      ctx.globalAlpha = s.densityAlpha;
      ctx.drawImage(dens, cx - rad, cy - rad, rad * 2, rad * 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.stroke();
    if (snap.server?.sid) label('server ' + snap.server.sid, cx, cy + rad + 10, 'rgba(220,230,245,.75)', 11);
  }

  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    const snap = game.snapshot();
    c.frame(snap);
    const dpr = devicePixelRatio || 1;
    const vw = innerWidth, vh = innerHeight;
    if (cv.width !== Math.round(vw * dpr) || cv.height !== Math.round(vh * dpr)) { cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    if (!snap.self || !snap.camera || (snap.phase !== 'playing' && snap.phase !== 'dead')) return;

    const s = c.view.get().settings;
    const cam = snap.camera;
    const me = snap.self;
    const pulse = 0.5 + 0.5 * Math.sin(t / 220);
    const friends = c.friendsHere();
    const tracked = c.trackedVisible();

    if (layers.has('outlines') && s.outline) {
      for (const f of friends) {
        const sn = nearestSnake(snap.snakes, f.dx, f.dy, f.gnick);
        if (sn) outline(snap, sn, f.color);
      }
      if (layers.has('tracked')) for (const v of tracked) outline(snap, v.snake, v.color);
    }

    const g = layers.has('minimap') ? mapGeometry(snap, s) : null;
    if (g && s.betterMap) drawMapBase(snap, s, g, t);

    if (layers.has('friends')) {
      for (const f of friends) {
        const sn = nearestSnake(snap.snakes, f.dx, f.dy, f.gnick);
        const [sx, sy] = cam.toScreen(sn ? sn.x : f.dx, sn ? sn.y : f.dy);
        const m = 48;
        if (sx > m && sx < vw - m && sy > m && sy < vh - m) {
          const rr = 26 + pulse * 6;
          ctx.beginPath();
          ctx.arc(sx, sy, rr, 0, Math.PI * 2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = 0.9;
          ctx.stroke();
          ctx.globalAlpha = 1;
          label(f.label, sx, sy - rr - 12, f.color);
        } else if (s.arrows) {
          arrow(sx, sy, f.color, f.label, fmtDist(Math.hypot(f.x - me.x, f.y - me.y)) + (f.score != null ? ' · ' + fmtScore(f.score) : ''), pulse, 1);
        }
      }
    }

    if (layers.has('tracked')) {
      for (const v of tracked) {
        const [sx, sy] = cam.toScreen(v.snake.x, v.snake.y);
        const m = 40;
        if (sx > m && sx < vw - m && sy > m && sy < vh - m) label(v.label + ' · ' + fmtScore(v.snake.score), sx, sy - 34, v.color, 12);
        else if (s.arrows) arrow(sx, sy, v.color, v.label, fmtDist(Math.hypot(v.snake.x - me.x, v.snake.y - me.y)) + ' · ' + fmtScore(v.snake.score), pulse, 0.8);
      }
    }

    if (g) {
      const myPt = g.at(me.x, me.y);
      if (layers.has('friends') && s.mapLines) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.75;
        for (const f of friends) {
          const p = g.at(f.x, f.y);
          ctx.strokeStyle = f.color;
          ctx.beginPath(); ctx.moveTo(myPt[0], myPt[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        }
        ctx.restore();
      }
      if (layers.has('tracked')) {
        for (const ls of c.trackedLastSeen()) {
          const p = g.at(ls.x, ls.y);
          ctx.save();
          ctx.globalAlpha = Math.max(0.25, 1 - ls.age / LAST_SEEN_MS);
          ctx.beginPath(); ctx.arc(p[0], p[1], s.dotSize, 0, Math.PI * 2);
          ctx.lineWidth = 2.5; ctx.strokeStyle = ls.color; ctx.stroke();
          if (s.mapNames) label(ls.label + ' · ' + Math.round(ls.age / 1000) + 's', p[0], p[1] - s.dotSize - 9, ls.color, 10);
          ctx.restore();
        }
        for (const v of tracked) {
          const p = g.at(v.snake.x, v.snake.y);
          const r = s.dotSize + 1;
          ctx.beginPath();
          ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath();
          ctx.fillStyle = v.color; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.stroke();
          if (s.mapNames) label(v.label, p[0], p[1] - r - 9, v.color, 10);
        }
      }
      if (layers.has('friends')) {
        for (const f of friends) {
          const p = g.at(f.x, f.y);
          dot(p[0], p[1], s.dotSize + pulse * 1.2, f.color);
          if (s.mapNames) label(f.label, p[0], p[1] - s.dotSize - 9, f.color, 11);
        }
      }
      ctx.beginPath();
      ctx.moveTo(myPt[0], myPt[1]);
      ctx.lineTo(myPt[0] + Math.cos(me.ang) * (s.dotSize + 7), myPt[1] + Math.sin(me.ang) * (s.dotSize + 7));
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = s.myColor;
      ctx.stroke();
      dot(myPt[0], myPt[1], s.dotSize, s.myColor);
    }

    if (layers.has('banner')) {
      const others = c.view.get().others;
      if (others.length) label(others.join(', ') + (others.length > 1 ? ' are' : ' is') + ' on another server. Click "Join" in the Coop list.', vw / 2, 22, '#ffd84d');
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    canvas: cv,
    layers,
    destroy() { cancelAnimationFrame(raf); cv.remove(); },
  };
}

/** The snake nearest to a friend's reported position (prefers a matching nickname). */
function nearestSnake(snakes: SnakeInfo[], x: number, y: number, name: string): SnakeInfo | null {
  let best: SnakeInfo | null = null, bd = 220 * 220;
  for (const s of snakes) {
    let d = (s.x - x) ** 2 + (s.y - y) ** 2;
    if (name && s.name === name) d *= 0.25;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
