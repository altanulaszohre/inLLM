import { useState } from 'react';
import { Folder, HardDrive, Moon, Sun, Monitor, ShieldCheck, Trash2, ArrowUpRight, Square } from 'lucide-react';
import { api, bytes } from './api';
import { useApp } from './context';
import { PageTitle } from './components/ui';

export function Settings() {
  const { state, refresh, run, toast } = useApp();
  const [directory, setDirectory] = useState(state.settings.modelDirectory || state.system.modelDirectory || '');
  const theme = state.settings.theme || 'light';
  const update = (value: Record<string, string>) => void run(async () => { await api('/settings', 'PATCH', value); await refresh(); toast('Preferences saved'); });
  return <div className="page settings-page"><PageTitle eyebrow="MAKE IT YOURS" title="Preferences, at your pace." description="A few thoughtful controls for your local workspace."/>
    <section className="settings-group"><h2>Appearance</h2><p>Choose the atmosphere that works for you.</p><div className="setting-options">{[{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Monitor }].map(({ id, label, icon: Icon }) => <button className={theme === id ? 'selected' : ''} key={id} onClick={() => update({ theme: id })}><Icon size={18}/>{label}</button>)}</div></section>
    <section className="settings-group"><h2>Model storage</h2><p>Downloaded weights live outside the app and its source code.</p><label>Managed model directory<div className="input-action"><input value={directory} onChange={e => setDirectory(e.target.value)} placeholder="Choose an absolute path on this computer"/>{window.inLLM && <button onClick={() => void run(async () => { const picked = await window.inLLM!.pickFolder(); if (picked) setDirectory(picked); })}><Folder size={15}/>Choose</button>}</div></label><div className="setting-footer"><span><HardDrive size={15}/>{bytes(state.system.freeDisk || 0)} free at current storage location</span><button className="primary" disabled={!directory || directory === (state.settings.modelDirectory || state.system.modelDirectory)} onClick={() => update({ modelDirectory: directory })}>Save location</button></div></section>
    <section className="settings-group"><h2>Local runtime</h2><p>Runtimes are detected on your computer. Model weights are never fetched in the background.</p><div className="runtime-list">{Object.entries(state.system.runtimes || {}).map(([name, present]) => <div key={name}><span>{name === 'llama' ? 'llama.cpp' : name === 'mlx' ? 'MLX' : 'Ollama'}</span><strong className={present ? 'success' : 'muted'}>{present ? 'Installed' : 'Not detected'}</strong></div>)}</div>{state.system.runtimeStatus && state.system.runtimeStatus !== 'Stopped' && <button onClick={() => void run(async () => { await api('/runtime/stop', 'POST'); await refresh(); toast('Managed runtime stopped'); })}><Square size={14}/>Stop managed runtime</button>}</section>
    <div className="info-strip"><ShieldCheck size={19}/><span>Local API access requires a private session token and is restricted to loopback. Conversations, imports, and settings are stored in your user data directory.</span></div>
  </div>;
}

export function Workspaces() {
  const { state, workspace, setWorkspace, refresh, run, confirm, newWorkspace, navigate } = useApp();
  return <div className="page settings-page"><PageTitle eyebrow="YOUR SPACES" title="Keep the context together." description="Each workspace holds its own conversations and optional project folder."><button className="primary" onClick={newWorkspace}>Create workspace</button></PageTitle><div className="workspace-cards">{state.workspaces.map(w => <div className="workspace-card" key={w.id}><div className="workspace-card-icon"><Folder size={22}/></div><div><strong>{w.name}</strong><small>{w.root ? 'Project folder attached' : 'Conversations and documents'}</small></div><button onClick={() => { setWorkspace(w.id); navigate(w.root ? 'Code' : 'Chat'); }}>Open <ArrowUpRight size={14}/></button><button className="icon-button" aria-label={'Delete ' + w.name} disabled={state.workspaces.length < 2} onClick={() => confirm('Delete workspace?', 'This removes the workspace entry. Project files on disk are untouched.', async () => { await api('/workspaces/' + w.id, 'DELETE', { approved: true }); await refresh(); if (workspace === w.id) setWorkspace(state.workspaces.find(other => other.id !== w.id)?.id || ''); }, 'Delete workspace')}><Trash2 size={15}/></button></div>)}</div></div>;
}
