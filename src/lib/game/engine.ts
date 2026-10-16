/**
 * قواعد «أسوار الحصن» — دالة نقية تعمل على الخادم (المرجع الوحيد للنقاط)
 * وفي المتصفح لوضع الشاشة الواحدة.
 */
import type { Action, Actor, ElementDef, GameState, Level, Question, Settings, Team } from './types';
import { CATEGORIES } from './questions';

export const TEAM_COLORS = ['#c2410c', '#1d4ed8', '#15803d', '#7e22ce', '#b45309', '#be185d', '#0f766e', '#4d7c0f'];
export const TEAM_NAMES = ['الصقور', 'الذئاب', 'النمور', 'الأسود', 'الفهود', 'النسور', 'الخيول', 'الدببة'];
export const LEVELS: Record<Level, string> = { 1: 'سهل', 2: 'متوسط', 3: 'صعب' };
export const LEVEL_MULT: Record<Level, number> = { 1: 1, 2: 1.5, 3: 2 };
export const MAX_TEAMS = 8;

export function defaultElements(): ElementDef[] {
  return [
    { id: 'king', name: 'الملك', count: 1, points: 50, effect: 'king' },
    { id: 'knight', name: 'الفارس', count: 2, points: 30 },
    { id: 'cannon', name: 'المدفعية', count: 2, points: 25, effect: 'extra' },
    { id: 'guard', name: 'الحارس', count: 3, points: 20 },
    { id: 'market', name: 'السوق', count: 3, points: 15 },
    { id: 'trap', name: 'الفخ', count: 1, points: -20, effect: 'trap' },
    { id: 'empty', name: 'فراغ', count: 0, points: 0, auto: true },
  ];
}

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomId(n = 10, alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'): string {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}
export const newJoinCode = () => randomId(6, ALPHA);

function makeTeam(i: number): Team {
  return {
    id: 't' + randomId(6), name: TEAM_NAMES[i % TEAM_NAMES.length], color: TEAM_COLORS[i % TEAM_COLORS.length],
    joinCode: newJoinCode(), layout: null, ready: false, score: 0, hits: {}, kingDown: false,
  };
}

export function createState(): GameState {
  return {
    v: 1, phase: 'lobby',
    settings: { gridSize: 5, rounds: 5, timer: 30, levelMultiplier: false, elements: defaultElements(), categories: [...CATEGORIES], levels: [1, 2, 3], custom: [] },
    teams: [makeTeam(0), makeTeam(1)],
    turn: 0, round: 1, current: null, lastStrike: null, usedQ: [], log: [],
  };
}

export const cellCount = (s: Settings) => s.gridSize * s.gridSize;

/** عدد كل عنصر، والفراغ = الباقي */
export function counts(s: Settings): { byId: Record<string, number>; overflow: number } {
  const n = cellCount(s);
  let used = 0;
  const byId: Record<string, number> = {};
  for (const e of s.elements) if (!e.auto) { byId[e.id] = e.count; used += e.count; }
  for (const e of s.elements) if (e.auto) byId[e.id] = Math.max(0, n - used);
  return { byId, overflow: used - n };
}

export const elById = (s: Settings, id: string | null | undefined) => s.elements.find((e) => e.id === id) ?? null;
export const teamById = (st: { teams: Team[] }, id: string | null | undefined) => st.teams.find((t) => t.id === id) ?? null;

export function validLayout(s: Settings, layout: unknown): layout is string[] {
  const n = cellCount(s);
  if (!Array.isArray(layout) || layout.length !== n) return false;
  const { byId } = counts(s);
  const have: Record<string, number> = {};
  for (const x of layout) {
    if (typeof x !== 'string' || !(x in byId)) return false;
    have[x] = (have[x] ?? 0) + 1;
  }
  return Object.keys(byId).every((k) => (have[k] ?? 0) === byId[k]);
}

function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

export function randomLayout(s: Settings): string[] {
  const { byId } = counts(s);
  const arr: string[] = [];
  for (const e of s.elements) for (let i = 0; i < byId[e.id]; i++) arr.push(e.id);
  return shuffle(arr);
}

export function questionPool(s: Settings, bank: Question[]): Question[] {
  return bank.concat(s.custom.map((q, i) => ({ id: 'c' + i, ...q })));
}

export function remainingTargets(st: GameState, attackerId: string) {
  const n = cellCount(st.settings);
  return st.teams.filter((t) => t.id !== attackerId && Object.keys(t.hits).length < n);
}

function log(st: GameState, text: string) {
  st.log.unshift({ at: Date.now(), text });
  st.log = st.log.slice(0, 30);
}

function resetLayouts(st: GameState) {
  for (const t of st.teams) { t.layout = null; t.ready = false; }
}

function pickQuestion(st: GameState, bank: Question[], level: number) {
  const s = st.settings;
  const pool = questionPool(s, bank).filter((q) => s.categories.includes(q.c) && (level ? q.l === level : s.levels.includes(q.l)));
  if (!pool.length) return null;
  let fresh = pool.filter((q) => !st.usedQ.includes(q.id));
  if (!fresh.length) {
    const ids = new Set(pool.map((q) => q.id));
    st.usedQ = st.usedQ.filter((id) => !ids.has(id));
    fresh = pool;
  }
  const q = fresh[Math.floor(Math.random() * fresh.length)];
  st.usedQ.push(q.id);
  return { id: q.id, c: q.c, l: q.l, q: q.q, a: q.a, options: q.w.length ? shuffle([q.a, ...q.w]) : null };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)));

/**
 * يطبّق حركة على الحالة (يعدّلها مباشرة). يرجع رسالة خطأ بالعربية أو null.
 * bank: بنك الأسئلة (من Supabase أو المدمج).
 */
export function apply(st: GameState, a: Action, actor: Actor, bank: Question[]): string | null {
  const host = actor.role === 'host';
  const own = (teamId: string) => host || (actor.role === 'team' && actor.teamId === teamId);
  const s = st.settings;
  const cur = st.current;

  switch (a.type) {
    case 'settings': {
      if (!host) return 'للمقدم فقط';
      if (st.phase !== 'lobby' && st.phase !== 'setup') return 'لا يمكن تعديل الإعدادات أثناء اللعب';
      let reset = false;
      if (a.gridSize != null) { const g = clamp(a.gridSize, 3, 8); if (g !== s.gridSize) reset = true; s.gridSize = g; }
      if (a.rounds != null) s.rounds = clamp(a.rounds, 1, 30);
      if (a.timer != null) s.timer = clamp(a.timer, 0, 300);
      if (a.levelMultiplier != null) s.levelMultiplier = a.levelMultiplier;
      if (a.categories) s.categories = a.categories.slice(0, 50).map(String);
      if (a.levels) s.levels = a.levels.filter((l): l is Level => l === 1 || l === 2 || l === 3);
      if (a.custom) s.custom = a.custom.slice(0, 500).filter((q) => q.q && q.a);
      if (a.element) {
        const e = elById(s, a.element.id);
        if (e) {
          if (a.element.count != null && !e.auto) { const c = clamp(a.element.count, 0, 64); if (c !== e.count) reset = true; e.count = c; }
          if (a.element.points != null) e.points = clamp(a.element.points, -500, 500);
        }
      }
      if (a.resetElements) { s.elements = defaultElements(); reset = true; }
      if (reset) resetLayouts(st);
      return null;
    }
    case 'addTeam': {
      if (!host) return 'للمقدم فقط';
      if (st.phase === 'play') return 'لا يمكن الإضافة أثناء اللعب';
      if (st.teams.length >= MAX_TEAMS) return 'الحد الأقصى ٨ فرق';
      const t = makeTeam(st.teams.length);
      const free = TEAM_COLORS.findIndex((c) => !st.teams.some((x) => x.color === c));
      if (free >= 0) { t.color = TEAM_COLORS[free]; t.name = TEAM_NAMES[free]; }
      if (st.phase === 'end') st.phase = 'setup';
      st.teams.push(t);
      return null;
    }
    case 'removeTeam':
      if (!host) return 'للمقدم فقط';
      if (st.phase === 'play') return 'لا يمكن الحذف أثناء اللعب';
      if (st.teams.length <= 2) return 'يلزم فريقان على الأقل';
      st.teams = st.teams.filter((t) => t.id !== a.teamId);
      return null;
    case 'renameTeam': {
      const t = teamById(st, a.teamId);
      if (!t || !own(t.id)) return 'غير مسموح';
      if (a.name != null) t.name = String(a.name).trim().slice(0, 24) || t.name;
      if (a.color && host && /^#[0-9a-f]{6}$/i.test(a.color)) t.color = a.color;
      return null;
    }
    case 'toSetup':
      if (!host) return 'للمقدم فقط';
      if (counts(s).overflow > 0) return 'مجموع العناصر أكبر من عدد خانات الحصن';
      if (!questionPool(s, bank).some((q) => s.categories.includes(q.c) && s.levels.includes(q.l))) return 'لا توجد أسئلة بهذه الإعدادات';
      st.phase = 'setup';
      return null;
    case 'toLobby':
      if (!host) return 'للمقدم فقط';
      if (st.phase === 'play') return 'أنهِ المعركة أولًا';
      st.phase = 'lobby';
      return null;
    case 'setLayout': {
      const t = teamById(st, a.teamId);
      if (!t || !own(t.id)) return 'غير مسموح';
      if (st.phase !== 'setup' && st.phase !== 'lobby') return 'التوزيع مقفل بعد بدء المعركة';
      if (a.layout === null) { t.layout = null; t.ready = false; return null; }
      if (!validLayout(s, a.layout)) return 'التوزيع غير مكتمل';
      t.layout = a.layout.slice();
      if (a.ready != null) t.ready = a.ready;
      return null;
    }
    case 'randomLayout': {
      const t = teamById(st, a.teamId);
      if (!t || !own(t.id)) return 'غير مسموح';
      if (st.phase === 'play' || st.phase === 'end') return 'التوزيع مقفل بعد بدء المعركة';
      t.layout = randomLayout(s);
      return null;
    }
    case 'setReady': {
      const t = teamById(st, a.teamId);
      if (!t || !own(t.id)) return 'غير مسموح';
      if (st.phase === 'play' || st.phase === 'end') return 'التوزيع مقفل بعد بدء المعركة';
      if (a.ready && !validLayout(s, t.layout)) return 'أكمل توزيع الحصن أولًا';
      t.ready = a.ready;
      return null;
    }
    case 'start':
      if (!host) return 'للمقدم فقط';
      if (st.phase !== 'setup') return 'وزّعوا الحصون أولًا';
      for (const t of st.teams) {
        if (!validLayout(s, t.layout)) t.layout = randomLayout(s);
        Object.assign(t, { ready: true, score: 0, hits: {}, kingDown: false });
      }
      Object.assign(st, { phase: 'play', turn: 0, round: 1, current: null, lastStrike: null, log: [] });
      log(st, 'بدأت المعركة!');
      return null;
    case 'question': {
      if (!host) return 'للمقدم فقط';
      if (st.phase !== 'play') return 'المعركة لم تبدأ';
      if (cur && cur.stage !== 'none' && cur.stage !== 'result') return 'أكمل السؤال الحالي أولًا';
      const q = pickQuestion(st, bank, a.level ?? 0);
      if (!q) return 'لا توجد أسئلة بهذا المستوى';
      st.current = { q, stage: 'question', startedAt: Date.now(), turnTeam: st.teams[st.turn].id, attacker: null, extra: 0 };
      return null;
    }
    case 'reveal':
      if (!host || !cur || cur.stage !== 'question') return 'غير مسموح';
      cur.stage = 'answer';
      return null;
    case 'judge': {
      if (!host || !cur || (cur.stage !== 'question' && cur.stage !== 'answer')) return 'غير مسموح';
      if (a.teamId) {
        const t = teamById(st, a.teamId);
        if (!t) return 'فريق غير موجود';
        if (!remainingTargets(st, t.id).length) { cur.stage = 'none'; return null; }
        cur.attacker = t.id;
        cur.stage = 'aim';
        log(st, `${t.name} أجاب إجابة صحيحة`);
      } else {
        cur.stage = 'none';
        log(st, 'لم يُجب أحد');
      }
      return null;
    }
    case 'strike': {
      if (!cur || cur.stage !== 'aim' || !cur.attacker) return 'ليس وقت الضربة';
      if (!own(cur.attacker)) return 'ليس دوركم';
      const target = teamById(st, a.target);
      const att = teamById(st, cur.attacker)!;
      if (!target || target.id === att.id) return 'هدف غير صالح';
      const cell = Math.floor(a.cell);
      if (!(cell >= 0 && cell < cellCount(s))) return 'رقم غير صالح';
      if (target.hits[cell]) return 'هذه الخانة مضروبة مسبقًا';
      const el = elById(s, target.layout?.[cell]) ?? { id: 'empty', name: 'فراغ', points: 0, count: 0 };
      const mult = s.levelMultiplier ? LEVEL_MULT[cur.q.l] : 1;
      const points = Math.round(el.points * mult);
      target.hits[cell] = att.id;
      att.score += points;
      if (el.effect === 'king') target.kingDown = true;
      const extra = el.effect === 'extra' && remainingTargets(st, att.id).length > 0;
      st.lastStrike = { id: randomId(8), at: Date.now(), attacker: att.id, target: target.id, cell, el: el.id, points, mult, extra };
      cur.stage = 'result';
      cur.extra = extra ? 1 : 0;
      log(st, `${att.name} ضرب ${target.name} في الخانة ${cell + 1}: ${el.name} (${points > 0 ? '+' : ''}${points})`);
      return null;
    }
    case 'extraShot':
      if (!host || !cur || cur.stage !== 'result' || !cur.extra) return 'غير مسموح';
      cur.extra = 0;
      cur.stage = 'aim';
      return null;
    case 'next': {
      if (!host) return 'للمقدم فقط';
      if (st.phase !== 'play') return null;
      st.current = null;
      st.turn++;
      if (st.turn >= st.teams.length) { st.turn = 0; st.round++; }
      if (st.round > s.rounds || st.teams.every((t) => !remainingTargets(st, t.id).length)) {
        st.phase = 'end';
        st.round = Math.min(st.round, s.rounds);
        log(st, 'انتهت المعركة');
      }
      return null;
    }
    case 'adjustScore': {
      if (!host) return 'للمقدم فقط';
      const t = teamById(st, a.teamId);
      if (!t) return 'فريق غير موجود';
      t.score += clamp(a.delta, -1000, 1000);
      log(st, `تعديل نقاط ${t.name}: ${a.delta > 0 ? '+' : ''}${a.delta}`);
      return null;
    }
    case 'end':
      if (!host) return 'للمقدم فقط';
      st.phase = 'end';
      st.current = null;
      return null;
    case 'restart':
      if (!host) return 'للمقدم فقط';
      for (const t of st.teams) Object.assign(t, { layout: null, ready: false, score: 0, hits: {}, kingDown: false });
      Object.assign(st, { phase: 'setup', current: null, lastStrike: null, turn: 0, round: 1, log: [] });
      return null;
  }
  return 'حركة غير معروفة';
}

/** ما يراه كل طرف: الفريق لا يرى توزيع الخصوم إلا الخانات المضروبة، ولا رموز الدخول، ولا الإجابة قبل كشفها */
export function viewFor(st: GameState, actor: Actor): GameState {
  const v: GameState = structuredClone(st);
  v.usedQ = [];
  if (actor.role === 'host') return v;
  for (const t of v.teams) {
    delete t.joinCode;
    if (t.id !== actor.teamId && v.phase !== 'end' && t.layout) {
      t.layout = t.layout.map((x, i) => (t.hits[i] ? x : null));
    }
  }
  if (v.current && v.current.stage === 'question') v.current.q.a = null;
  v.settings.custom = [];
  return v;
}
