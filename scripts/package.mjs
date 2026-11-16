import { packager } from '@electron/packager';
import sharp from 'sharp';
import { mkdir, rm, cp, readdir, realpath, lstat, symlink, writeFile, readlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

if (process.platform !== 'darwin') throw new Error('macOS packaging requires macOS.');
const iconset = path.join(os.tmpdir(), `inllm-icon-${process.pid}.iconset`);
await mkdir(iconset, { recursive: true });
const svg = 'public/icon.svg';
for (const size of [16, 32, 128, 256, 512]) {
  await sharp(svg).resize(size, size).png().toFile(path.join(iconset, `icon_${size}x${size}.png`));
  await sharp(svg).resize(size * 2, size * 2).png().toFile(path.join(iconset, `icon_${size}x${size}@2x.png`));
}
const icon = path.join(os.tmpdir(), `inllm-${process.pid}.icns`);
const converted = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', icon]);
if (converted.status !== 0) throw new Error(String(converted.stderr));
const stage = path.resolve('release', '.staging');
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, 'node_modules', '.pnpm'), { recursive: true });
await cp('build', path.join(stage, 'build'), { recursive: true });
await cp('desktop', path.join(stage, 'desktop'), { recursive: true });
const runtimeDeps = ['diff', 'express', 'mammoth', 'multer', 'pdfjs-dist', 'sql.js', 'zod'];
await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: 'inllm', version: '1.0.0', type: 'module', main: 'desktop/main.cjs', dependencies: Object.fromEntries(runtimeDeps.map(name => [name, '*'])) }, null, 2));
const modules = path.resolve('node_modules');
const copied = new Set();
async function gather(link) {
  const target = await realpath(link);
  const relative = path.relative(path.join(modules, '.pnpm'), target);
  const entry = relative.split(path.sep)[0];
  if (relative.startsWith('..') || copied.has(entry)) return;
  copied.add(entry);
  const dependencies = path.join(modules, '.pnpm', entry, 'node_modules');
  for (const item of await readdir(dependencies, { withFileTypes: true })) {
    const candidate = path.join(dependencies, item.name);
    if (item.isSymbolicLink()) await gather(candidate);
    else if (item.isDirectory() && item.name.startsWith('@')) for (const scoped of await readdir(candidate)) {
      const nested = path.join(candidate, scoped);
      if ((await lstat(nested)).isSymbolicLink()) await gather(nested);
    }
  }
}
for (const name of runtimeDeps) await gather(path.join(modules, name));
for (const entry of copied) await cp(path.join(modules, '.pnpm', entry), path.join(stage, 'node_modules', '.pnpm', entry), { recursive: true, dereference: false, verbatimSymlinks: true });
for (const name of runtimeDeps) {
  const source = path.join(modules, name);
  await symlink(await readlink(source), path.join(stage, 'node_modules', name));
}
await packager({ dir: stage, name: 'inLLM', platform: 'darwin', arch: process.arch === 'arm64' ? 'arm64' : 'x64', electronVersion: '39.8.10', out: 'release', overwrite: true, icon, asar: false, prune: false, derefSymlinks: false, appBundleId: 'com.inllm.desktop', extendInfo: { NSSpeechRecognitionUsageDescription: 'inLLM transcribes audio you select using on-device speech recognition.' } });
const appRoot = path.resolve('release', `inLLM-darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'inLLM.app', 'Contents', 'Resources', 'app');
async function relink(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await relink(file);
    else if (item.isSymbolicLink()) {
      const target = await readlink(file);
      if (!target.startsWith(stage + path.sep)) throw new Error(`Unexpected package link: ${file}`);
      const relocated = path.join(appRoot, path.relative(stage, target));
      await rm(file);
      await symlink(path.relative(path.dirname(file), relocated), file);
    }
  }
}
await relink(path.join(appRoot, 'node_modules'));
await rm(stage, { recursive: true, force: true });
await rm(iconset, { recursive: true, force: true });
await rm(icon, { force: true });
