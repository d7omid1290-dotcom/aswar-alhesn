// تخزين في Supabase PostgreSQL عبر دوال محمية بسر الخادم + بث عبر Supabase Realtime Broadcast.
// يعمل على الخادم فقط. لا تُرسل هذه المتغيرات إلى المتصفح أبدًا.
import type { MatchState } from '../src/engine/types';
import { projectView } from '../src/engine/engine';
import { channelsFor, type Publisher, type Store } from './rooms';

export function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const secret = process.env.HISN_SERVER_SECRET;
  return url && key && secret ? { url: url.replace(/\/$/, ''), key, secret } : null;
}

export class SupabaseStore implements Store {
  constructor(private url: string, private key: string, private secret: string) {}
  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const r = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_secret: this.secret, ...args }),
    });
    if (!r.ok) throw new Error(`rpc ${fn} ${r.status} ${await r.text()}`);
    const t = await r.text();
    return (t ? JSON.parse(t) : null) as T;
  }
  get(code: string) { return this.rpc<MatchState | null>('hisn_get', { p_code: code }); }
  async insert(s: MatchState) { await this.rpc('hisn_insert', { p_code: s.roomCode, p_version: s.version, p_phase: s.phase, p_state: s }); }
  update(s: MatchState, expected: number) { return this.rpc<boolean>('hisn_update', { p_code: s.roomCode, p_expected: expected, p_version: s.version, p_phase: s.phase, p_state: s }); }
  async logEvent(code: string, e: { type: string; actor: string; payload: unknown }) {
    await this.rpc('hisn_log', { p_code: code, p_type: e.type, p_actor: e.actor, p_payload: e.payload ?? null }).catch(() => {});
  }
}

export class SupabaseBroadcast implements Publisher {
  constructor(private url: string, private key: string) {}
  async publish(state: MatchState) {
    // كل دور يتلقى عرضه فقط على قناة اسمها يحتوي سره (المقدم/الفريق)، والجمهور على القناة العامة
    const messages = channelsFor(state).map(({ topic, actor }) => ({ topic, event: 'view', payload: projectView(state, actor) }));
    await fetch(`${this.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    }).catch(() => {});
  }
}
