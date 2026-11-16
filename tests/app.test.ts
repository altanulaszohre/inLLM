import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { validateGGUF, safeDownloadUrl } from '../server/models';
import { extractDocument } from '../server/documents';

let dir: string;
let app: Awaited<ReturnType<typeof createApp>>;
let server: Server;
let base: string;
const request = async (route: string, method = 'GET', body?: unknown, token = true) => {
  const response = await fetch(base + '/api' + route, { method, headers: { ...(token ? { Authorization: `Bearer ${app.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
};
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'inllm-test-'));
  app = await createApp({ dataDir: dir });
  server = await new Promise((resolve, reject) => { const listener = app.app.listen(0, '127.0.0.1', () => resolve(listener)); listener.on('error', reject); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { app.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); });
describe('local workspace', () => {
  it('requires the launch token', async () => { expect((await request('/state', 'GET', undefined, false)).status).toBe(401); });
  it('starts without a model or fabricated response', async () => { const state = await request('/state'); expect(state.status).toBe(200); expect(state.data.models).toEqual([]); expect(state.data.activeModel).toBeNull(); const chat = await request('/chats', 'POST', { workspace: state.data.workspaces[0].id }); const response = await request(`/chats/${chat.data.id}/messages`, 'POST', { content: 'Hello', model: 'none' }); expect(response.status).toBe(409); });
  it('creates a synthetic project and reviews changes before writing', async () => { const sample = await request('/examples', 'POST'); expect(sample.status).toBe(200); const files = await request(`/workspaces/${sample.data.id}/files`); expect(files.data).toContain('calculator.js'); const read = await request(`/workspaces/${sample.data.id}/file?file=calculator.js`); const changed = read.data.content.replace('a + b', 'a - b'); const proposal = await request(`/workspaces/${sample.data.id}/proposals`, 'POST', { file: 'calculator.js', content: changed, hash: read.data.hash }); expect(proposal.data.diff).toContain('a - b'); expect((await request(`/proposals/${proposal.data.id}/apply`, 'POST', { approved: false })).status).toBe(403); expect((await request(`/workspaces/${sample.data.id}/file?file=calculator.js`)).data.content).toBe(read.data.content); expect((await request(`/proposals/${proposal.data.id}/apply`, 'POST', { approved: true })).status).toBe(200); expect((await request(`/workspaces/${sample.data.id}/file?file=calculator.js`)).data.content).toBe(changed); });
  it('extracts small synthetic text and rejects unsafe model sources', async () => { const parsed = await extractDocument(Buffer.from('A small local document for testing.'), 'sample.txt'); expect(parsed.chunks[0].page).toBe(1); expect(parsed.text).toContain('local document'); expect(() => safeDownloadUrl('http://example.com/model.gguf')).toThrow(); });
  it('validates a synthetic GGUF header without downloading weights', async () => { const file = path.join(dir, 'synthetic.gguf'); const header = Buffer.alloc(24); header.write('GGUF'); header.writeUInt32LE(3, 4); header.writeBigUInt64LE(1n, 8); await writeFile(file, header); await expect(validateGGUF(file)).resolves.toBeUndefined(); header.writeUInt32LE(99, 4); await writeFile(file, header); await expect(validateGGUF(file)).rejects.toThrow(); });
});
