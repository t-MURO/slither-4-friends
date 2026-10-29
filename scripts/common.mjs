// Shared esbuild settings for the extension build and the dev server.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

export const base = {
  bundle: true,
  target: ['chrome111', 'firefox128'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'text' },
  logLevel: 'info',
  legalComments: 'none',
  define: { __VERSION__: JSON.stringify(pkg.version) },
};
