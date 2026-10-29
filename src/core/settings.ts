import type { Config, FriendEntry, Profile, Settings, TrackedEntry } from './types';
import { clamp, fmtCode, isColor, newCode, normCode } from './util';

export const TRACK_COLORS = ['#ff4d4d', '#ffa94d', '#ffe14d', '#4dd2ff', '#c77dff', '#ff6bd6', '#ffffff'];

export const DEFAULT_SETTINGS: Settings = {
  arrows: true,
  autoFollow: true,
  hud: true,
  betterMap: true,
  mapSize: 240,
  mapCorner: 'br',
  mapBg: '#0b1220',
  mapBgAlpha: 0.78,
  densityColor: '#b8c7ff',
  densityAlpha: 0.95,
  myColor: '#ffffff',
  friendColor: '#3dff6e',
  dotSize: 6,
  mapNames: true,
  mapLines: true,
  mapGrid: true,
  outline: true,
  pauseSide: 'right',
  lbImproved: true,
  tracked: [],
  trackPartial: false,
  markMode: 'click',
};

export const MAP_KEYS = [
  'betterMap', 'mapSize', 'mapCorner', 'mapBg', 'mapBgAlpha', 'densityColor', 'densityAlpha',
  'myColor', 'friendColor', 'dotSize', 'mapNames', 'mapLines', 'mapGrid',
] as const;

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const bool = (k: keyof Settings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (d[k] as boolean));
  const color = (k: keyof Settings) => (isColor(r[k]) ? (r[k] as string) : (d[k] as string));
  const tracked: TrackedEntry[] = (Array.isArray(r.tracked) ? r.tracked : [])
    .filter((t): t is { name: string; color?: unknown } => !!t && typeof t.name === 'string' && !!t.name.trim())
    .slice(0, 40)
    .map((t, i) => ({ name: t.name.trim().slice(0, 24), color: isColor(t.color) ? t.color : TRACK_COLORS[i % TRACK_COLORS.length] }));
  return {
    arrows: bool('arrows'),
    autoFollow: bool('autoFollow'),
    hud: bool('hud'),
    betterMap: bool('betterMap'),
    mapSize: clamp(r.mapSize, 120, 460, d.mapSize),
    mapCorner: pick(r.mapCorner, ['tl', 'tr', 'bl', 'br'] as const, d.mapCorner),
    mapBg: color('mapBg'),
    mapBgAlpha: clamp(r.mapBgAlpha, 0, 1, d.mapBgAlpha),
    densityColor: color('densityColor'),
    densityAlpha: clamp(r.densityAlpha, 0.1, 1, d.densityAlpha),
    myColor: color('myColor'),
    friendColor: color('friendColor'),
    dotSize: clamp(r.dotSize, 3, 12, d.dotSize),
    mapNames: bool('mapNames'),
    mapLines: bool('mapLines'),
    mapGrid: bool('mapGrid'),
    outline: bool('outline'),
    pauseSide: pick(r.pauseSide, ['left', 'right'] as const, d.pauseSide),
    lbImproved: bool('lbImproved'),
    tracked,
    trackPartial: bool('trackPartial'),
    markMode: pick(r.markMode, ['click', 'shift', 'right', 'off'] as const, d.markMode),
  };
}

/** Turns whatever was stored (possibly old versions, possibly garbage) into a valid config. */
export function sanitizeConfig(raw: unknown): { config: Config; generatedCode: boolean } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  let generatedCode = false;
  let profile: Profile;
  if (r.profile && normCode(r.profile.code).length === 8) {
    profile = { code: fmtCode(r.profile.code), name: String(r.profile.name ?? '').slice(0, 24) };
  } else {
    profile = { code: newCode(), name: String(r.profile?.name ?? '').slice(0, 24) };
    generatedCode = true;
  }
  const seen = new Set<string>();
  const friends: FriendEntry[] = (Array.isArray(r.friends) ? r.friends : [])
    .filter((f: any) => {
      const c = normCode(f?.code);
      if (c.length !== 8 || c === normCode(profile.code) || seen.has(c)) return false;
      seen.add(c);
      return true;
    })
    .slice(0, 50)
    .map((f: any) => ({ code: fmtCode(f.code), label: String(f.label ?? '').slice(0, 24), color: isColor(f.color) ? f.color : '' }));
  return { config: { profile, friends, settings: sanitizeSettings(r.settings) }, generatedCode };
}
