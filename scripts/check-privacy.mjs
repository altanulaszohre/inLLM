import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
const excluded = new Set(['node_modules', 'build', 'release', 'dist', '.git', '.pnpm-store']);
const forbidden = [/\/Users\/[A-Za-z0-9_.-]+\//, /\/home\/[A-Za-z0-9_.-]+\//, /[A-Z]:\\Users\\[^\\]+\\/, /(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}/, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/];
const privateName = name => name === '.DS_Store' || name === '.env' || /^\.env\./.test(name) && name !== '.env.example' || /\.(?:pem|key|p12|pfx|gguf|safetensors|onnx|pt|pth|bin|db|sqlite|wav|mp3|webm|log|zip)$/i.test(name);
const findings = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (privateName(entry.name)) { findings.push(file); continue; }
    if (entry.isSymbolicLink()) { findings.push(file + ' (symlink)'); continue; }
    if (entry.isDirectory()) await walk(file);
    else if (/\.(ts|tsx|js|cjs|mjs|md|json|css|html|svg|swift|example)$/.test(file) || path.basename(file) === '.gitignore') {
      if ((await lstat(file)).size > 10 * 1024 * 1024) { findings.push(file + ' (oversized)'); continue; }
      const content = await readFile(file, 'utf8');
      if (forbidden.some(pattern => pattern.test(content))) findings.push(file);
    }
  }
}
await walk('.');
if (findings.length) { console.error('Review sensitive-looking content:', findings.join(', ')); process.exitCode = 1; }
else console.log('No obvious personal paths, token patterns, or private keys in source files.');
