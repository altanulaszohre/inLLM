import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { timingSafeEqual, createHash } from 'node:crypto';
export class AppError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export function check(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new AppError(message, status); }
export function validToken(value: string | undefined, token: string) { const actual = Buffer.from(value || ''); const expected = Buffer.from('Bearer ' + token); return actual.length === expected.length && timingSafeEqual(actual, expected); }
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export function localEndpoint(input: string) { const url = new URL(input); check(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'Use an HTTP loopback address such as http://127.0.0.1:11434.'); return url.origin; }
export const denied = (name: string) => name.startsWith('.') || /^(node_modules|build|dist|vendor|target|Library)$/i.test(name) || /\.(pem|key|p12|pfx)$/i.test(name);
export const textFile = (name: string) => /\.(txt|md|py|js|jsx|ts|tsx|json|css|html|xml|yaml|yml|toml|rs|go|java|c|cpp|h|sh|sql|csv|svg)$/i.test(name) || /^(Makefile|Dockerfile|LICENSE)$/.test(name);
export async function within(root: string, relative: string) {
  check(relative.length > 0 && !path.isAbsolute(relative) && !relative.split(/[\\/]/).some(p => p === '..' || denied(p)), 'This file is outside the permitted project scope.', 403);
  const base = await realpath(root); const target = await realpath(path.resolve(base, relative));
  check(target.startsWith(base + path.sep), 'Symbolic links outside the project are not permitted.', 403);
  check(textFile(target), 'Only supported text source files may be opened.', 403);
  const info = await stat(target); check(info.isFile() && info.size <= 2 * 1024 * 1024, 'Open a text file smaller than 2 MB.');
  return target;
}
