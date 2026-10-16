/**
 * إدارة الغرف على الخادم: التخزين (Supabase أو ذاكرة الخادم)، الصلاحيات، وتطبيق الحركات.
 * الخادم هو المرجع الوحيد للحالة والنقاط؛ المتصفح يرسل «نوايا» فقط.
 */
import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { apply, createState, randomId, viewFor } from '@/lib/game/engine';
import { QUESTIONS } from '@/lib/game/questions';
import type { Action, Actor, GameState, Question } from '@/lib/game/types';
import { broadcastUpdate, db, supabaseEnabled } from './supabase';

export interface Room { code: string; hostKeyHash: string; state: GameState; version: number }

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- التخزين في الذاكرة (التطوير أو استضافة Node واحدة) ----------
type Mem = { rooms: Map<string, Room>; bus: EventEmitter };
const g = globalThis as unknown as { __aswar?: Mem };
const mem: Mem = (g.__aswar ??= { rooms: new Map(), bus: new EventEmitter().setMaxListeners(0) });
export const roomBus = mem.bus;

async function loadRoom(code: string): Promise<Room | null> {
  if (!supabaseEnabled) return mem.rooms.get(code) ?? null;
  const data = await db.roomGet(code);
  return data ? { code: data.code, hostKeyHash: data.host_key_hash, state: data.state as GameState, version: data.version } : null;
}

async function insertRoom(room: Room): Promise<boolean> {
  if (!supabaseEnabled) {
    if (mem.rooms.has(room.code)) return false;
    mem.rooms.set(room.code, room);
    return true;
  }
  return db.roomInsert({ code: room.code, host_key_hash: room.hostKeyHash, state: room.state, version: room.version });
}

/** حفظ بشرط عدم تغيّر الإصدار (تزامن متفائل) */
async function saveRoom(room: Room, prevVersion: number): Promise<boolean> {
  if (!supabaseEnabled) {
    const cur = mem.rooms.get(room.code);
    if (!cur || cur.version !== prevVersion) return false;
    mem.rooms.set(room.code, room);
    return true;
  }
  return db.roomUpdate(room.code, room.state, room.version, prevVersion);
}

async function notify(code: string, v: number) {
  if (supabaseEnabled) await broadcastUpdate(code, v);
  else mem.bus.emit(code, v);
}

// ---------- بنك الأسئلة ----------
let bankCache: { at: number; list: Question[] } | null = null;
export async function questionBank(): Promise<Question[]> {
  if (!supabaseEnabled) return QUESTIONS;
  if (bankCache && Date.now() - bankCache.at < 60_000) return bankCache.list;
  const data = await db.questions();
  const list = data?.length
    ? data.map((r) => ({ id: 'db' + r.id, c: r.category, l: r.level, q: r.question, a: r.answer, w: r.wrong ?? [] }) as Question)
    : QUESTIONS;
  bankCache = { at: Date.now(), list };
  return list;
}

async function saveResult(room: Room) {
  if (!supabaseEnabled) return;
  const teams = room.state.teams.map((t) => ({ name: t.name, color: t.color, score: t.score }));
  await db.resultInsert(room.code, teams, room.state.round);
}

// ---------- الواجهة العامة ----------
export async function createRoom(): Promise<{ code: string; hostKey: string }> {
  const hostKey = randomId(24);
  for (let i = 0; i < 20; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const ok = await insertRoom({ code, hostKeyHash: sha(hostKey), state: createState(), version: 1 });
    if (ok) return { code, hostKey };
  }
  throw new Error('تعذر إنشاء غرفة');
}

export function actorFor(room: Room, key: string | null): Actor | null {
  if (!key) return null;
  if (safeEq(sha(key), room.hostKeyHash)) return { role: 'host' };
  const team = room.state.teams.find((t) => t.joinCode && safeEq(t.joinCode, key.toUpperCase()));
  return team ? { role: 'team', teamId: team.id } : null;
}

export async function getView(code: string, key: string | null) {
  const room = await loadRoom(code);
  if (!room) return { status: 404 as const, error: 'الغرفة غير موجودة' };
  const me = actorFor(room, key);
  if (!me) return { status: 403 as const, error: 'رمز الدخول غير صحيح' };
  return { status: 200 as const, me, state: viewFor(room.state, me) };
}

export async function act(code: string, key: string | null, action: Action) {
  const bank = await questionBank();
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = await loadRoom(code);
    if (!room) return { status: 404 as const, error: 'الغرفة غير موجودة' };
    const me = actorFor(room, key);
    if (!me) return { status: 403 as const, error: 'رمز الدخول غير صحيح' };
    const state = structuredClone(room.state);
    const wasEnd = state.phase === 'end';
    const err = apply(state, action, me, bank);
    if (err) return { status: 400 as const, error: err };
    state.v++;
    const next: Room = { ...room, state, version: room.version + 1 };
    if (await saveRoom(next, room.version)) {
      await notify(code, state.v);
      if (!wasEnd && state.phase === 'end') await saveResult(next).catch(() => {});
      return { status: 200 as const, ok: true };
    }
  }
  return { status: 409 as const, error: 'ازدحام في الغرفة، حاول مجددًا' };
}

export const realtimeMode = () => (supabaseEnabled ? 'supabase' : 'sse');
