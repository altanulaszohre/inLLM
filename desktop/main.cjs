const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

let server;
let backend;
let window;
const local = url => { try { const parsed = new URL(url); return parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1' && parsed.port === String(server?.address()?.port); } catch { return false; } };

async function selectFolder() {
  const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
}
async function selectModel() {
  const result = await dialog.showMessageBox(window, { type: 'question', message: 'Select a GGUF file or MLX folder', buttons: ['GGUF file', 'MLX folder', 'Cancel'], defaultId: 0, cancelId: 2 });
  if (result.response === 2) return null;
  const selected = await dialog.showOpenDialog(window, { properties: result.response === 0 ? ['openFile'] : ['openDirectory'], filters: result.response === 0 ? [{ name: 'GGUF model', extensions: ['gguf'] }] : undefined });
  return selected.canceled ? null : selected.filePaths[0];
}
async function transcribe(id, locale) {
  if (process.platform !== 'darwin') throw new Error('On-device transcription is available in the macOS desktop app.');
  if (!/^[a-f0-9-]{36}$/i.test(id) || !/^[a-z]{2}-[A-Z]{2}$/.test(locale)) throw new Error('Invalid transcription request.');
  const source = path.join(app.getPath('userData'), 'files', id);
  await fs.access(source);
  const script = path.join(__dirname, 'transcribe.swift');
  return await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/swift', [script, source, locale], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
    child.stdout.on('data', data => { output += String(data).slice(0, 100000 - output.length); });
    child.stderr.on('data', data => { error += String(data).slice(0, 2000 - error.length); });
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(error.trim() || 'Local transcription was unavailable for this audio file.')); });
  });
}
async function launch() {
  const { createApp } = await import(pathToFileURL(path.join(__dirname, '..', 'build', 'server', 'app.mjs')).href);
  backend = await createApp({ dataDir: app.getPath('userData'), webDir: path.join(__dirname, '..', 'build', 'web') });
  server = await new Promise((resolve, reject) => {
    const listener = backend.app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  await createWindow();
}
async function createWindow() {
  const url = `http://127.0.0.1:${server.address().port}/#token=${backend.token}`;
  window = new BrowserWindow({ width: 1450, height: 920, minWidth: 880, minHeight: 600, title: 'inLLM', backgroundColor: '#FAF9F7', titleBarStyle: 'hiddenInset', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true } });
  window.webContents.setWindowOpenHandler(({ url: target }) => { if (target.startsWith('https://')) void shell.openExternal(target); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, target) => { if (!local(target)) event.preventDefault(); });
  await window.loadURL(url);
  const menu = Menu.buildFromTemplate([{ label: 'inLLM', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'quit' }] }, { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }] }, { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] }]);
  Menu.setApplicationMenu(menu);
}
app.whenReady().then(async () => {
  ipcMain.handle('pick-folder', selectFolder);
  ipcMain.handle('pick-model', selectModel);
  ipcMain.handle('transcribe', (_event, id, locale) => transcribe(id, locale));
  try { await launch(); } catch (error) { dialog.showErrorBox('inLLM could not start', String(error)); app.quit(); }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length && server) void createWindow(); });
app.on('before-quit', () => { backend?.close(); server?.close(); });
