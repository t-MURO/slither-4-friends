// Dev server: playground with mocked game/network/storage + live reload.
//   npm run dev  ->  http://localhost:8020
// Also serves inject.js, which loads the current source into the real game
// (see README "Testing in the real game").
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { base, root } from './common.mjs';

const out = resolve(root, 'dist/dev');
const port = Number(process.env.PORT || 8020);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const copyHtml = () => {
  for (const f of readdirSync(resolve(root, 'src/dev'))) {
    if (f.endsWith('.html')) cpSync(resolve(root, 'src/dev', f), resolve(out, f));
  }
};
copyHtml();

const ctx = await esbuild.context({
  ...base,
  entryPoints: {
    panel: resolve(root, 'src/dev/panel.tsx'),
    frame: resolve(root, 'src/dev/frame.tsx'),
    inject: resolve(root, 'src/entries/inject.tsx'),
    check: resolve(root, 'src/dev/real-check.ts'),
  },
  outdir: out,
  format: 'iife',
  sourcemap: 'inline',
  define: { ...base.define, __DEV_ORIGIN__: JSON.stringify(`http://localhost:${port}`) },
  plugins: [{ name: 'html', setup: (b) => b.onEnd(copyHtml) }],
});
await ctx.watch();
await ctx.serve({
  servedir: out,
  port,
  host: 'localhost',
  // the real-game loader runs on slither.com / slither.io and fetches from here
  cors: { origin: ['http://slither.com', 'http://slither.io', 'http://www.slither.com', 'https://slither.com', 'https://slither.io'] },
});

console.log(`
  Playground:   http://localhost:${port}/
  Real game:    open http://slither.com, then paste this into the browser console (or save as a bookmark):

  javascript:(()=>{const s=document.createElement('script');s.src='http://localhost:${port}/inject.js?'+Date.now();document.head.appendChild(s)})()

  Adapter check (after a Slither update): same, with check.js instead of inject.js; results in the console.
`);
