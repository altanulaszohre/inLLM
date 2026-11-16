import { check, localEndpoint } from './security';
export type ProviderKind = 'ollama' | 'llama' | 'mlx';
export type Model = { id: string; name: string; provider: ProviderKind; remoteId: string; size: number; vision: boolean; status: 'ready' | 'stored'; path?: string; managed?: boolean; format?: string; note?: string };
export type ProviderConfig = { kind: ProviderKind; endpoint: string };
export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string; images?: string[] };
export const defaults: ProviderConfig[] = [{ kind: 'ollama', endpoint: 'http://127.0.0.1:11434' }, { kind: 'llama', endpoint: 'http://127.0.0.1:8080' }, { kind: 'mlx', endpoint: 'http://127.0.0.1:8081' }];
export async function* lines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader(); const decoder = new TextDecoder(); let pending = '';
  try { while (true) { const { done, value } = await reader.read(); if (done) break; pending += decoder.decode(value, { stream: true }); check(pending.length < 4 * 1024 * 1024, 'Provider sent an oversized event.'); let end; while ((end = pending.indexOf('\n')) >= 0) { const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1); if (line) yield line; } } pending += decoder.decode(); if (pending.trim()) yield pending.trim(); } finally { reader.releaseLock(); }
}
export class LocalProvider {
  readonly endpoint: string;
  constructor(readonly config: ProviderConfig, readonly fetcher: typeof fetch = fetch) { this.endpoint = localEndpoint(config.endpoint); }
  async request(route: string, init: RequestInit = {}) { const response = await this.fetcher(this.endpoint + route, { ...init, redirect: 'error', signal: init.signal || AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', ...init.headers } }); check(response.ok, `The ${this.config.kind} runtime returned HTTP ${response.status}.`, 502); return response; }
  async models(): Promise<Model[]> {
    const ollama = this.config.kind === 'ollama'; const data = await (await this.request(ollama ? '/api/tags' : '/v1/models')).json();
    const result: Model[] = [];
    for (const item of (ollama ? data.models || [] : data.data || []).slice(0, 200)) {
      let vision = false;
      if (ollama) { try { const info = await (await this.request('/api/show', { method: 'POST', body: JSON.stringify({ model: item.name }) })).json(); vision = info.capabilities?.includes('vision') === true; } catch { /* unknown capabilities stay disabled */ } }
      else { vision = item.capabilities?.vision === true || item.capabilities?.includes?.('vision') === true; }
      const name = item.name || item.id;
      result.push({ id: `${this.config.kind}:${name}`, name, remoteId: name, provider: this.config.kind, size: item.size || 0, vision, status: 'ready', format: ollama ? 'Ollama' : this.config.kind === 'mlx' ? 'MLX' : 'GGUF' });
    }
    return result;
  }
  async *chat(model: Model, messages: ChatMessage[], signal: AbortSignal) {
    const ollama = this.config.kind === 'ollama';
    const converted = ollama ? messages : messages.map(m => ({ role: m.role, content: m.images?.length ? [{ type: 'text', text: m.content }, ...m.images.map(image => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }))] : m.content }));
    const response = await this.request(ollama ? '/api/chat' : '/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: model.remoteId, messages: converted, stream: true }), signal });
    check(response.body, 'The runtime returned no response stream.', 502);
    for await (const line of lines(response.body)) {
      if (!ollama && !line.startsWith('data:')) continue;
      const payload = ollama ? line : line.slice(5).trim(); if (payload === '[DONE]') break;
      const data = JSON.parse(payload); check(!data.error, typeof data.error === 'string' ? data.error : 'The runtime could not complete this request.', 502);
      const token = ollama ? data.message?.content : data.choices?.[0]?.delta?.content;
      if (token) yield token;
    }
  }
  async remove(model: Model) { check(this.config.kind === 'ollama', 'Disconnect the server or remove the managed local file instead.'); await this.request('/api/delete', { method: 'DELETE', body: JSON.stringify({ model: model.remoteId }) }); }
}
