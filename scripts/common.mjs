// Shared esbuild settings for the extension build and the dev server.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

// TURN relays (RTCIceServer[] JSON): env TURN_SERVERS, else turn.json (not committed)
const turnFile = resolve(root, 'turn.json');
const turnJson = process.env.TURN_SERVERS ?? (existsSync(turnFile) ? readFileSync(turnFile, 'utf8') : '[]');
export const turnServers = JSON.parse(turnJson);
if (!Array.isArray(turnServers) || !turnServers.every((s) => s && s.urls && s.username && s.credential)) {
  throw new Error('turn.json must be an array of { urls, username, credential }');
}
if (!turnServers.length) console.warn('No TURN relay configured (turn.json): friends behind strict networks will not connect.');

export const base = {
  bundle: true,
  target: ['chrome111', 'firefox128'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'text' },
  logLevel: 'info',
  legalComments: 'none',
  define: { __VERSION__: JSON.stringify(pkg.version), __TURN_SERVERS__: JSON.stringify(turnServers) },
};
