// Small pure helpers (no DOM, no game access) — covered by tests.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** "abcd-2345 " -> "ABCD2345" */
export const normCode = (c: unknown): string => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** codes are made from CODE_ALPHABET, which leaves out look-alikes */
export const impossibleCode = (normalized: string): boolean => /[01ILO]/.test(normalized);

/** "ABCD2345" -> "ABCD-2345" (anything else is returned normalized) */
export function fmtCode(c: unknown): string {
  const n = normCode(c);
  return n.length === 8 ? n.slice(0, 4) + '-' + n.slice(4) : n;
}

export function newCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let s = '';
  for (const b of random(8)) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return fmtCode(s);
}

export function randomToken(n: number): string {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (const b of crypto.getRandomValues(new Uint8Array(n))) s += a[b % a.length];
  return s;
}

export const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

export function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** names are compared case-insensitively, non-breaking spaces count as spaces */
export const nameKey = (n: unknown): string => String(n ?? '').replace(/ /g, ' ').trim().toLowerCase();

export const fmtDist = (d: number): string => (d < 1000 ? String(Math.round(d)) : (d / 1000).toFixed(1) + 'k');

export const fmtScore = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n).toLocaleString('en-US') : '–';

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
