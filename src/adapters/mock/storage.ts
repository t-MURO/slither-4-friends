import type { PrefsAdapter, StorageAdapter } from '../types';

export interface MemoryStorage extends StorageAdapter {
  data: unknown;
  /** simulate a change made in another tab / on another site */
  externalChange(raw: unknown): void;
}

export function createMemoryStorage(initial: unknown, onSave?: (cfg: unknown) => void): MemoryStorage {
  const listeners: ((raw: unknown) => void)[] = [];
  const s: MemoryStorage = {
    kind: 'memory',
    data: initial,
    async load() { return structuredClone(s.data); },
    save(cfg) { s.data = structuredClone(cfg); onSave?.(s.data); },
    onExternalChange(fn) { listeners.push(fn); },
    externalChange(raw) { s.data = structuredClone(raw); for (const fn of listeners) fn(structuredClone(raw)); },
  };
  return s;
}

export function memoryPrefs(): PrefsAdapter {
  const m = new Map<string, unknown>();
  return {
    get: <T,>(k: string, d: T) => (m.has(k) ? (m.get(k) as T) : d),
    set: (k, v) => { m.set(k, v); },
  };
}
