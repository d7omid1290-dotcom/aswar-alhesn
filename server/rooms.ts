// خدمة الغرف: المصدر الموثوق لحالة المباراة. تُستخدم في دوال Vercel وفي خادم الشبكة المحلية.
import { applyCommand, authenticate, createMatch, mathRng, projectView } from '../src/engine/engine';
import type { Actor, AnyView, Envelope, MatchState, Settings, Question } from '../src/engine/types';

export interface Creds { hostToken?: string; teamToken?: string; roomCode?: string; pin?: string }

export interface Store {
  get(code: string): Promise<MatchState | null>;
  insert(state: MatchState): Promise<void>;
  /** يحفظ فقط إن كانت النسخة المخزنة = expectedVersion (منع التعارض) */
  update(state: MatchState, expectedVersion: number): Promise<boolean>;
  logEvent?(code: string, entry: { type: string; actor: string; payload: unknown }): Promise<void>;
}

export interface Publisher {
  publish(state: MatchState): Promise<void>;
}

export function channelsFor(state: MatchState): { topic: string; actor: Actor }[] {
  const base = `aswar-${state.roomCode}`;
  return [
    { topic: `${base}-pub`, actor: { role: 'audience' } },
    { topic: `${base}-h-${state.hostToken}`, actor: { role: 'host' } },
    ...state.teams.map((t) => ({ topic: `${base}-t-${t.token}`, actor: { role: 'team', teamId: t.id } as Actor })),
  ];
}

export function topicForCreds(state: MatchState, actor: Actor): string {
  const base = `aswar-${state.roomCode}`;
  if (actor.role === 'host') return `${base}-h-${state.hostToken}`;
  if (actor.role === 'team') return `${base}-t-${state.teams.find((t) => t.id === actor.teamId)!.token}`;
  return `${base}-pub`;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export class RoomService {
  constructor(private store: Store, private pub: Publisher) {}

  async create(input: { teams?: number; settings?: Partial<Settings>; questions?: Question[] }) {
    const state = createMatch({ now: Date.now(), rng: mathRng, teams: Math.min(8, Math.max(2, input.teams ?? 2)), settings: input.settings, questions: input.questions });
    await this.store.insert(state);
    return { roomCode: state.roomCode, hostToken: state.hostToken, view: projectView(state, { role: 'host' }) };
  }

  async view(code: string, creds: Creds): Promise<{ view: AnyView; topic: string }> {
    const s = await this.store.get(code.toUpperCase());
    if (!s) throw new HttpError(404, 'الغرفة غير موجودة');
    const actor = authenticate(s, creds);
    if ((creds.hostToken || creds.teamToken || creds.pin) && actor.role === 'audience') throw new HttpError(403, 'رمز الدخول غير صحيح');
    return { view: projectView(s, actor), topic: topicForCreds(s, actor) };
  }

  async command(code: string, creds: Creds, env: Envelope): Promise<{ view: AnyView }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const s = await this.store.get(code.toUpperCase());
      if (!s) throw new HttpError(404, 'الغرفة غير موجودة');
      const actor = authenticate(s, creds);
      if (actor.role === 'audience') throw new HttpError(403, 'غير مصرح');
      const r = applyCommand(s, env, actor, { now: Date.now(), rng: mathRng });
      if (!r.ok) throw new HttpError(400, r.error);
      if (r.state === s) return { view: projectView(s, actor) }; // طلب مكرر
      const saved = await this.store.update(r.state, s.version);
      if (!saved) continue; // تعارض: أعد المحاولة على أحدث حالة
      await this.store.logEvent?.(s.roomCode, { type: env.command.type, actor: actor.role === 'team' ? actor.teamId : actor.role, payload: env.command.type === 'SET_QUESTIONS' ? { count: (env.command as any).questions?.length } : env.command });
      await this.pub.publish(r.state);
      return { view: projectView(r.state, actor) };
    }
    throw new HttpError(409, 'تعارض متكرر، حاول مجددًا');
  }
}
