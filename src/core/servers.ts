import type { ServerRef } from './types';

/** Same server? Compare by server id; fall back to address only when an id is missing. */
export function sameServer(a: ServerRef | null | undefined, b: ServerRef | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.sid && b.sid) return a.sid === b.sid;
  return a.ip === b.ip && a.po === b.po;
}

export interface ServerListEntry {
  ip: string;
  po: number | string;
  sid?: number | string;
  [k: string]: unknown;
}

/**
 * Pick the address to connect to for a friend's server, from *our* server list.
 * Prefers the IPv4 entry with the same id (reachable for everyone); returns
 * null when only an IPv6 address is known (forcing it could fail and make
 * the game fall back to a random server).
 */
export function pickServerEntry<T extends ServerListEntry>(srv: ServerRef, list: readonly T[]): T | ServerListEntry | null {
  if (srv.sid) {
    const same = list.filter((o) => Number(o.sid) === srv.sid);
    const v4 = same.find((o) => !String(o.ip).startsWith('['));
    if (v4) return v4;
    if (same[0]) return same[0];
  }
  const byAddr = list.find((o) => o.ip === srv.ip && Number(o.po) === srv.po);
  if (byAddr) return byAddr;
  if (String(srv.ip).startsWith('[')) return null;
  return { ip: srv.ip, po: srv.po, ac: 999, sid: srv.sid };
}
