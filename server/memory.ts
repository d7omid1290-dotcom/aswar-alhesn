// تخزين في الذاكرة + بث عبر Server-Sent Events: لخادم الشبكة المحلية (npm run dev).
import type { MatchState } from '../src/engine/types';
import { projectView, authenticate } from '../src/engine/engine';
import type { Creds, Publisher, Store } from './rooms';
import type { ServerResponse } from 'node:http';

export class MemoryStore implements Store {
  rooms = new Map<string, MatchState>();
  events: { code: string; type: string; actor: string; at: number }[] = [];
  async get(code: string) { const s = this.rooms.get(code); return s ? structuredClone(s) : null; }
  async insert(s: MatchState) { this.rooms.set(s.roomCode, structuredClone(s)); }
  async update(s: MatchState, expected: number) {
    const cur = this.rooms.get(s.roomCode);
    if (!cur || cur.version !== expected) return false;
    this.rooms.set(s.roomCode, structuredClone(s));
    return true;
  }
  async logEvent(code: string, e: { type: string; actor: string }) { this.events.push({ code, ...e, at: Date.now() }); }
}

type Sub = { code: string; creds: Creds; res: ServerResponse };
export class SseHub implements Publisher {
  subs = new Set<Sub>();
  add(sub: Sub) { this.subs.add(sub); sub.res.on('close', () => this.subs.delete(sub)); }
  async publish(state: MatchState) {
    for (const sub of this.subs) {
      if (sub.code !== state.roomCode) continue;
      const actor = authenticate(state, sub.creds);
      sub.res.write(`data: ${JSON.stringify(projectView(state, actor))}\n\n`);
    }
  }
}
