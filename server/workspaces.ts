import { readdir, readFile, writeFile, rename, realpath, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { createTwoFilesPatch } from 'diff';
import { Store } from './store';
import { check, denied, hash, textFile, within } from './security';
export class WorkspaceService {
  proposals = new Map<string, { workspace: string; file: string; before: string; after: string; hash: string }>();
  running = new Map<string, ReturnType<typeof spawn>>();
  constructor(readonly store: Store) {}
  async create(name: string, root?: string) { if (root) { root = await realpath(root); check((await stat(root)).isDirectory() && root !== path.parse(root).root && root !== os.homedir(), 'Choose a specific project directory, not the home or filesystem root.'); } const item = { id: randomUUID(), name, root: root || null }; this.store.put('workspaces', item.id, item); return item; }
  root(id: string) { const item = this.store.get('workspaces', id); check(item?.root, 'Open a project folder first.'); return item.root as string; }
  async files(id: string) { const root = this.root(id); const files: string[] = []; const walk = async (relative = '', depth = 0) => { if (depth > 8 || files.length >= 1500) return; for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) { if (denied(entry.name) || entry.isSymbolicLink()) continue; const name = path.join(relative, entry.name); if (entry.isDirectory()) await walk(name, depth + 1); else if (textFile(name)) files.push(name); if (files.length >= 1500) break; } }; await walk(); return files.sort(); }
  async read(id: string, file: string) { const target = await within(this.root(id), file); const content = await readFile(target, 'utf8'); return { content, hash: hash(content) }; }
  async propose(id: string, file: string, after: string, expected: string) { const before = await this.read(id, file); check(before.hash === expected, 'The file changed on disk. Reopen it before editing.', 409); check(Buffer.byteLength(after) <= 2 * 1024 * 1024, 'The edited file is too large.'); check(this.proposals.size < 100, 'Too many pending edits. Restart the app to discard stale proposals.'); const proposal = { workspace: id, file, before: before.content, after, hash: expected }; const proposalId = randomUUID(); this.proposals.set(proposalId, proposal); return { id: proposalId, diff: createTwoFilesPatch(file, file, before.content, after), additions: after.split('\n').length, deletions: before.content.split('\n').length }; }
  async apply(id: string, approved: boolean) { check(approved, 'Explicit approval is required.', 403); const proposal = this.proposals.get(id); check(proposal, 'This proposal expired. Review the diff again.', 404); const current = await this.read(proposal.workspace, proposal.file); check(current.hash === proposal.hash, 'The file changed after review. Changes were not applied.', 409); const target = await within(this.root(proposal.workspace), proposal.file); const mode = (await stat(target)).mode; const temporary = target + '.inllm-' + randomUUID(); await writeFile(temporary, proposal.after, { mode, flag: 'wx' }); await rename(temporary, target); this.proposals.delete(id); return { hash: hash(proposal.after) }; }
  async run(id: string, command: string, approved: boolean) {
    check(approved, 'Running project code requires explicit approval.', 403); check(!this.running.has(id), 'A command is already running in this workspace.');
    const allowed: Record<string, [string, string[]]> = { 'node-test': [process.execPath, ['--test']], 'npm-test': [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test', '--', '--run']], 'pytest': ['python3', ['-m', 'pytest', '-q']] };
    check(allowed[command], 'This command is not allowed.'); const [bin, args] = allowed[command];
    return await new Promise<{ output: string; exitCode: number | null; stopped: boolean }>((resolve, reject) => {
      const child = spawn(bin, args, { cwd: this.root(id), shell: false, detached: process.platform !== 'win32', env: { PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir(), CI: '1', ELECTRON_RUN_AS_NODE: '1', PYTHONDONTWRITEBYTECODE: '1' } }); this.running.set(id, child);
      let output = ''; let stopped = false; const stop = () => { stopped = true; try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* already ended */ } };
      const timer = setTimeout(stop, 30000); const append = (data: Buffer) => { if (output.length < 100000) output += data.toString().slice(0, 100000 - output.length); else stop(); };
      child.stdout?.on('data', append); child.stderr?.on('data', append); child.once('error', error => { clearTimeout(timer); this.running.delete(id); reject(error); }); child.once('close', code => { clearTimeout(timer); this.running.delete(id); resolve({ output, exitCode: code, stopped }); });
    });
  }
  stop(id: string) { const child = this.running.get(id); if (child?.pid) { try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {} } }
}
