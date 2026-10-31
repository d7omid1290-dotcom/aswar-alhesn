import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { connect, type ConnStatus, type RoomConnection, type SessionInfo, type Mode } from '@/net/client';
import type { AnyView, Command } from '@/engine/types';

export function useRoom(info: SessionInfo | null) {
  const [view, setView] = useState<AnyView | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const connRef = useRef<RoomConnection | null>(null);
  const key = info ? JSON.stringify(info) : '';
  useEffect(() => {
    if (!info) return;
    const c = connect(info);
    connRef.current = c;
    const u1 = c.subscribe(setView);
    const u2 = c.onStatus(setStatus);
    return () => { u1(); u2(); c.close(); connRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const send = useMemo(() => async (cmd: Command) => {
    const c = connRef.current;
    if (!c) return { ok: false as const, error: 'غير متصل' };
    return c.send(cmd);
  }, []);
  return { view, status, send };
}

export function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// ───── المسار (hash router) ─────
function subscribeHash(cb: () => void) { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); }
export function useRoute() {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => '');
  const [path, qs] = (hash.replace(/^#/, '') || '/').split('?');
  return { path: path || '/', params: new URLSearchParams(qs || '') };
}
export function go(path: string, params?: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null) q.set(k, v);
  const s = q.toString();
  location.hash = path + (s ? '?' + s : '');
}

// ───── المظهر الداكن/الفاتح ─────
export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('aswar:theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('aswar:theme', theme); } catch { /* */ }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), setTheme };
}

// ───── بيانات اعتماد المقدم المحفوظة ─────
export function saveHostCreds(code: string, mode: Mode, hostToken: string) {
  try { localStorage.setItem('aswar:host:' + code, JSON.stringify({ mode, hostToken })); } catch { /* */ }
}
export function loadHostCreds(code: string): { mode: Mode; hostToken: string } | null {
  try { const r = localStorage.getItem('aswar:host:' + code); return r ? JSON.parse(r) : null; } catch { return null; }
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'info'; id: number } | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); }, [msg]);
  return { msg, show: (text: string, tone: 'error' | 'info' = 'error') => setMsg({ text, tone, id: Date.now() }) };
}
