'use client';
/**
 * الاتصال بالغرفة من المتصفح: يجلب الحالة المصرّح بها من الخادم ويستمع لإشعارات التحديث
 * (Supabase Realtime إن وُجد، وإلا SSE من خادم Next نفسه).
 * ويوفّر «وضع الشاشة الواحدة» الذي يشغّل المحرك محليًا بلا خادم.
 */
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { apply, createState } from '@/lib/game/engine';
import { QUESTIONS } from '@/lib/game/questions';
import type { Action, Actor, GameState } from '@/lib/game/types';

export interface RoomConn {
  send(a: Action): Promise<{ ok?: boolean; error?: string }>;
  close(): void;
}
export type Listener = (state: GameState, me: Actor) => void;
export type StatusListener = (s: 'online' | 'reconnecting' | 'offline' | 'denied') => void;

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function createRoom(): Promise<{ code: string; hostKey: string }> {
  const r = await fetch('/api/rooms', { method: 'POST' });
  if (!r.ok) throw new Error('تعذر إنشاء غرفة');
  return r.json();
}

export async function checkRoom(code: string, key: string) {
  const r = await fetch(`/api/rooms/${code}`, { headers: { 'x-room-key': key }, cache: 'no-store' });
  return r.ok;
}

export function connectOnline(code: string, key: string, onState: Listener, onStatus: StatusListener): RoomConn {
  let closed = false, lastV = 0, inflight = false, again = false;
  async function refresh() {
    if (inflight) { again = true; return; }
    inflight = true;
    try {
      const r = await fetch(`/api/rooms/${code}`, { headers: { 'x-room-key': key }, cache: 'no-store' });
      if (r.status === 403 || r.status === 404) { onStatus('denied'); return; }
      const d = await r.json();
      if (!closed && d.state && d.state.v >= lastV) { lastV = d.state.v; onState(d.state, d.me); onStatus('online'); }
    } catch { onStatus('reconnecting'); }
    finally { inflight = false; if (again) { again = false; refresh(); } }
  }

  let es: EventSource | null = null, channel: RealtimeChannel | null = null;
  if (SUPA_URL && SUPA_ANON) {
    const sb = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } });
    channel = sb.channel(`room:${code}`).on('broadcast', { event: 'update' }, (m) => { if ((m.payload?.v ?? 0) > lastV) refresh(); })
      .subscribe((s) => { if (s === 'SUBSCRIBED') refresh(); else if (s !== 'CLOSED') onStatus('reconnecting'); });
  } else {
    const open = () => {
      es = new EventSource(`/api/rooms/${code}/events`);
      es.onopen = () => refresh();
      es.onmessage = (e) => { if (+e.data > lastV) refresh(); };
      es.onerror = () => { onStatus('reconnecting'); if (es?.readyState === 2 && !closed) setTimeout(open, 2000); };
    };
    open();
  }
  refresh();
  // احتياط: تحديث دوري خفيف إن فاتنا إشعار
  const poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15000);
  const onVis = () => document.visibilityState === 'visible' && refresh();
  document.addEventListener('visibilitychange', onVis);

  return {
    async send(action) {
      try {
        const r = await fetch(`/api/rooms/${code}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-room-key': key }, body: JSON.stringify({ action }) });
        const d = await r.json();
        if (d.ok) refresh();
        return d;
      } catch { return { error: 'تعذر الاتصال بالخادم' }; }
    },
    close() {
      closed = true; clearInterval(poll); document.removeEventListener('visibilitychange', onVis);
      es?.close(); channel?.unsubscribe();
    },
  };
}

const LOCAL_KEY = 'aswar-local-v2';
export function connectLocal(onState: Listener): RoomConn {
  let state: GameState;
  try { state = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null') || createState(); } catch { state = createState(); }
  const me: Actor = { role: 'host' };
  queueMicrotask(() => onState(structuredClone(state), me));
  return {
    async send(a) {
      const err = apply(state, a, me, QUESTIONS);
      if (err) return { error: err };
      state.v++;
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch {}
      onState(structuredClone(state), me);
      return { ok: true };
    },
    close() {},
  };
}
export const clearLocal = () => { try { localStorage.removeItem(LOCAL_KEY); } catch {} };
