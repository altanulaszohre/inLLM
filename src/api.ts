const params = new URLSearchParams(location.hash.slice(1));
if (params.has('token')) { sessionStorage.setItem('inllm-session', params.get('token')!); history.replaceState(null, '', location.pathname); }
export const auth = () => ({ Authorization: `Bearer ${sessionStorage.getItem('inllm-session') || ''}` });
export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> { const res = await fetch('/api' + url, { method, headers: { ...auth(), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'The operation failed.'); return data; }
export async function upload(file: File) { const form = new FormData(); form.append('file', file); return api('/files', 'POST', form); }
export async function fileUrl(id: string) { const res = await fetch('/api/files/' + id, { headers: auth() }); if (!res.ok) throw new Error('Could not load the file.'); return URL.createObjectURL(await res.blob()); }
export function saveFile(name: string, content: string) { const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MB` : value >= 1024 ? `${(value / 1024).toFixed(0)} KB` : `${value} B`;
export type State = { workspaces: any[]; chats: any[]; models: any[]; downloads: any[]; documents: any[]; settings: any; providers: any[]; activeModel: string | null; system: any };
export const empty: State = { workspaces: [], chats: [], models: [], downloads: [], documents: [], settings: {}, providers: [], activeModel: null, system: {} };
declare global { interface Window { inLLM?: { pickFolder(): Promise<string | null>; pickModel(): Promise<string | null>; transcribe(id: string, locale: string): Promise<string>; platform: string; }; } }
