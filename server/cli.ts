import { createApp } from './app';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), import.meta.url.endsWith('.ts') ? '../build/web' : '../web');
const backend = await createApp({ webDir });
const port = Number(process.env.INLLM_PORT || 4317);
const server = backend.app.listen(port, '127.0.0.1', () => { console.log(`\ninLLM is ready. Open this private local launch link:\nhttp://127.0.0.1:${port}/#token=${backend.token}\n\nKeep this link private. Press Ctrl+C to stop.\n`); });
server.on('error', () => { console.error('inLLM could not start. Choose an available INLLM_PORT.'); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { backend.close(); server.close(); setTimeout(() => process.exit(0), 500).unref(); });
