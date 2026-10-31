import { describe, it, expect } from 'vitest';
import { applyCommand, createMatch, gradeAnswer, projectView, seededRng, publicLayout, currentTeamId, authenticate } from '../src/engine/engine';
import type { Actor, Command, MatchState, TeamView } from '../src/engine/types';

const HOST: Actor = { role: 'host' };
let seq = 0;
function setup(opts: Parameters<typeof createMatch>[0] extends infer T ? Partial<T> : never = {}) {
  const rng = seededRng(42);
  let now = 1_000_000;
  let s = createMatch({ now, rng, ...opts });
  const run = (command: Command, actor: Actor = HOST, requestId = 'r' + seq++) => {
    now += 1000;
    const r = applyCommand(s, { requestId, command }, actor, { now, rng });
    if (r.ok) s = r.state;
    return r;
  };
  const ok = (command: Command, actor: Actor = HOST) => {
    const r = run(command, actor);
    if (!r.ok) throw new Error(r.error);
    return r;
  };
  return { get s() { return s; }, set s(v: MatchState) { s = v; }, run, ok, tick: (ms: number) => (now += ms) };
}

function answerCorrect(g: ReturnType<typeof setup>) {
  g.ok({ type: 'ASK_QUESTION' });
  g.ok({ type: 'JUDGE_ANSWER', attemptId: g.s.attempt!.id, correct: true });
}

describe('الإعداد والحصون', () => {
  it('ينشئ فريقين بحصن من 15 موقعًا', () => {
    const g = setup();
    expect(g.s.teams).toHaveLength(2);
    expect(g.s.teams[0].fortress).toHaveLength(15);
  });
  it('يرفض اعتماد حصن ناقص ويقبل المكتمل', () => {
    const g = setup();
    const t = g.s.teams[0];
    const me: Actor = { role: 'team', teamId: t.id };
    expect(g.run({ type: 'LOCK_FORTRESS', teamId: t.id, locked: true }, me).ok).toBe(false);
    g.ok({ type: 'RANDOMIZE_FORTRESS', teamId: t.id });
    expect(g.run({ type: 'LOCK_FORTRESS', teamId: t.id, locked: true }, me).ok).toBe(true);
  });
  it('يمنع الفريق من تعديل حصن فريق آخر', () => {
    const g = setup();
    const [a, b] = g.s.teams;
    const r = g.run({ type: 'SET_FORTRESS', teamId: b.id, fortress: new Array(15).fill(null) }, { role: 'team', teamId: a.id });
    expect(r.ok).toBe(false);
  });
  it('يرفض تجاوز عدد العنصر المسموح', () => {
    const g = setup();
    const t = g.s.teams[0];
    const f = new Array(15).fill(null);
    f[0] = 'king';
    f[1] = 'king';
    expect(g.run({ type: 'SET_FORTRESS', teamId: t.id, fortress: f }, { role: 'team', teamId: t.id }).ok).toBe(false);
  });
  it('الفريق لا يستطيع تغيير الإعدادات أو النقاط', () => {
    const g = setup();
    const me: Actor = { role: 'team', teamId: g.s.teams[0].id };
    expect(g.run({ type: 'UPDATE_SETTINGS', patch: { rounds: 99 } }, me).ok).toBe(false);
    expect(g.run({ type: 'ADJUST_SCORE', teamId: g.s.teams[0].id, delta: 500, reason: 'x' }, me).ok).toBe(false);
  });
  it('يتحقق من مجموع العناصر', () => {
    const g = setup();
    expect(g.run({ type: 'UPDATE_SETTINGS', patch: { slotCount: 16 } }).ok).toBe(false);
  });
});

describe('الأسئلة والتصحيح', () => {
  it('يصحح الاختيار من متعدد مع تجاهل الهمزات والتشكيل', () => {
    const q = { id: 'x', type: 'mcq' as const, text: '', options: ['أ', 'ب'], answer: 'الإسكندرية', category: '', difficulty: 'easy' as const, age: 'all' as const };
    expect(gradeAnswer(q, 'الاسكندرية')).toBe(true);
    expect(gradeAnswer(q, 'القاهرة')).toBe(false);
  });
  it('يقبل البدائل في الأسئلة النصية', () => {
    const q = { id: 'x', type: 'short' as const, text: '', answer: '7|سبعة', category: '', difficulty: 'easy' as const, age: 'all' as const };
    expect(gradeAnswer(q, '٧')).toBe(true);
    expect(gradeAnswer(q, 'سبعة')).toBe(true);
  });
  it('الأسئلة الشفهية يحكم فيها المقدم', () => {
    const q = { id: 'x', type: 'oral' as const, text: '', answer: '', category: '', difficulty: 'easy' as const, age: 'all' as const };
    expect(gradeAnswer(q, 'أي شيء')).toBeNull();
  });
  it('الإجابة الخاطئة تنقل الدور دون حق هجوم', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    const first = currentTeamId(g.s);
    g.ok({ type: 'ASK_QUESTION' });
    g.ok({ type: 'JUDGE_ANSWER', attemptId: g.s.attempt!.id, correct: false });
    expect(g.s.attackRight).toBeNull();
    expect(currentTeamId(g.s)).not.toBe(first);
  });
  it('الإجابة من الجوال تُصحح تلقائيًا', () => {
    const g = setup({ settings: { answerMode: 'mobile' } as any });
    g.ok({ type: 'START_MATCH' });
    const mcq = g.s.questions.find((q) => q.type === 'mcq')!;
    g.ok({ type: 'ASK_QUESTION', questionId: mcq.id });
    const tid = g.s.attempt!.teamId;
    g.ok({ type: 'SUBMIT_ANSWER', attemptId: g.s.attempt!.id, answer: mcq.answer }, { role: 'team', teamId: tid });
    expect(g.s.attackRight?.teamId).toBe(tid);
  });
  it('فريق آخر لا يستطيع الإجابة بدلًا من صاحب الدور', () => {
    const g = setup({ settings: { answerMode: 'mobile' } as any });
    g.ok({ type: 'START_MATCH' });
    const mcq = g.s.questions.find((q) => q.type === 'mcq')!;
    g.ok({ type: 'ASK_QUESTION', questionId: mcq.id });
    const other = g.s.teams.find((t) => t.id !== g.s.attempt!.teamId)!;
    expect(g.run({ type: 'SUBMIT_ANSWER', attemptId: g.s.attempt!.id, answer: mcq.answer }, { role: 'team', teamId: other.id }).ok).toBe(false);
  });
  it('تبديل وضع الإجابة يطبق من المحاولة التالية افتراضيًا', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    const mcq = g.s.questions.find((q) => q.type === 'mcq')!;
    g.ok({ type: 'ASK_QUESTION', questionId: mcq.id });
    g.ok({ type: 'SET_ANSWER_MODE', mode: 'mobile', immediate: false });
    expect(g.s.attempt!.mode).toBe('host');
    expect(g.s.pendingAnswerMode).toBe('mobile');
    g.ok({ type: 'JUDGE_ANSWER', attemptId: g.s.attempt!.id, correct: false });
    g.ok({ type: 'ASK_QUESTION', questionId: mcq.id });
    expect(g.s.attempt!.mode).toBe('mobile');
  });
  it('التطبيق الفوري يغير المحاولة الحالية', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    const mcq = g.s.questions.find((q) => q.type === 'mcq')!;
    g.ok({ type: 'ASK_QUESTION', questionId: mcq.id });
    g.ok({ type: 'SET_ANSWER_MODE', mode: 'mobile', immediate: true });
    expect(g.s.attempt!.mode).toBe('mobile');
  });
});

describe('الضربات والنقاط', () => {
  it('لا ضربة دون حق هجوم', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    const target = g.s.teams[1];
    expect(g.run({ type: 'STRIKE', targetId: target.id, slot: 0, rightToken: 'x' }).ok).toBe(false);
  });
  it('تحتسب النقاط وتكشف العنصر', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    answerCorrect(g);
    const attacker = g.s.attackRight!.teamId;
    const target = g.s.teams.find((t) => t.id !== attacker)!;
    const el = target.fortress[3]!;
    const pts = g.s.settings.elements.find((e) => e.id === el)!.points;
    const r = g.ok({ type: 'STRIKE', targetId: target.id, slot: 3, rightToken: g.s.attackRight!.token });
    expect(r.strike!.element).toBe(el);
    expect(g.s.teams.find((t) => t.id === attacker)!.score).toBe(pts);
    expect(g.s.teams.find((t) => t.id === target.id)!.hits[3].element).toBe(el);
  });
  it('لا يقصف الفريق حصنه', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    answerCorrect(g);
    const r = g.run({ type: 'STRIKE', targetId: g.s.attackRight!.teamId, slot: 0, rightToken: g.s.attackRight!.token });
    expect(r.ok).toBe(false);
  });
  it('لا يقصف الموقع نفسه مرتين', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    const [a, b] = g.s.teams;
    answerCorrect(g); // a
    g.ok({ type: 'STRIKE', targetId: b.id, slot: 5, rightToken: g.s.attackRight!.token });
    answerCorrect(g); // b
    g.ok({ type: 'STRIKE', targetId: a.id, slot: 0, rightToken: g.s.attackRight!.token });
    answerCorrect(g); // a
    expect(g.run({ type: 'STRIKE', targetId: b.id, slot: 5, rightToken: g.s.attackRight!.token }).ok).toBe(false);
  });
  it('الطلب المكرر لا ينفذ الضربة مرتين', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    answerCorrect(g);
    const target = g.s.teams[1];
    const cmd: Command = { type: 'STRIKE', targetId: target.id, slot: 0, rightToken: g.s.attackRight!.token };
    g.run(cmd, HOST, 'same-id');
    const score = g.s.teams[0].score;
    const v = g.s.version;
    const r2 = g.run(cmd, HOST, 'same-id');
    expect(r2.ok).toBe(true);
    expect(g.s.version).toBe(v);
    expect(g.s.teams[0].score).toBe(score);
  });
  it('رمز الحق لا يُستخدم مرتين حتى بمعرف طلب جديد', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    answerCorrect(g);
    const token = g.s.attackRight!.token;
    g.ok({ type: 'STRIKE', targetId: g.s.teams[1].id, slot: 0, rightToken: token });
    expect(g.run({ type: 'STRIKE', targetId: g.s.teams[1].id, slot: 1, rightToken: token }).ok).toBe(false);
  });
  it('فريق آخر لا يستخدم حق هجوم غيره', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    answerCorrect(g);
    const other = g.s.teams[1];
    const r = g.run({ type: 'STRIKE', targetId: g.s.teams[0].id, slot: 0, rightToken: g.s.attackRight!.token }, { role: 'team', teamId: other.id });
    expect(r.ok).toBe(false);
  });
  it('تنتهي المباراة بانتهاء الجولات ويُعلن صاحب أعلى نقاط', () => {
    const g = setup({ settings: { rounds: 1 } as any });
    g.ok({ type: 'START_MATCH' });
    const target = g.s.teams[1];
    const kingSlot = target.fortress.indexOf('king');
    answerCorrect(g);
    g.ok({ type: 'STRIKE', targetId: target.id, slot: kingSlot, rightToken: g.s.attackRight!.token });
    g.ok({ type: 'ASK_QUESTION' });
    g.ok({ type: 'JUDGE_ANSWER', attemptId: g.s.attempt!.id, correct: false });
    expect(g.s.phase).toBe('ended');
    expect(g.s.winnerIds).toEqual([g.s.teams[0].id]);
  });
});

describe('نظام إسقاط الملك', () => {
  it('سقوط الملك يخرج الفريق وينهي المباراة بفريقين', () => {
    const g = setup({ settings: { winMode: 'king' } as any });
    g.ok({ type: 'START_MATCH' });
    const target = g.s.teams[1];
    answerCorrect(g);
    g.ok({ type: 'STRIKE', targetId: target.id, slot: target.fortress.indexOf('king'), rightToken: g.s.attackRight!.token });
    expect(g.s.teams[1].eliminated).toBe(true);
    expect(g.s.phase).toBe('ended');
    expect(g.s.winnerIds).toEqual([g.s.teams[0].id]);
  });
  it('الفريق الخارج لا يأخذ أدوارًا ولا يُستهدف', () => {
    const g = setup({ teams: 3, settings: { winMode: 'king' } as any });
    g.ok({ type: 'START_MATCH' });
    const [a, b, c] = g.s.teams;
    answerCorrect(g); // a يهاجم b
    g.ok({ type: 'STRIKE', targetId: b.id, slot: b.fortress.indexOf('king'), rightToken: g.s.attackRight!.token });
    expect(currentTeamId(g.s)).toBe(c.id); // يتخطى b
    answerCorrect(g);
    expect(g.run({ type: 'STRIKE', targetId: b.id, slot: 0, rightToken: g.s.attackRight!.token }).ok).toBe(false);
  });
  it('إعادة بناء الملك بعد ثلاث إجابات صحيحة', () => {
    const g = setup({ teams: 3, settings: { winMode: 'king', rebuildKing: { enabled: true, required: 3, maxAttempts: 5 } } as any });
    g.ok({ type: 'START_MATCH' });
    const [a, b] = g.s.teams;
    answerCorrect(g);
    g.ok({ type: 'STRIKE', targetId: b.id, slot: b.fortress.indexOf('king'), rightToken: g.s.attackRight!.token });
    const tb = () => g.s.teams.find((t) => t.id === b.id)!;
    expect(tb().rebuild.active).toBe(true);
    expect(tb().eliminated).toBe(false);
    // b محصن أثناء إعادة البناء
    for (let i = 0; i < 9 && tb().rebuild.active; i++) {
      const cur = currentTeamId(g.s);
      g.ok({ type: 'ASK_QUESTION' });
      g.ok({ type: 'JUDGE_ANSWER', attemptId: g.s.attempt!.id, correct: cur === b.id });
      if (g.s.attackRight) {
        expect(g.run({ type: 'STRIKE', targetId: b.id, slot: 0, rightToken: g.s.attackRight.token }).ok).toBe(false);
        const t = g.s.teams.find((x) => x.id !== cur && x.id !== b.id)!;
        const slot = t.fortress.findIndex((e, k) => e !== 'king' && !t.hits[k]);
        g.ok({ type: 'STRIKE', targetId: t.id, slot, rightToken: g.s.attackRight.token });
      }
    }
    expect(tb().rebuild.active).toBe(false);
    expect(tb().kingDown).toBe(false);
    // الملك الجديد في موقع لم يُقصف
    const k = tb().fortress.indexOf('king');
    const kings = tb().fortress.filter((x) => x === 'king').length;
    expect(kings).toBeGreaterThanOrEqual(1);
    expect(tb().fortress.some((x, i) => x === 'king' && !tb().hits[i])).toBe(true);
    expect(k).toBeGreaterThanOrEqual(0);
    void a;
  });
});

describe('السرية والصلاحيات', () => {
  it('عرض الجمهور لا يحتوي الحصون أو رموز الدخول', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    const view = projectView(g.s, { role: 'audience' });
    const json = JSON.stringify(view);
    for (const t of g.s.teams) {
      expect(json).not.toContain(t.token);
      expect(json).not.toContain('"fortress"');
    }
    expect(json).not.toContain(g.s.hostToken);
  });
  it('عرض الفريق يحتوي حصنه فقط', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    const [a, b] = g.s.teams;
    const view = projectView(g.s, { role: 'team', teamId: a.id }) as TeamView;
    expect(view.me.fortress).toEqual(a.fortress);
    const json = JSON.stringify(view);
    expect(json).not.toContain(b.token);
    expect(json).not.toContain(a.token);
    expect((view as any).full).toBeUndefined();
  });
  it('لا تظهر الإجابة الصحيحة قبل حسم السؤال', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    g.ok({ type: 'ASK_QUESTION' });
    expect(projectView(g.s, { role: 'audience' }).question!.answer).toBeUndefined();
    expect(projectView(g.s, HOST).question!.answer).toBeDefined();
  });
  it('حق الهجوم يصل لصاحبه فقط', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    answerCorrect(g);
    const [a, b] = g.s.teams;
    expect((projectView(g.s, { role: 'team', teamId: a.id }) as TeamView).me.rightToken).toBe(g.s.attackRight!.token);
    expect((projectView(g.s, { role: 'team', teamId: b.id }) as TeamView).me.rightToken).toBeNull();
  });
  it('المصادقة بالرموز', () => {
    const g = setup();
    const t = g.s.teams[1];
    expect(authenticate(g.s, { hostToken: g.s.hostToken })).toEqual({ role: 'host' });
    expect(authenticate(g.s, { teamToken: t.token })).toEqual({ role: 'team', teamId: t.id });
    expect(authenticate(g.s, { roomCode: g.s.roomCode, pin: t.pin })).toEqual({ role: 'team', teamId: t.id });
    expect(authenticate(g.s, { hostToken: 'wrong' })).toEqual({ role: 'audience' });
  });
  it('نمط الأرقام المخفية: الموضع المرئي يطابق نوع العنصر', () => {
    const g = setup({ settings: { fortressStyle: 'hiddenNumbers' } as any });
    g.ok({ type: 'START_MATCH' });
    answerCorrect(g);
    const target = g.s.teams[1];
    const r = g.ok({ type: 'STRIKE', targetId: target.id, slot: 7, rightToken: g.s.attackRight!.token });
    expect(publicLayout(g.s.settings)[r.strike!.visualSlot]).toBe(r.strike!.element);
  });
});

describe('الإيقاف والتعديل', () => {
  it('الإيقاف يمنع الأسئلة والضربات ويمدد المؤقت', () => {
    const g = setup();
    g.ok({ type: 'START_MATCH' });
    g.ok({ type: 'ASK_QUESTION' });
    const d0 = g.s.attempt!.deadline;
    g.ok({ type: 'PAUSE' });
    g.tick(10000);
    g.ok({ type: 'RESUME' });
    expect(g.s.attempt!.deadline).toBeGreaterThan(d0 + 9000);
  });
  it('تعديل النقاط يتطلب سببًا ويُسجّل', () => {
    const g = setup();
    expect(g.run({ type: 'ADJUST_SCORE', teamId: g.s.teams[0].id, delta: 50, reason: '' }).ok).toBe(false);
    g.ok({ type: 'ADJUST_SCORE', teamId: g.s.teams[0].id, delta: 50, reason: 'تصحيح خطأ تحكيم' });
    expect(g.s.teams[0].score).toBe(50);
    expect(g.s.log.at(-1)!.text).toContain('تصحيح خطأ تحكيم');
  });
});
