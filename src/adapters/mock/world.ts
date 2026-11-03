// A small simulated Slither world for the dev playground: your snake (steer
// with the mouse or arrow keys), wandering bots, a leaderboard, a density
// minimap and server switching. It implements GameAdapter, so the Coop code
// runs against it exactly like against the real game.
import type { Camera, GameSnapshot, LeaderboardRow, Phase, ServerRef, SnakeInfo } from '../../core/types';
import type { ClickInfo, GameAdapter } from '../types';

export interface WorldOptions {
  bots: number;
  namedRatio: number;
  zoom: number;
  /** players on the leaderboard that are never near you */
  farPlayers: number;
}

interface Snake {
  id: number;
  name: string;
  color: string;
  x: number;
  y: number;
  ang: number;
  turn: number;
  speed: number;
  score: number;
  trail: number[];
  /** puppet snakes are positioned from outside (mock friends) */
  puppet?: string;
}

const NAMES = ['MALFOY', 'bertuxa', 'diahane', 'Jaden', 'porco cane', 'ALBANIA', 'gaietta', 'Chazite (bot)', 'noishi ntm', 'ZAINE', 'GotKenari', 'Alaidar', 'bruno', 'maxk', 'Sam'];
const COLORS = ['#9099ff', '#c080ff', '#80d0d0', '#80ff80', '#eeee70', '#ffa060', '#ff90a0', '#ff4040', '#e030e0'];
const SERVERS = [7806, 4263, 7490, 4442, 2207, 6110];

export class MockWorld {
  readonly grd = 21600;
  readonly flux = 21600 * 0.98;
  phase: Phase = 'menu';
  server: ServerRef | null = null;
  pending: ServerRef | null = null;
  nickname = 'You';
  opts: WorldOptions = { bots: 14, namedRatio: 0.6, zoom: 0.9, farPlayers: 40 };
  /** Coop's zoom factor on top of opts.zoom (GameAdapter.setZoom) */
  userZoom = 1;
  self: Snake = this.makeSnake(0, 'You', '#4dd8ff', this.grd, this.grd);
  bots: Snake[] = [];
  far: { name: string; score: number; color: string }[] = [];
  mouse = { x: 0, y: 0, boost: false };
  keys = { left: false, right: false, boost: false };
  mouseEnabled = true;
  steering: ((self: { ang: number }) => number) | null = null;
  clickFn: ((c: ClickInfo) => boolean) | null = null;
  nativeMap = true;
  nativeLb = true;
  readonly visibleRadius = 1700;
  private nextId = 1;
  private density = document.createElement('canvas');
  private densityAt = 0;
  private deadAt = 0;
  private connectAt = 0;

  constructor() {
    this.density.width = this.density.height = 96;
    this.respawnBots();
  }

  // ---------------------------------------------------------------- setup
  private makeSnake(id: number, name: string, color: string, x: number, y: number): Snake {
    return { id, name, color, x, y, ang: Math.random() * Math.PI * 2, turn: 0, speed: 185, score: 10 + Math.floor(Math.random() * 3000), trail: [] };
  }

  respawnBots() {
    const named = Math.round(this.opts.bots * this.opts.namedRatio);
    this.bots = this.bots.filter((b) => b.puppet);
    for (let i = 0; i < this.opts.bots; i++) {
      const a = Math.random() * Math.PI * 2, d = 250 + Math.random() * 1400;
      const s = this.makeSnake(this.nextId++, i < named ? NAMES[i % NAMES.length] : '', COLORS[i % COLORS.length], this.self.x + Math.cos(a) * d, this.self.y + Math.sin(a) * d);
      s.speed = 120 + Math.random() * 90;
      this.bots.push(s);
    }
    this.far = Array.from({ length: this.opts.farPlayers }, (_, i) => ({
      name: Math.random() < 0.6 ? `${NAMES[(i + 5) % NAMES.length]}${i}` : '',
      score: Math.floor(500 + Math.random() * 30000),
      color: COLORS[(i * 3) % COLORS.length],
    }));
  }

  /** Spawn a named snake near you (for tracking tests). */
  spawnNear(name: string) {
    const a = Math.random() * Math.PI * 2;
    const s = this.makeSnake(this.nextId++, name, COLORS[this.nextId % COLORS.length], this.self.x + Math.cos(a) * 400, this.self.y + Math.sin(a) * 400);
    this.bots.push(s);
  }

  /** Puppet snake for a mock friend: positioned from outside each tick. */
  puppet(key: string, name: string, color: string, x: number, y: number, score: number): void {
    let p = this.bots.find((b) => b.puppet === key);
    if (!p) {
      p = this.makeSnake(this.nextId++, name, color, x, y);
      p.puppet = key;
      this.bots.push(p);
    }
    p.color = color;
    const dx = x - p.x, dy = y - p.y;
    if (dx || dy) p.ang = Math.atan2(dy, dx);
    p.x = x; p.y = y; p.name = name; p.score = score;
    pushTrail(p);
  }
  removePuppets(keep: Set<string>) {
    this.bots = this.bots.filter((b) => !b.puppet || keep.has(b.puppet));
  }

  setPhase(p: Phase) {
    if (p === 'playing') {
      if (this.phase !== 'playing') this.enterGame(this.pending ?? this.server ?? null);
    } else if (p === 'dead') {
      if (this.phase === 'playing') { this.phase = 'dead'; this.deadAt = performance.now(); }
    } else if (p === 'connecting') {
      this.phase = 'connecting';
      this.connectAt = performance.now();
    } else {
      this.phase = 'menu';
    }
  }

  private enterGame(srv: ServerRef | null) {
    const sid = srv?.sid ?? SERVERS[Math.floor(Math.random() * SERVERS.length)];
    this.server = { sid, ip: srv?.ip ?? `57.129.37.${sid % 200}`, po: srv?.po ?? 444 };
    this.pending = null;
    this.self = { ...this.makeSnake(0, this.nickname, '#4dd8ff', this.grd + (Math.random() - 0.5) * 20000, this.grd + (Math.random() - 0.5) * 20000), score: 10 };
    this.respawnBots();
    this.phase = 'playing';
  }

  // ---------------------------------------------------------------- simulation
  step(dt: number) {
    const t = performance.now();
    if (this.phase === 'connecting' && t - this.connectAt > 600) this.enterGame(this.pending);
    if (this.phase === 'dead' && t - this.deadAt > 1500) this.phase = 'menu';
    if (this.phase !== 'playing' && this.phase !== 'dead') return;

    if (this.phase === 'playing') {
      const me = this.self;
      let target: number | null = null;
      if (this.steering) target = this.steering({ ang: me.ang });
      else if (this.mouseEnabled && (this.mouse.x || this.mouse.y)) target = Math.atan2(this.mouse.y, this.mouse.x);
      const maxTurn = 4.2 * dt;
      if (this.keys.left && !this.steering) me.ang -= maxTurn;
      else if (this.keys.right && !this.steering) me.ang += maxTurn;
      else if (target != null) {
        let d = target - me.ang;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        me.ang += Math.max(-maxTurn, Math.min(maxTurn, d));
      }
      const boost = !this.steering && ((this.mouse.boost && this.mouseEnabled) || this.keys.boost);
      const v = me.speed * (boost ? 2.2 : 1);
      me.x += Math.cos(me.ang) * v * dt;
      me.y += Math.sin(me.ang) * v * dt;
      this.keepInside(me);
      pushTrail(me);
    }

    for (const b of this.bots) {
      if (b.puppet) continue;
      b.turn += (Math.random() - 0.5) * 2 * dt;
      b.turn = Math.max(-1.6, Math.min(1.6, b.turn));
      b.ang += b.turn * dt;
      b.x += Math.cos(b.ang) * b.speed * dt;
      b.y += Math.sin(b.ang) * b.speed * dt;
      // keep bots in a band around the player so there is always something to see
      const dx = b.x - this.self.x, dy = b.y - this.self.y;
      if (Math.hypot(dx, dy) > 2600) { b.x = this.self.x - dx * 0.5; b.y = this.self.y - dy * 0.5; b.trail = []; }
      this.keepInside(b);
      pushTrail(b);
    }
  }

  private keepInside(s: Snake) {
    const dx = s.x - this.grd, dy = s.y - this.grd, r = Math.hypot(dx, dy), max = this.grd * 0.97;
    if (r > max) { s.x = this.grd + (dx / r) * max; s.y = this.grd + (dy / r) * max; s.ang += Math.PI; }
  }

  // ---------------------------------------------------------------- view
  viewport() { return { w: innerWidth, h: innerHeight }; }

  camera(): Camera {
    const { w, h } = this.viewport();
    const z = this.opts.zoom * this.userZoom, c = this.self;
    return {
      toScreen: (x, y) => [(x - c.x) * z + w / 2, (y - c.y) * z + h / 2],
      toWorld: (sx, sy) => [(sx - w / 2) / z + c.x, (sy - h / 2) / z + c.y],
    };
  }

  private visibleBots(): Snake[] {
    return this.bots.filter((b) => Math.hypot(b.x - this.self.x, b.y - this.self.y) < this.visibleRadius);
  }

  private updateDensity() {
    const t = performance.now();
    if (t - this.densityAt < 500) return;
    this.densityAt = t;
    const c = this.density.getContext('2d')!;
    const n = this.density.width;
    c.clearRect(0, 0, n, n);
    c.fillStyle = '#fff';
    const put = (x: number, y: number, r: number) => {
      const px = ((x - this.grd) / this.flux) * (n / 2) + n / 2, py = ((y - this.grd) / this.flux) * (n / 2) + n / 2;
      c.fillRect(Math.round(px - r), Math.round(py - r), r * 2, r * 2);
    };
    for (const b of this.bots) put(b.x, b.y, 1);
    // pseudo-random static crowds
    for (let i = 0; i < 260; i++) {
      const a = (i * 2.399) % (Math.PI * 2), d = ((i * 7919) % 1000) / 1000;
      put(this.grd + Math.cos(a) * d * this.flux, this.grd + Math.sin(a) * d * this.flux, (i % 5 === 0 ? 2 : 1));
    }
  }

  leaderboard(): { rows: LeaderboardRow[]; rank: number; count: number } {
    const all = [
      ...this.bots.map((b) => ({ name: b.name, score: b.score, color: b.color, me: false })),
      ...this.far.map((f) => ({ ...f, me: false })),
      { name: this.nickname, score: this.self.score, color: this.self.color, me: true },
    ].sort((a, b) => b.score - a.score);
    const rank = all.findIndex((x) => x.me) + 1;
    return { rows: all.slice(0, 10).map((x, i) => ({ ...x, pos: i + 1 })), rank, count: all.length };
  }

  snapshot(): GameSnapshot {
    const playing = this.phase === 'playing' || this.phase === 'dead';
    this.updateDensity();
    const lb = playing ? this.leaderboard() : { rows: [], rank: 0, count: 0 };
    return {
      phase: this.phase,
      self: playing ? { x: this.self.x, y: this.self.y, ang: this.self.ang, score: this.self.score } : null,
      server: playing ? this.server : null,
      snakes: playing ? this.visibleBots().map(toInfo) : [],
      leaderboard: lb.rows,
      rank: lb.rank,
      playerCount: lb.count,
      camera: playing ? this.camera() : null,
      minimap: playing ? { grd: this.grd, flux: this.flux, density: this.density, nativeRect: { cx: innerWidth - 80, cy: innerHeight - 80, rad: 62 } } : null,
      nickname: this.nickname,
    };
  }

  // ---------------------------------------------------------------- fake game rendering
  render(ctx: CanvasRenderingContext2D) {
    const { w, h } = this.viewport();
    ctx.fillStyle = '#161c22';
    ctx.fillRect(0, 0, w, h);
    if (this.phase !== 'playing' && this.phase !== 'dead') {
      ctx.fillStyle = '#7fe3a0';
      ctx.font = 'bold 54px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('slither (mock)', w / 2, h / 2 - 40);
      ctx.font = '16px Arial';
      ctx.fillStyle = '#9fb0c3';
      ctx.fillText(this.phase === 'connecting' ? 'connecting…' : 'Menu: press Enter or use "Play" in the dev panel', w / 2, h / 2 + 10);
      return;
    }
    const cam = this.camera(), z = this.opts.zoom * this.userZoom;
    // hex-ish background grid
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = 1;
    const step = 90 * z;
    const [ox, oy] = cam.toScreen(0, 0);
    for (let x = ox % step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = oy % step; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // world border
    const [bx, by] = cam.toScreen(this.grd, this.grd);
    ctx.strokeStyle = 'rgba(255,60,60,.5)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(bx, by, this.grd * 0.97 * z, 0, Math.PI * 2); ctx.stroke();

    const draw = (s: Snake) => {
      const pts = [s.x, s.y, ...s.trail];
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = s.color;
      ctx.lineWidth = widthOf(s) * z;
      ctx.beginPath();
      let [x, y] = cam.toScreen(pts[0], pts[1]);
      ctx.moveTo(x, y);
      for (let i = 2; i + 1 < pts.length; i += 2) { [x, y] = cam.toScreen(pts[i], pts[i + 1]); ctx.lineTo(x, y); }
      ctx.stroke();
      [x, y] = cam.toScreen(s.x, s.y);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + Math.cos(s.ang + 0.6) * 6 * z, y + Math.sin(s.ang + 0.6) * 6 * z, 4 * z, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + Math.cos(s.ang - 0.6) * 6 * z, y + Math.sin(s.ang - 0.6) * 6 * z, 4 * z, 0, 7); ctx.fill();
      if (s.name) {
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.font = '13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(s.name, x, y + 34 * z);
      }
    };
    for (const b of this.bots) draw(b);
    if (this.phase === 'playing') draw(this.self);
    if (this.nativeLb) {
      // the game's own (plain) leaderboard, hidden when the improved one is on
      const lb = this.leaderboard();
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillText('Leaderboard', w - 140, 26);
      ctx.font = '13px Arial';
      lb.rows.forEach((r, i) => {
        ctx.globalAlpha = 0.65 - i * 0.04;
        ctx.fillStyle = r.color;
        ctx.textAlign = 'left'; ctx.fillText('#' + r.pos, w - 270, 50 + i * 17);
        ctx.fillText(r.name, w - 230, 50 + i * 17);
        ctx.textAlign = 'right'; ctx.fillText(String(Math.round(r.score)), w - 12, 50 + i * 17);
      });
      ctx.globalAlpha = 1;
    }
    if (!this.nativeMap) return;
    // the game's own (small) minimap, hidden when the Coop map is on
    ctx.fillStyle = 'rgba(32,38,48,.8)';
    ctx.beginPath(); ctx.arc(w - 80, h - 80, 62, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.density, w - 142, h - 142, 124, 124);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- input from the frame page
  handleMouseDown(e: MouseEvent) {
    if (this.steering) return;
    if (this.clickFn?.({ x: e.clientX, y: e.clientY, button: e.button, shiftKey: e.shiftKey })) return;
    if (this.mouseEnabled) this.mouse.boost = true;
  }
}

function widthOf(s: Snake) { return 29 * (1 + Math.min(2, s.score / 8000)); }

function pushTrail(s: Snake) {
  const t = s.trail;
  const lx = t.length ? t[0] : NaN, ly = t.length ? t[1] : NaN;
  if (!(Math.hypot(s.x - lx, s.y - ly) < 14)) {
    t.unshift(s.x, s.y);
    const maxPts = 30 + Math.min(150, Math.floor(s.score / 60));
    if (t.length > maxPts * 2) t.length = maxPts * 2;
  }
}

function toInfo(s: Snake): SnakeInfo {
  return { id: s.id, name: s.name, x: s.x, y: s.y, score: Math.round(s.score), color: s.color, width: widthOf(s), points: () => [s.x, s.y, ...s.trail] };
}

/** GameAdapter backed by a MockWorld. */
export function createMockGame(world: MockWorld): GameAdapter {
  return {
    snapshot: () => world.snapshot(),
    joinServer(srv) {
      if (String(srv.ip).startsWith('[') && !srv.sid) return false;
      world.pending = { sid: srv.sid, ip: String(srv.ip).startsWith('[') ? `57.129.37.${srv.sid % 200}` : srv.ip, po: srv.po };
      return true;
    },
    pendingServer: () => world.pending,
    startGame() { if (world.phase === 'menu') world.setPhase('connecting'); },
    setSteeringOverride(fn) { world.steering = fn; if (fn) world.mouse.boost = false; },
    setMouseEnabled(on) { world.mouseEnabled = on; if (!on) world.mouse.boost = false; },
    onGameClick(fn) { world.clickFn = fn; },
    setZoom(f) { world.userZoom = f; },
    setNativeMinimapVisible(v) { world.nativeMap = v; },
    setNativeLeaderboardVisible(v) { world.nativeLb = v; },
    destroy() { world.userZoom = 1; world.steering = null; world.mouseEnabled = true; world.clickFn = null; world.nativeMap = world.nativeLb = true; },
  };
}
