// طبقة الاتصال: نفس الواجهة للوضع المحلي (متصفح واحد) وللوضع المتصل (Vercel + Supabase) ولخادم الشبكة المحلية.
import { applyCommand, authenticate, createMatch, mathRng, projectView, randomId } from '@/engine/engine';
import type { AnyView, Command, MatchState, Settings, Question } from '@/engine/types';

export type Mode = 'local' | 'lan' | 'online';
export interface Creds { hostToken?: string; teamToken?: string; roomCode?: string; pin?: string }
export interface SessionInfo { mode: Mode; roomCode: string; creds: Creds }
export type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

export interface RoomConnection {
  subscribe(cb: (v: AnyView) => void): () => void;
  onStatus(cb: (s: ConnStatus) => void): () => void;
  send(command: Command): Promise<{ ok: true } | { ok: false; error: string }>;
  close(): void;
  current(): AnyView | null;
}

const newReq = () => randomId(mathRng, 14);

// ───────── الوضع المحلي: المقدم هو السلطة داخل المتصفح، والتبويبات الأخرى تتصل عبر BroadcastChannel ─────────
const LS_KEY = (code: string) => `aswar:match:${code}`;
export const SAVED_INDEX = 'aswar:saved';

export function listSavedMatches(): { code: string; savedAt: number; teams: string[]; phase: string }[] {
  try { return JSON.parse(localStorage.getItem(SAVED_INDEX) || '[]'); } catch { return []; }
}
function saveLocal(s: MatchState) {
  try {
    localStorage.setItem(LS_KEY(s.roomCode), JSON.stringify(s));
    const idx = listSavedMatches().filter((x) => x.code !== s.roomCode);
    idx.unshift({ code: s.roomCode, savedAt: Date.now(), teams: s.teams.map((t) => t.name), phase: s.phase });
    localStorage.setItem(SAVED_INDEX, JSON.stringify(idx.slice(0, 20)));
  } catch { /* التخزين غير متاح */ }
}
export function loadLocal(code: string): MatchState | null {
  try { const r = localStorage.getItem(LS_KEY(code)); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function deleteLocal(code: string) {
  try {
    localStorage.removeItem(LS_KEY(code));
    localStorage.setItem(SAVED_INDEX, JSON.stringify(listSavedMatches().filter((x) => x.code !== code)));
  } catch { /* */ }
}

type BcMsg =
  | { t: 'hello'; from: string; creds: Creds }
  | { t: 'cmd'; from: string; creds: Creds; requestId: string; command: Command }
  | { t: 'view'; to: string; view: AnyView }
  | { t: 'reply'; to: string; requestId: string; ok: boolean; error?: string }
  | { t: 'ping' };

export class LocalAuthority implements RoomConnection {
  private state: MatchState;
  private subs = new Set<(v: AnyView) => void>();
  private bc: BroadcastChannel | null = null;
  private peers = new Map<string, Creds>();
  constructor(state: MatchState) {
    this.state = state;
    saveLocal(state);
    try {
      this.bc = new BroadcastChannel('aswar-local-' + state.roomCode);
      this.bc.onmessage = (e) => this.onPeer(e.data as BcMsg);
      this.bc.postMessage({ t: 'ping' } satisfies BcMsg);
    } catch { /* غير مدعوم */ }
  }
  static create(opts: { teams?: number; settings?: Partial<Settings>; questions?: Question[] }) {
    return new LocalAuthority(createMatch({ now: Date.now(), rng: mathRng, ...opts }));
  }
  get raw() { return this.state; }
  private onPeer(m: BcMsg) {
    if (m.t === 'hello') {
      this.peers.set(m.from, m.creds);
      this.bc?.postMessage({ t: 'view', to: m.from, view: projectView(this.state, authenticate(this.state, m.creds)) } satisfies BcMsg);
    } else if (m.t === 'cmd') {
      this.peers.set(m.from, m.creds);
      const actor = authenticate(this.state, m.creds);
      const r = applyCommand(this.state, { requestId: m.requestId, command: m.command }, actor, { now: Date.now(), rng: mathRng });
      this.bc?.postMessage({ t: 'reply', to: m.from, requestId: m.requestId, ok: r.ok, error: r.ok ? undefined : r.error } satisfies BcMsg);
      if (r.ok && r.state !== this.state) this.commit(r.state);
    }
  }
  private commit(s: MatchState) {
    this.state = s;
    saveLocal(s);
    const hv = projectView(s, { role: 'host' });
    this.subs.forEach((cb) => cb(hv));
    for (const [id, creds] of this.peers) this.bc?.postMessage({ t: 'view', to: id, view: projectView(s, authenticate(s, creds)) } satisfies BcMsg);
  }
  subscribe(cb: (v: AnyView) => void) {
    this.subs.add(cb);
    cb(projectView(this.state, { role: 'host' }));
    return () => void this.subs.delete(cb);
  }
  onStatus(cb: (s: ConnStatus) => void) { cb('live'); return () => {}; }
  async send(command: Command) {
    const r = applyCommand(this.state, { requestId: newReq(), command }, { role: 'host' }, { now: Date.now(), rng: mathRng });
    if (!r.ok) return { ok: false as const, error: r.error };
    if (r.state !== this.state) this.commit(r.state);
    return { ok: true as const };
  }
  current() { return projectView(this.state, { role: 'host' }); }
  close() { this.bc?.close(); }
}

export class LocalPeer implements RoomConnection {
  private id = randomId(mathRng, 10);
  private bc: BroadcastChannel;
  private view: AnyView | null = null;
  private subs = new Set<(v: AnyView) => void>();
  private statusSubs = new Set<(s: ConnStatus) => void>();
  private pending = new Map<string, (r: { ok: boolean; error?: string }) => void>();
  private timer: number;
  constructor(private roomCode: string, private creds: Creds) {
    this.bc = new BroadcastChannel('aswar-local-' + roomCode);
    this.bc.onmessage = (e) => {
      const m = e.data as BcMsg;
      if (m.t === 'view' && m.to === this.id) {
        this.view = m.view;
        this.subs.forEach((cb) => cb(m.view));
        this.statusSubs.forEach((cb) => cb('live'));
      } else if (m.t === 'reply' && m.to === this.id) {
        this.pending.get(m.requestId)?.({ ok: m.ok, error: m.error });
        this.pending.delete(m.requestId);
      } else if (m.t === 'ping') this.hello();
    };
    this.hello();
    this.timer = window.setInterval(() => !this.view && this.hello(), 1500);
  }
  private hello() { this.bc.postMessage({ t: 'hello', from: this.id, creds: this.creds } satisfies BcMsg); }
  subscribe(cb: (v: AnyView) => void) { this.subs.add(cb); if (this.view) cb(this.view); return () => void this.subs.delete(cb); }
  onStatus(cb: (s: ConnStatus) => void) { this.statusSubs.add(cb); cb(this.view ? 'live' : 'connecting'); return () => void this.statusSubs.delete(cb); }
  send(command: Command) {
    const requestId = newReq();
    return new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
      const to = setTimeout(() => { this.pending.delete(requestId); resolve({ ok: false, error: 'شاشة المقدم غير متصلة' }); }, 4000);
      this.pending.set(requestId, (r) => { clearTimeout(to); resolve(r.ok ? { ok: true } : { ok: false, error: r.error || 'خطأ' }); });
      this.bc.postMessage({ t: 'cmd', from: this.id, creds: this.creds, requestId, command } satisfies BcMsg);
    });
  }
  current() { return this.view; }
  close() { clearInterval(this.timer); this.bc.close(); }
}

// ───────── الوضع المتصل: الخادم هو المصدر الموثوق ─────────
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const onlineConfigured = !!(SUPA_URL && SUPA_ANON);

async function api<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: 'استجابة غير صالحة' }));
  if (!r.ok) throw new Error(j.error || 'خطأ ' + r.status);
  return j as T;
}

export async function detectServer(): Promise<Mode | null> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return null;
    const j = await r.json();
    return j.mode === 'lan' ? 'lan' : j.mode === 'online' ? 'online' : null;
  } catch { return null; }
}

export async function lanAddresses(): Promise<string[]> {
  try { const j = await (await fetch('/api/health')).json(); return j.ips || []; } catch { return []; }
}

export async function createRemoteRoom(opts: { teams?: number; settings?: Partial<Settings>; questions?: Question[] }) {
  return api<{ roomCode: string; hostToken: string }>('room', opts);
}

export class RemoteRoom implements RoomConnection {
  private view: AnyView | null = null;
  private subs = new Set<(v: AnyView) => void>();
  private statusSubs = new Set<(s: ConnStatus) => void>();
  private status: ConnStatus = 'connecting';
  private closeFns: (() => void)[] = [];
  private closed = false;
  constructor(private mode: 'lan' | 'online', private roomCode: string, private creds: Creds) {
    void this.boot();
    const onVis = () => document.visibilityState === 'visible' && this.refresh();
    const onOnline = () => this.refresh();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    const offline = () => this.setStatus('offline');
    window.addEventListener('offline', offline);
    this.closeFns.push(() => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', offline);
    });
    const poll = window.setInterval(() => this.status !== 'live' && this.refresh(), 5000);
    this.closeFns.push(() => clearInterval(poll));
  }
  private setStatus(s: ConnStatus) { this.status = s; this.statusSubs.forEach((cb) => cb(s)); }
  private accept(v: AnyView) {
    if (this.view && v.version < this.view.version) return;
    this.view = v;
    this.subs.forEach((cb) => cb(v));
  }
  private async refresh() {
    try {
      const { view } = await api<{ view: AnyView; topic: string }>('view', { roomCode: this.roomCode, ...this.creds });
      this.accept(view);
      if (this.status !== 'live') this.setStatus(this.mode === 'lan' ? 'live' : this.status === 'connecting' ? 'connecting' : this.status);
    } catch { this.setStatus('reconnecting'); }
  }
  private async boot() {
    let topic = '';
    try {
      const r = await api<{ view: AnyView; topic: string }>('view', { roomCode: this.roomCode, ...this.creds });
      this.accept(r.view);
      topic = r.topic;
    } catch (e) {
      this.setStatus('offline');
      throw e;
    }
    if (this.closed) return;
    if (this.mode === 'lan') {
      const q = new URLSearchParams({ roomCode: this.roomCode, ...(this.creds as Record<string, string>) });
      const es = new EventSource('/api/stream?' + q.toString());
      es.onopen = () => { this.setStatus('live'); this.refresh(); };
      es.onmessage = (e) => this.accept(JSON.parse(e.data));
      es.onerror = () => this.setStatus('reconnecting');
      this.closeFns.push(() => es.close());
    } else {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(SUPA_URL!, SUPA_ANON!, { auth: { persistSession: false } });
      const ch = sb.channel(topic, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'view' }, (m) => this.accept(m.payload as AnyView));
      ch.subscribe((st) => {
        if (st === 'SUBSCRIBED') { this.setStatus('live'); this.refresh(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') this.setStatus('reconnecting');
      });
      this.closeFns.push(() => void sb.removeChannel(ch));
    }
  }
  subscribe(cb: (v: AnyView) => void) { this.subs.add(cb); if (this.view) cb(this.view); return () => void this.subs.delete(cb); }
  onStatus(cb: (s: ConnStatus) => void) { this.statusSubs.add(cb); cb(this.status); return () => void this.statusSubs.delete(cb); }
  async send(command: Command) {
    const requestId = newReq();
    for (let i = 0; i < 3; i++) {
      try {
        const r = await api<{ view: AnyView }>('command', { roomCode: this.roomCode, ...this.creds, envelope: { requestId, command } });
        this.accept(r.view);
        return { ok: true as const };
      } catch (e) {
        const msg = (e as Error).message;
        // أخطاء الشبكة فقط تعاد بنفس معرف الطلب؛ الخادم يمنع التنفيذ المزدوج
        if (!/fetch|network|Failed/i.test(msg)) return { ok: false as const, error: msg };
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    return { ok: false as const, error: 'تعذر الاتصال بالخادم' };
  }
  current() { return this.view; }
  close() { this.closed = true; this.closeFns.forEach((f) => f()); }
}

export function connect(info: SessionInfo): RoomConnection {
  if (info.mode === 'local') {
    if (info.creds.hostToken) {
      const s = loadLocal(info.roomCode);
      if (s && s.hostToken === info.creds.hostToken) return new LocalAuthority(s);
    }
    return new LocalPeer(info.roomCode, info.creds);
  }
  return new RemoteRoom(info.mode, info.roomCode, info.creds);
}
