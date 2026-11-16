import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('build/server', { recursive: true });
await build({ entryPoints: ['server/app.ts'], outfile: 'build/server/app.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: false });
await build({ entryPoints: ['server/cli.ts'], outfile: 'build/server/cli.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: false });
