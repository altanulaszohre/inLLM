import { spawn, type ChildProcess } from 'node:child_process';
import { findRuntime } from './models';
import { check } from './security';
import { type Model, LocalProvider, type ProviderConfig } from './providers';
export class RuntimeSupervisor {
  child?: ChildProcess; status = 'Stopped';
  async start(model: Model, config: ProviderConfig) {
    check(model.path && model.provider !== 'ollama', 'Choose a local GGUF file or MLX folder.');
    check(model.provider !== 'mlx' || (process.platform === 'darwin' && process.arch === 'arm64'), 'MLX requires an Apple Silicon Mac.');
    const binary = findRuntime(model.provider === 'mlx' ? 'mlx_lm.server' : 'llama-server'); check(binary, `Install ${model.provider === 'mlx' ? 'mlx-lm' : 'llama.cpp'} separately, then restart inLLM. No runtime is installed automatically.`);
    check(!this.child, 'Stop the currently managed runtime before loading another model.');
    const endpoint = new URL(config.endpoint); const port = endpoint.port || '80';
    // Fail if another process already owns the endpoint; never terminate user runtimes.
    try { const response = await fetch(endpoint, { signal: AbortSignal.timeout(800) }); if (response) throw new Error('occupied'); } catch (error) { check((error as Error).message !== 'occupied', 'This runtime port is already in use. Stop that runtime or choose another port.'); }
    const args = ['--model', model.path, '--host', '127.0.0.1', '--port', port, ...(model.provider === 'llama' ? ['--ctx-size', '4096'] : [])];
    this.status = 'Loading'; const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } }); this.child = child;
    let detail = ''; child.stderr?.on('data', chunk => { detail = (detail + chunk.toString()).slice(-1000); });
    child.once('error', () => { this.status = 'Runtime could not start.'; this.child = undefined; }); child.once('exit', code => { if (this.child === child) { this.child = undefined; this.status = code ? 'Runtime exited. Check model compatibility and available memory.' : 'Stopped'; } });
    const provider = new LocalProvider(config);
    for (let i = 0; i < 120; i++) { if (!this.child) throw new Error(this.status); try { const models = await provider.models(); if (models.length) { this.status = 'Ready'; return models; } } catch {} await new Promise(r => setTimeout(r, 500)); }
    this.stop(); throw new Error('Model load timed out after approximately one minute. Check runtime compatibility and memory.');
  }
  stop() { this.child?.kill('SIGTERM'); this.child = undefined; this.status = 'Stopped'; }
}
