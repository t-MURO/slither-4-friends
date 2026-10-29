// Builds the browser extension into dist/extension (Chrome + Firefox, MV3).
//   node scripts/build.mjs           one build
//   node scripts/build.mjs --watch   rebuild on every change (reload the extension afterwards)
//   node scripts/build.mjs --zip     build + dist/slither-coop-<version>.zip
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { base, pkg, root } from './common.mjs';

const out = resolve(root, 'dist/extension');
const watch = process.argv.includes('--watch');
const zip = process.argv.includes('--zip');

function copyStatic() {
  mkdirSync(out, { recursive: true });
  cpSync(resolve(root, 'static/icons'), join(out, 'icons'), { recursive: true });
  const manifest = JSON.parse(readFileSync(resolve(root, 'static/manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

const options = {
  ...base,
  entryPoints: {
    coop: resolve(root, 'src/entries/extension.tsx'),
    bridge: resolve(root, 'src/entries/bridge.ts'),
  },
  outdir: out,
  format: 'iife',
  // readable output: store reviewers (Firefox AMO) prefer unminified code
  minify: false,
  sourcemap: false,
};

rmSync(out, { recursive: true, force: true });
copyStatic();

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`\nWatching. Load ${relative(process.cwd(), out)} as an unpacked extension and reload it after changes.`);
} else {
  await esbuild.build(options);
  if (zip) writeZip(out, resolve(root, `dist/slither-coop-${pkg.version}.zip`));
}

// Minimal zip writer (deflate), so packaging needs no extra dependency.
function writeZip(dir, file) {
  const files = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const p of files) {
    const name = Buffer.from(relative(dir, p).split('\\').join('/'));
    const data = readFileSync(p);
    const comp = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8);
    c.writeUInt16LE(8, 10); c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  writeFileSync(file, Buffer.concat([...chunks, cd, end]));
  console.log(`Packed ${files.length} files into ${relative(process.cwd(), file)}`);
}
