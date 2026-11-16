import { createContext, useContext } from 'react';
import type { State } from './api';
export type Section = 'Chat' | 'Code' | 'Documents' | 'Media' | 'Models' | 'Workspaces' | 'Settings';
export type Prompt = { text: string; attachments?: any[]; document?: string; code?: { workspace: string; file: string } };
export type AppContext = { state: State; refresh: () => Promise<void>; section: Section; navigate: (s: Section) => void; workspace: string; setWorkspace: (id: string) => void; chat: string | null; setChat: (id: string | null) => void; pending: Prompt | null; setPending: (p: Prompt | null) => void; ask: (p: Prompt) => void; run: (fn: () => Promise<unknown>) => Promise<void>; toast: (s: string) => void; confirm: (title: string, body: string, action: () => Promise<unknown>, label?: string) => void; newWorkspace: () => void; };
export const Context = createContext<AppContext>(null!);
export const useApp = () => useContext(Context);
