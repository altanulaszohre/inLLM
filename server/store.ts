import initSqlJs, { type Database } from 'sql.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
export const defaultDataDir = () => process.env.INLLM_DATA_DIR || path.join(process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : process.platform === 'win32' ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local') : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'inLLM');
export class Store {
  private constructor(readonly db: Database, readonly dir: string) {}
  static async open(dir = defaultDataDir()) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const require = createRequire(import.meta.url);
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
    const file = path.join(dir, 'workspace.sqlite');
    const db = new SQL.Database(existsSync(file) ? readFileSync(file) : undefined);
    db.run('CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id))');
    return new Store(db, dir);
  }
  all<T = any>(kind: string): T[] { const stmt = this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY rowid DESC'); stmt.bind([kind]); const rows: T[] = []; while (stmt.step()) rows.push(JSON.parse(stmt.getAsObject().value as string)); stmt.free(); return rows; }
  get<T = any>(kind: string, id: string): T | undefined { const stmt = this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?'); stmt.bind([kind, id]); const item = stmt.step() ? JSON.parse(stmt.getAsObject().value as string) : undefined; stmt.free(); return item; }
  put(kind: string, id: string, value: unknown) { this.db.run('INSERT OR REPLACE INTO records VALUES (?,?,?)', [kind, id, JSON.stringify(value)]); this.flush(); return value; }
  delete(kind: string, id: string) { this.db.run('DELETE FROM records WHERE kind=? AND id=?', [kind, id]); this.flush(); }
  flush() { const target = path.join(this.dir, 'workspace.sqlite'); writeFileSync(target + '.tmp', this.db.export(), { mode: 0o600 }); renameSync(target + '.tmp', target); }
  close() { this.flush(); this.db.close(); }
}
