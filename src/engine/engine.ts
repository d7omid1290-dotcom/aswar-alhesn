import type {
  Actor, AnyView, Command, ElementDef, EngineResult, Envelope, HostView, Hit, MatchState, PublicTeam,
  PublicView, Question, Settings, StrikeRecord, Team, TeamView, LogEntry,
} from './types';
import { DEFAULT_SETTINGS, TEAM_COLORS, TEAM_NAMES } from './defaults';
import { SEED_QUESTIONS } from './questions';

// ───────────── أدوات ─────────────
export type Rng = () => number;
export const mathRng: Rng = () => Math.random();

export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomId(rng: Rng, len = 10): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[Math.floor(rng() * ALPHA.length)];
  return s;
}
function randomPin(rng: Rng) {
  return String(Math.floor(rng() * 9000) + 1000);
}
function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** توحيد النص العربي للمقارنة: إزالة التشكيل والهمزات والمسافات الزائدة */
export function normalizeArabic(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/^ال/, '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** يصحح إجابة. يعيد null للأسئلة الشفهية التي يحكم فيها المقدم */
export function gradeAnswer(q: Question, answer: string): boolean | null {
  if (q.type === 'oral') return null;
  const given = normalizeArabic(answer);
  if (!given) return false;
  const accepted = q.answer.split('|').map(normalizeArabic);
  if (q.type === 'tf') {
    const truthy = ['صح', 'صحيح', 'true', 'نعم'].map(normalizeArabic);
    const g = truthy.includes(given);
    const a = truthy.includes(accepted[0]);
    return g === a;
  }
  return accepted.includes(given);
}

export function expandElements(defs: ElementDef[]): string[] {
  const out: string[] = [];
  for (const d of defs) for (let i = 0; i < d.count; i++) out.push(d.id);
  return out;
}

export function validateComposition(settings: Settings): string | null {
  const total = settings.elements.reduce((s, e) => s + e.count, 0);
  if (settings.slotCount < 4 || settings.slotCount > 40) return 'عدد المواقع يجب أن يكون بين 4 و40';
  if (total !== settings.slotCount) return `مجموع العناصر (${total}) لا يساوي عدد المواقع (${settings.slotCount})`;
  if (settings.elements.some((e) => e.count < 0)) return 'لا يمكن أن يكون عدد عنصر سالبًا';
  if (settings.winMode === 'king' && !settings.elements.some((e) => e.kind === 'king' && e.count === 1))
    return 'نظام إسقاط الملك يحتاج ملكًا واحدًا بالضبط في كل حصن';
  return null;
}

/** تخطيط مرئي عام لنمط «الأرقام المخفية»: مشتق من الأعداد فقط، فلا يكشف شيئًا */
export function publicLayout(settings: Settings): string[] {
  return shuffle(expandElements(settings.elements), seededRng(settings.slotCount * 7919 + settings.elements.length));
}

function fortressMatches(settings: Settings, f: (string | null)[]): boolean {
  if (f.length !== settings.slotCount || f.some((x) => x == null)) return false;
  const need = new Map(settings.elements.map((e) => [e.id, e.count]));
  for (const id of f) need.set(id!, (need.get(id!) ?? 0) - 1);
  return [...need.values()].every((v) => v === 0);
}

export function randomFortress(settings: Settings, rng: Rng): string[] {
  return shuffle(expandElements(settings.elements), rng);
}

// ───────────── إنشاء المباراة ─────────────
export function createMatch(opts: { now: number; rng?: Rng; teams?: number; settings?: Partial<Settings>; questions?: Question[] }): MatchState {
  const rng = opts.rng ?? mathRng;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...opts.settings };
  const s: MatchState = {
    version: 1,
    roomCode: randomId(rng, 6),
    hostToken: randomId(rng, 24),
    createdAt: opts.now,
    settings,
    pendingAnswerMode: null,
    teams: [],
    phase: 'lobby',
    paused: false,
    pausedAt: null,
    startedAt: null,
    round: 1,
    turnOrder: [],
    turnIndex: 0,
    attempt: null,
    attackRight: null,
    lastStrike: null,
    strikes: [],
    usedQuestions: [],
    questions: opts.questions ?? SEED_QUESTIONS,
    log: [],
    processed: [],
    winnerIds: [],
  };
  const n = opts.teams ?? 2;
  for (let i = 0; i < n; i++) s.teams.push(makeTeam(s, TEAM_NAMES[i % TEAM_NAMES.length], TEAM_COLORS[i % TEAM_COLORS.length], rng));
  return s;
}

function makeTeam(s: MatchState, name: string, color: string, rng: Rng): Team {
  return {
    id: 't' + randomId(rng, 6),
    name,
    color,
    token: randomId(rng, 20),
    pin: randomPin(rng),
    fortress: new Array(s.settings.slotCount).fill(null),
    locked: false,
    hits: {},
    score: 0,
    kingDown: false,
    eliminated: false,
    rebuild: { active: false, progress: 0, attempts: 0 },
  };
}

// ───────────── الاستعلامات ─────────────
export const teamById = (s: MatchState, id: string) => s.teams.find((t) => t.id === id);
export const isOut = (t: Team) => t.eliminated;
export function currentTeamId(s: MatchState): string | null {
  if (s.phase !== 'playing' || s.turnOrder.length === 0) return null;
  return s.turnOrder[s.turnIndex] ?? null;
}
/** الأهداف الصالحة: ليست الفريق نفسه، ولم تخرج، وليست في مرحلة إعادة بناء الملك (محصنة)، ولديها موقع لم يُقصف */
export function validTargets(s: MatchState, attackerId: string): Team[] {
  return s.teams.filter(
    (t) => t.id !== attackerId && !t.eliminated && !t.rebuild.active && Object.keys(t.hits).length < s.settings.slotCount,
  );
}
export function elapsedPlayMs(s: MatchState, now: number) {
  if (!s.startedAt) return 0;
  const end = s.paused && s.pausedAt ? s.pausedAt : now;
  return end - s.startedAt;
}

// ───────────── التطبيق ─────────────
type Ctx = { now: number; rng: Rng };

function log(s: MatchState, ctx: Ctx, type: string, text: string, actor: string, publicVisible = true) {
  const e: LogEntry = { at: ctx.now, type, text, actor, publicVisible };
  s.log.push(e);
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

function fail(error: string): EngineResult {
  return { ok: false, error };
}

const HOST_ONLY: Command['type'][] = [
  'UPDATE_SETTINGS', 'ADD_TEAM', 'EDIT_TEAM', 'REMOVE_TEAM', 'RANDOMIZE_FORTRESS', 'START_MATCH', 'JUDGE_ANSWER',
  'SKIP_TURN', 'PAUSE', 'RESUME', 'ADJUST_SCORE', 'SET_ANSWER_MODE', 'SET_QUESTIONS', 'END_MATCH', 'RESET_TO_LOBBY',
];

export function applyCommand(prev: MatchState, env: Envelope, actor: Actor, ctx: Ctx): EngineResult {
  if (!env || typeof env.requestId !== 'string' || !env.command) return fail('طلب غير صالح');
  if (prev.processed.includes(env.requestId)) return { ok: true, state: prev }; // طلب مكرر: لا ينفذ مرتين
  const cmd = env.command;
  if (actor.role === 'audience') return fail('شاشة الجمهور للعرض فقط');
  if (HOST_ONLY.includes(cmd.type) && actor.role !== 'host') return fail('هذا الإجراء للمقدم فقط');

  const s: MatchState = structuredClone(prev);
  const r = run(s, cmd, actor, ctx);
  if (r && !r.ok) return r;
  if (cmd.type !== 'HEARTBEAT') {
    s.processed.push(env.requestId);
    if (s.processed.length > 300) s.processed.splice(0, s.processed.length - 300);
  }
  checkTimeLimit(s, ctx);
  s.version = prev.version + 1;
  return { ok: true, state: s, strike: r && r.ok ? r.strike : undefined };
}

function run(s: MatchState, cmd: Command, actor: Actor, ctx: Ctx): EngineResult | void {
  const who = actor.role === 'host' ? 'host' : actor.role === 'team' ? actor.teamId : 'audience';
  switch (cmd.type) {
    case 'UPDATE_SETTINGS': {
      const p = { ...cmd.patch };
      if (s.phase === 'playing') {
        for (const k of ['slotCount', 'elements', 'fortressStyle', 'winMode'] as const)
          if (k in p) return fail('لا يمكن تغيير تركيبة الحصون أو نظام الفوز أثناء المباراة');
      }
      const next = { ...s.settings, ...p };
      if (p.rebuildKing) next.rebuildKing = { ...s.settings.rebuildKing, ...p.rebuildKing };
      next.rounds = clampInt(next.rounds, 1, 50);
      next.questionSeconds = clampInt(next.questionSeconds, 5, 600);
      next.matchMinutes = clampInt(next.matchMinutes, 0, 600);
      next.volume = Math.max(0, Math.min(1, Number(next.volume) || 0));
      if ('slotCount' in p || 'elements' in p) {
        const err = validateComposition(next);
        if (err) return fail(err);
        for (const t of s.teams) {
          t.fortress = new Array(next.slotCount).fill(null);
          t.locked = false;
        }
      } else if ('winMode' in p) {
        const err = validateComposition(next);
        if (err) return fail(err);
      }
      s.settings = next;
      log(s, ctx, 'settings', 'عُدّلت إعدادات المباراة', who, false);
      return;
    }
    case 'ADD_TEAM': {
      if (s.phase !== 'lobby') return fail('أضف الفرق قبل بدء المباراة');
      if (s.teams.length >= 8) return fail('الحد الأقصى ثمانية فرق');
      const t = makeTeam(s, (cmd.name || '').slice(0, 30) || TEAM_NAMES[s.teams.length], cmd.color || TEAM_COLORS[s.teams.length % 8], ctx.rng);
      s.teams.push(t);
      log(s, ctx, 'team', `انضم ${t.name}`, who);
      return;
    }
    case 'EDIT_TEAM': {
      const t = teamById(s, cmd.teamId);
      if (!t) return fail('الفريق غير موجود');
      if (cmd.name != null) t.name = cmd.name.slice(0, 30) || t.name;
      if (cmd.color != null && /^#[0-9a-f]{6}$/i.test(cmd.color)) t.color = cmd.color;
      return;
    }
    case 'REMOVE_TEAM': {
      if (s.phase !== 'lobby') return fail('لا يمكن حذف فريق أثناء المباراة');
      if (s.teams.length <= 2) return fail('يلزم فريقان على الأقل');
      s.teams = s.teams.filter((t) => t.id !== cmd.teamId);
      return;
    }
    case 'SET_FORTRESS': {
      const t = teamById(s, cmd.teamId);
      if (!t) return fail('الفريق غير موجود');
      if (actor.role === 'team') {
        if (actor.teamId !== t.id) return fail('لا يمكنك تعديل حصن فريق آخر');
        if (s.phase !== 'lobby') return fail('لا يمكن تعديل الحصن بعد بدء المباراة');
        if (t.locked) return fail('الحصن معتمد. اطلب من المقدم فك الاعتماد');
      }
      const f = cmd.fortress;
      if (!Array.isArray(f) || f.length !== s.settings.slotCount) return fail('عدد المواقع غير صحيح');
      const ids = new Set(s.settings.elements.map((e) => e.id));
      if (f.some((x) => x != null && !ids.has(x))) return fail('عنصر غير معروف');
      // لا يتجاوز أي عنصر عدده المسموح
      for (const e of s.settings.elements) if (f.filter((x) => x === e.id).length > e.count) return fail(`عدد «${e.name}» أكبر من المسموح`);
      if (s.phase === 'playing') {
        // لا يجوز تغيير موقع قُصف وكُشف
        for (const k of Object.keys(t.hits)) if (f[+k] !== t.fortress[+k]) return fail('لا يمكن تغيير موقع مكشوف');
        if (!fortressMatches(s.settings, f)) return fail('يجب أن يكون الحصن مكتملًا أثناء المباراة');
        log(s, ctx, 'fortress-edit', `عدّل المقدم حصن ${t.name}${cmd.reason ? ': ' + cmd.reason : ''}`, who, false);
      }
      t.fortress = f.slice();
      return;
    }
    case 'RANDOMIZE_FORTRESS': {
      const t = teamById(s, cmd.teamId);
      if (!t) return fail('الفريق غير موجود');
      if (s.phase !== 'lobby') return fail('التوزيع العشوائي قبل المباراة فقط');
      t.fortress = randomFortress(s.settings, ctx.rng);
      return;
    }
    case 'LOCK_FORTRESS': {
      const t = teamById(s, cmd.teamId);
      if (!t) return fail('الفريق غير موجود');
      if (actor.role === 'team' && actor.teamId !== t.id) return fail('لا يمكنك اعتماد حصن فريق آخر');
      if (actor.role === 'team' && !cmd.locked) return fail('فك الاعتماد من صلاحية المقدم');
      if (s.phase !== 'lobby') return fail('المباراة بدأت');
      if (cmd.locked && !fortressMatches(s.settings, t.fortress)) return fail('وزّع كل العناصر قبل الاعتماد');
      t.locked = cmd.locked;
      log(s, ctx, 'lock', cmd.locked ? `اعتمد ${t.name} حصنه` : `فُك اعتماد حصن ${t.name}`, who);
      return;
    }
    case 'START_MATCH': {
      if (s.phase !== 'lobby') return fail('المباراة بدأت بالفعل');
      const err = validateComposition(s.settings);
      if (err) return fail(err);
      if (s.teams.length < 2) return fail('يلزم فريقان على الأقل');
      for (const t of s.teams) {
        if (!fortressMatches(s.settings, t.fortress)) {
          t.fortress = randomFortress(s.settings, ctx.rng);
          log(s, ctx, 'auto-fortress', `وُزّع حصن ${t.name} عشوائيًا`, 'host', false);
        }
        t.locked = true;
        t.hits = {};
        t.score = 0;
        t.kingDown = false;
        t.eliminated = false;
        t.rebuild = { active: false, progress: 0, attempts: 0 };
      }
      s.phase = 'playing';
      s.startedAt = ctx.now;
      s.round = 1;
      s.turnOrder = s.teams.map((t) => t.id);
      s.turnIndex = 0;
      s.attempt = null;
      s.attackRight = null;
      s.strikes = [];
      s.lastStrike = null;
      s.winnerIds = [];
      log(s, ctx, 'start', 'بدأت المباراة', who);
      return;
    }
    case 'ASK_QUESTION': {
      if (s.phase !== 'playing') return fail('المباراة لم تبدأ');
      if (s.paused) return fail('المباراة متوقفة');
      if (s.attackRight) return fail('بانتظار تنفيذ الضربة');
      if (s.attempt && !s.attempt.result) return fail('هناك سؤال قائم');
      const tid = currentTeamId(s)!;
      if (actor.role === 'team' && actor.teamId !== tid) return fail('ليس دورك');
      if (actor.role === 'team' && s.settings.opMode === 'host') return fail('المقدم يدير الأسئلة');
      if (s.pendingAnswerMode) {
        s.settings.answerMode = s.pendingAnswerMode;
        s.pendingAnswerMode = null;
      }
      const q = cmd.questionId && actor.role === 'host' ? s.questions.find((x) => x.id === cmd.questionId) : pickQuestion(s, ctx.rng);
      if (!q) return fail('لا توجد أسئلة مطابقة في البنك');
      if (!s.usedQuestions.includes(q.id)) s.usedQuestions.push(q.id);
      const team = teamById(s, tid)!;
      s.attempt = {
        id: randomId(ctx.rng, 8),
        teamId: tid,
        questionId: q.id,
        mode: q.type === 'oral' ? 'host' : s.settings.answerMode,
        startedAt: ctx.now,
        deadline: ctx.now + s.settings.questionSeconds * 1000,
        purpose: team.rebuild.active ? 'rebuild' : 'attack',
      };
      log(s, ctx, 'question', `سؤال إلى ${team.name}`, who);
      return;
    }
    case 'SUBMIT_ANSWER': {
      const a = s.attempt;
      if (!a || a.id !== cmd.attemptId || a.result) return fail('لا يوجد سؤال قائم بهذا المعرف');
      if (actor.role !== 'team' || actor.teamId !== a.teamId) return fail('ليس سؤال فريقك');
      if (s.paused) return fail('المباراة متوقفة');
      if (a.mode !== 'mobile') return fail('الإجابة عبر المقدم في هذا السؤال');
      if (a.submitted) return fail('أُرسلت الإجابة مسبقًا');
      if (ctx.now > a.deadline + 1500) return fail('انتهى الوقت');
      const q = s.questions.find((x) => x.id === a.questionId)!;
      const correct = gradeAnswer(q, String(cmd.answer ?? '').slice(0, 200));
      a.submitted = { answer: String(cmd.answer).slice(0, 200), at: ctx.now, correct };
      if (correct !== null) return resolveAttempt(s, correct ? 'correct' : 'wrong', ctx, who);
      return;
    }
    case 'JUDGE_ANSWER': {
      const a = s.attempt;
      if (!a || a.id !== cmd.attemptId || a.result) return fail('لا يوجد سؤال قائم');
      return resolveAttempt(s, cmd.correct ? 'correct' : 'wrong', ctx, who);
    }
    case 'TIMEOUT': {
      const a = s.attempt;
      if (!a || a.id !== cmd.attemptId || a.result) return fail('لا يوجد سؤال قائم');
      if (s.paused) return fail('المباراة متوقفة');
      if (actor.role === 'team' && actor.teamId !== a.teamId) return fail('غير مسموح');
      if (ctx.now < a.deadline) return fail('لم ينته الوقت بعد');
      return resolveAttempt(s, 'timeout', ctx, who);
    }
    case 'STRIKE':
      return strike(s, cmd, actor, ctx, who);
    case 'SKIP_TURN': {
      if (s.phase !== 'playing') return fail('المباراة لم تبدأ');
      if (s.attempt && !s.attempt.result) s.attempt.result = 'wrong';
      s.attackRight = null;
      log(s, ctx, 'skip', 'تخطّى المقدم الدور', who);
      advanceTurn(s, ctx);
      return;
    }
    case 'PAUSE': {
      if (s.phase !== 'playing' || s.paused) return fail('لا يمكن الإيقاف الآن');
      s.paused = true;
      s.pausedAt = ctx.now;
      log(s, ctx, 'pause', 'أُوقفت المباراة مؤقتًا', who);
      return;
    }
    case 'RESUME': {
      if (!s.paused) return fail('المباراة ليست متوقفة');
      const d = ctx.now - (s.pausedAt ?? ctx.now);
      if (s.startedAt) s.startedAt += d;
      if (s.attempt && !s.attempt.result) s.attempt.deadline += d;
      s.paused = false;
      s.pausedAt = null;
      log(s, ctx, 'resume', 'استؤنفت المباراة', who);
      return;
    }
    case 'ADJUST_SCORE': {
      const t = teamById(s, cmd.teamId);
      if (!t) return fail('الفريق غير موجود');
      const reason = (cmd.reason || '').trim();
      if (!reason) return fail('اكتب سبب التعديل');
      const delta = Math.trunc(Number(cmd.delta));
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) return fail('قيمة غير صالحة');
      t.score += delta;
      log(s, ctx, 'adjust', `تعديل نقاط ${t.name} بمقدار ${delta > 0 ? '+' : ''}${delta}: ${reason.slice(0, 120)}`, who);
      return;
    }
    case 'SET_ANSWER_MODE': {
      if (cmd.mode !== 'host' && cmd.mode !== 'mobile') return fail('وضع غير معروف');
      if (cmd.immediate || s.phase !== 'playing' || !s.attempt || s.attempt.result) {
        s.settings.answerMode = cmd.mode;
        s.pendingAnswerMode = null;
        const q = s.attempt && s.questions.find((x) => x.id === s.attempt!.questionId);
        if (s.attempt && !s.attempt.result && q && q.type !== 'oral') s.attempt.mode = cmd.mode;
      } else {
        s.pendingAnswerMode = cmd.mode === s.settings.answerMode ? null : cmd.mode;
      }
      log(s, ctx, 'answer-mode', cmd.mode === 'mobile' ? 'الإجابة من الجوال مفعّلة' : 'الإجابة عبر المقدم', who);
      return;
    }
    case 'SET_QUESTIONS': {
      if (!Array.isArray(cmd.questions) || cmd.questions.length === 0) return fail('البنك فارغ');
      s.questions = cmd.questions.slice(0, 5000).map(sanitizeQuestion).filter(Boolean) as Question[];
      s.usedQuestions = s.usedQuestions.filter((id) => s.questions.some((q) => q.id === id));
      return;
    }
    case 'END_MATCH': {
      if (s.phase !== 'playing') return fail('المباراة ليست جارية');
      endMatch(s, ctx, 'أنهى المقدم المباراة');
      return;
    }
    case 'RESET_TO_LOBBY': {
      s.phase = 'lobby';
      s.paused = false;
      s.attempt = null;
      s.attackRight = null;
      s.lastStrike = null;
      s.strikes = [];
      s.winnerIds = [];
      for (const t of s.teams) {
        t.hits = {};
        t.score = 0;
        t.kingDown = false;
        t.eliminated = false;
        t.locked = false;
        t.rebuild = { active: false, progress: 0, attempts: 0 };
      }
      log(s, ctx, 'reset', 'عادت المباراة إلى الإعداد', who);
      return;
    }
    case 'HEARTBEAT': {
      const t = teamById(s, cmd.teamId);
      if (t && actor.role === 'team' && actor.teamId === t.id) t.connected = true;
      return;
    }
    default:
      return fail('أمر غير معروف');
  }
}

function clampInt(v: unknown, min: number, max: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

export function sanitizeQuestion(q: any): Question | null {
  if (!q || typeof q.text !== 'string' || !q.text.trim()) return null;
  const type = ['mcq', 'tf', 'short', 'oral'].includes(q.type) ? q.type : 'oral';
  const options = type === 'mcq' && Array.isArray(q.options) ? q.options.map(String).filter(Boolean).slice(0, 6) : undefined;
  if (type === 'mcq' && (!options || options.length < 2)) return null;
  return {
    id: String(q.id || 'q' + Math.random().toString(36).slice(2, 9)).slice(0, 40),
    type,
    text: q.text.trim().slice(0, 500),
    options,
    answer: String(q.answer ?? '').slice(0, 300),
    category: String(q.category || 'عام').slice(0, 40),
    difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
    age: ['kids', 'teens', 'adults', 'all'].includes(q.age) ? q.age : 'all',
  };
}

function pickQuestion(s: MatchState, rng: Rng): Question | undefined {
  const st = s.settings;
  const pool = s.questions.filter(
    (q) =>
      (st.categories.length === 0 || st.categories.includes(q.category)) &&
      (st.difficulty === 'any' || q.difficulty === st.difficulty) &&
      (st.ageGroup === 'any' || q.age === 'all' || q.age === st.ageGroup),
  );
  if (pool.length === 0) return undefined;
  let fresh = pool.filter((q) => !s.usedQuestions.includes(q.id));
  if (fresh.length === 0) {
    s.usedQuestions = s.usedQuestions.filter((id) => !pool.some((q) => q.id === id));
    fresh = pool;
  }
  return fresh[Math.floor(rng() * fresh.length)];
}

function resolveAttempt(s: MatchState, result: 'correct' | 'wrong' | 'timeout', ctx: Ctx, who: string): EngineResult | void {
  const a = s.attempt!;
  a.result = result;
  const team = teamById(s, a.teamId)!;
  const correct = result === 'correct';
  log(s, ctx, 'answer', `${team.name}: ${correct ? 'إجابة صحيحة' : result === 'timeout' ? 'انتهى الوقت' : 'إجابة خاطئة'}`, who);

  if (a.purpose === 'rebuild') {
    team.rebuild.attempts++;
    if (correct) team.rebuild.progress++;
    if (team.rebuild.progress >= s.settings.rebuildKing.required) {
      restoreKing(s, team, ctx);
    } else if (team.rebuild.attempts >= s.settings.rebuildKing.maxAttempts) {
      team.rebuild.active = false;
      team.eliminated = true;
      log(s, ctx, 'eliminated', `لم يتمكن ${team.name} من إعادة بناء الملك وخرج من المنافسة`, 'host');
    }
    advanceTurn(s, ctx);
    return;
  }
  if (!correct) {
    advanceTurn(s, ctx);
    return;
  }
  if (validTargets(s, team.id).length === 0) {
    team.score += s.settings.noTargetBonus;
    log(s, ctx, 'bonus', `لا يوجد هدف متاح؛ حصل ${team.name} على ${s.settings.noTargetBonus} نقطة`, 'host');
    advanceTurn(s, ctx);
    return;
  }
  s.attackRight = { teamId: team.id, token: randomId(ctx.rng, 16), grantedAt: ctx.now };
}

function restoreKing(s: MatchState, team: Team, ctx: Ctx) {
  // ينتقل الملك المعاد بناؤه إلى موقع لم يُقصف (يفضل الفارغ) حتى يبقى قابلًا للإسقاط بعدل
  const kingId = s.settings.elements.find((e) => e.kind === 'king')!.id;
  const unhit = team.fortress.map((_, i) => i).filter((i) => !team.hits[i]);
  const emptyIds = new Set(s.settings.elements.filter((e) => e.kind === 'empty').map((e) => e.id));
  const empties = unhit.filter((i) => emptyIds.has(team.fortress[i]!));
  const pool = empties.length ? empties : unhit;
  if (pool.length) {
    const i = pool[Math.floor(ctx.rng() * pool.length)];
    team.fortress[i] = kingId;
  }
  team.kingDown = false;
  team.rebuild = { active: false, progress: 0, attempts: 0 };
  log(s, ctx, 'rebuild', `أعاد ${team.name} بناء برج الملك وعاد إلى المنافسة`, 'host');
}

function strike(s: MatchState, cmd: Extract<Command, { type: 'STRIKE' }>, actor: Actor, ctx: Ctx, who: string): EngineResult {
  if (s.phase !== 'playing') return fail('المباراة ليست جارية');
  if (s.paused) return fail('المباراة متوقفة');
  const right = s.attackRight;
  if (!right) return fail('لا يوجد حق هجوم فعّال');
  if (cmd.rightToken !== right.token) return fail('حق الهجوم غير صالح أو استُخدم');
  if (actor.role === 'team' && actor.teamId !== right.teamId) return fail('حق الهجوم لفريق آخر');
  if (actor.role === 'team' && s.settings.opMode === 'host') return fail('المقدم ينفذ الضربات في هذا الوضع');
  const attacker = teamById(s, right.teamId)!;
  const target = teamById(s, cmd.targetId);
  if (!target) return fail('الحصن غير موجود');
  if (target.id === attacker.id) return fail('لا يمكنك قصف حصنك');
  if (!validTargets(s, attacker.id).some((t) => t.id === target.id)) return fail('هذا الحصن ليس هدفًا متاحًا');
  const slot = Math.trunc(Number(cmd.slot));
  if (!(slot >= 0 && slot < s.settings.slotCount)) return fail('رقم الموقع غير صحيح');
  if (target.hits[slot]) return fail('هذا الموقع قُصف من قبل');

  const elId = target.fortress[slot]!;
  const def = s.settings.elements.find((e) => e.id === elId)!;
  let visualSlot = slot;
  if (s.settings.fortressStyle === 'hiddenNumbers') {
    const layout = publicLayout(s.settings);
    const used = new Set(Object.values(target.hits).map((h) => h.visualSlot));
    visualSlot = layout.findIndex((id, i) => id === elId && !used.has(i));
    if (visualSlot < 0) visualSlot = layout.findIndex((_, i) => !used.has(i));
  }
  const hit: Hit = { element: def.id, kind: def.kind, points: def.points, by: attacker.id, at: ctx.now, visualSlot };
  target.hits[slot] = hit;
  attacker.score += def.points;
  let kingFell = false;
  let eliminated = false;
  if (def.kind === 'king') {
    kingFell = true;
    target.kingDown = true;
    if (s.settings.winMode === 'king') {
      if (s.settings.rebuildKing.enabled) target.rebuild = { active: true, progress: 0, attempts: 0 };
      else {
        target.eliminated = true;
        eliminated = true;
      }
    }
  }
  const rec: StrikeRecord = {
    id: randomId(ctx.rng, 8),
    attacker: attacker.id,
    target: target.id,
    slot,
    visualSlot,
    element: def.id,
    kind: def.kind,
    points: def.points,
    kingFell,
    eliminated,
    at: ctx.now,
  };
  s.strikes.push(rec);
  s.lastStrike = rec;
  s.attackRight = null;
  log(s, ctx, 'strike', `${attacker.name} قصف الموقع ${slot + 1} في ${target.name}: ${def.name}${def.points ? ` (+${def.points})` : ''}`, who);
  if (kingFell) log(s, ctx, 'king', `سقط ملك ${target.name}`, 'host');
  advanceTurn(s, ctx);
  return { ok: true, state: s, strike: rec };
}

function advanceTurn(s: MatchState, ctx: Ctx) {
  if (s.phase !== 'playing') return;
  if (checkKingEnd(s, ctx)) return;
  const n = s.turnOrder.length;
  let idx = s.turnIndex;
  for (let step = 0; step < n; step++) {
    idx++;
    if (idx >= n) {
      idx = 0;
      s.round++;
      if (s.settings.winMode === 'points' && s.round > s.settings.rounds) {
        s.round = s.settings.rounds;
        endMatch(s, ctx, 'انتهت الجولات');
        return;
      }
    }
    const t = teamById(s, s.turnOrder[idx]);
    if (t && !t.eliminated) {
      s.turnIndex = idx;
      return;
    }
  }
  endMatch(s, ctx, 'لم يتبق فرق');
}

function checkKingEnd(s: MatchState, ctx: Ctx): boolean {
  if (s.settings.winMode !== 'king') return false;
  const standing = s.teams.filter((t) => !t.eliminated && !t.kingDown);
  const rebuilding = s.teams.filter((t) => t.rebuild.active);
  if (standing.length <= 1 && rebuilding.length === 0) {
    endMatch(s, ctx, standing.length === 1 ? `بقي ${standing[0].name} وحده` : 'سقطت كل الحصون');
    return true;
  }
  return false;
}

function checkTimeLimit(s: MatchState, ctx: Ctx) {
  if (s.phase !== 'playing' || !s.settings.matchMinutes) return;
  // لا تنتهي المباراة وسط ضربة معلقة أو سؤال قائم
  if (s.attackRight || (s.attempt && !s.attempt.result)) return;
  if (elapsedPlayMs(s, ctx.now) >= s.settings.matchMinutes * 60000) endMatch(s, ctx, 'انتهى وقت المباراة');
}

function endMatch(s: MatchState, ctx: Ctx, reason: string) {
  s.phase = 'ended';
  s.attackRight = null;
  if (s.attempt && !s.attempt.result) s.attempt.result = 'wrong';
  let pool = s.teams;
  if (s.settings.winMode === 'king') {
    const standing = s.teams.filter((t) => !t.eliminated && !t.kingDown);
    if (standing.length) pool = standing;
  }
  const best = Math.max(...pool.map((t) => t.score));
  s.winnerIds = pool.filter((t) => t.score === best).map((t) => t.id);
  log(s, ctx, 'end', `انتهت المباراة: ${reason}`, 'host');
}

// ───────────── العروض حسب الدور ─────────────
function publicTeam(t: Team): PublicTeam {
  return {
    id: t.id, name: t.name, color: t.color, locked: t.locked, hits: t.hits, score: t.score,
    kingDown: t.kingDown, eliminated: t.eliminated, rebuild: t.rebuild, connected: t.connected,
  };
}

export function projectView(s: MatchState, actor: Actor): AnyView {
  const a = s.attempt;
  const q = a ? s.questions.find((x) => x.id === a.questionId) : null;
  const resolved = !!a?.result;
  const isHost = actor.role === 'host';
  const base: PublicView = {
    kind: actor.role === 'host' ? 'host' : actor.role === 'team' ? 'team' : 'audience',
    version: s.version,
    roomCode: s.roomCode,
    settings: s.settings,
    pendingAnswerMode: s.pendingAnswerMode,
    teams: s.teams.map(publicTeam),
    phase: s.phase,
    paused: s.paused,
    startedAt: s.startedAt,
    pausedAt: s.pausedAt,
    round: s.round,
    turnOrder: s.turnOrder,
    turnIndex: s.turnIndex,
    attempt: a
      ? {
          id: a.id, teamId: a.teamId, questionId: a.questionId, mode: a.mode, startedAt: a.startedAt,
          deadline: a.deadline, result: a.result, purpose: a.purpose,
          submitted: a.submitted
            ? { at: a.submitted.at, correct: resolved || isHost ? a.submitted.correct : null, answer: resolved || isHost ? a.submitted.answer : undefined }
            : undefined,
        }
      : null,
    question: q
      ? { id: q.id, type: q.type, text: q.text, options: q.options, category: q.category, difficulty: q.difficulty, answer: resolved || isHost ? q.answer : undefined }
      : null,
    attackTeamId: s.attackRight?.teamId ?? null,
    lastStrike: s.lastStrike,
    strikes: s.strikes,
    log: isHost ? s.log : s.log.filter((l) => l.publicVisible),
    winnerIds: s.winnerIds,
    publicLayout: s.settings.fortressStyle === 'hiddenNumbers' ? publicLayout(s.settings) : null,
    revealed: revealAll(s),
  };
  if (actor.role === 'host') return { ...base, kind: 'host', full: s } as HostView;
  if (actor.role === 'team') {
    const t = teamById(s, actor.teamId);
    if (!t) return base;
    // عند نهاية المباراة تُكشف كل الحصون للجميع
    return {
      ...base,
      kind: 'team',
      me: { id: t.id, fortress: t.fortress, rightToken: s.attackRight?.teamId === t.id ? s.attackRight.token : null },
    } as TeamView;
  }
  return base;
}

/** عند نهاية المباراة: كشف كل الحصون (يُرسل للجميع بعد الانتهاء فقط) */
export function revealAll(s: MatchState): Record<string, (string | null)[]> | null {
  if (s.phase !== 'ended') return null;
  return Object.fromEntries(s.teams.map((t) => [t.id, t.fortress]));
}

export function authenticate(s: MatchState, creds: { hostToken?: string; teamToken?: string; roomCode?: string; pin?: string }): Actor {
  if (creds.hostToken && creds.hostToken === s.hostToken) return { role: 'host' };
  if (creds.teamToken) {
    const t = s.teams.find((x) => x.token === creds.teamToken);
    if (t) return { role: 'team', teamId: t.id };
  }
  if (creds.pin && creds.roomCode === s.roomCode) {
    const t = s.teams.find((x) => x.pin === creds.pin);
    if (t) return { role: 'team', teamId: t.id };
  }
  return { role: 'audience' };
}
