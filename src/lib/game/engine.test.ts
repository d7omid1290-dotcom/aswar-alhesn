import { describe, expect, it } from 'vitest';
import { apply, counts, createState, randomLayout, validLayout, viewFor } from './engine';
import { QUESTIONS } from './questions';
import type { Action, Actor, GameState } from './types';

const host: Actor = { role: 'host' };
const run = (st: GameState, a: Action, who: Actor = host) => apply(st, a, who, QUESTIONS);

function started() {
  const st = createState();
  expect(run(st, { type: 'toSetup' })).toBeNull();
  for (const t of st.teams) run(st, { type: 'setLayout', teamId: t.id, layout: randomLayout(st.settings), ready: true });
  expect(run(st, { type: 'start' })).toBeNull();
  return st;
}

describe('الحصن', () => {
  it('يحسب الفراغ تلقائيًا', () => {
    const s = createState().settings;
    expect(counts(s).byId.empty).toBe(25 - 12);
    expect(validLayout(s, randomLayout(s))).toBe(true);
  });

  it('يرفض توزيعًا ناقصًا', () => {
    const st = createState();
    run(st, { type: 'toSetup' });
    expect(run(st, { type: 'setLayout', teamId: st.teams[0].id, layout: Array(25).fill('king') })).toBe('التوزيع غير مكتمل');
  });
});

describe('الصلاحيات والسرية', () => {
  it('الفريق لا يرى توزيع خصمه ولا رموز الدخول ولا الإجابة', () => {
    const st = started();
    run(st, { type: 'question' });
    const [a, b] = st.teams;
    const v = viewFor(st, { role: 'team', teamId: a.id });
    expect(v.teams.find((t) => t.id === b.id)!.layout!.every((x) => x === null)).toBe(true);
    expect(v.teams.find((t) => t.id === a.id)!.layout!.every((x) => x !== null)).toBe(true);
    expect(v.teams.some((t) => t.joinCode)).toBe(false);
    expect(v.current!.q.a).toBeNull();
  });

  it('الفريق لا يستطيع تعديل فريق آخر أو احتساب نقاط', () => {
    const st = started();
    const [a, b] = st.teams;
    const asA: Actor = { role: 'team', teamId: a.id };
    expect(run(st, { type: 'adjustScore', teamId: a.id, delta: 100 }, asA)).toBe('للمقدم فقط');
    expect(run(st, { type: 'renameTeam', teamId: b.id, name: 'x' }, asA)).toBe('غير مسموح');
    expect(run(st, { type: 'judge', teamId: a.id }, asA)).toBe('غير مسموح');
  });

  it('الضربة فقط من الفريق المهاجم وفي وقتها', () => {
    const st = started();
    const [a, b] = st.teams;
    expect(run(st, { type: 'strike', target: b.id, cell: 0 }, { role: 'team', teamId: a.id })).toBe('ليس وقت الضربة');
    run(st, { type: 'question' });
    run(st, { type: 'judge', teamId: a.id });
    expect(run(st, { type: 'strike', target: a.id, cell: 0 }, { role: 'team', teamId: b.id })).toBe('ليس دوركم');
    expect(run(st, { type: 'strike', target: a.id, cell: 0 }, { role: 'team', teamId: a.id })).toBe('هدف غير صالح');
    expect(run(st, { type: 'strike', target: b.id, cell: 3 }, { role: 'team', teamId: a.id })).toBeNull();
    const el = st.settings.elements.find((e) => e.id === b.layout![3])!;
    expect(a.score).toBe(el.points);
    expect(b.hits[3]).toBe(a.id);
  });
});

describe('سير المعركة', () => {
  it('المدفعية تمنح ضربة إضافية والملك يسقط', () => {
    const st = started();
    const [a, b] = st.teams;
    const cannon = b.layout!.indexOf('cannon'), king = b.layout!.indexOf('king');
    run(st, { type: 'question' });
    run(st, { type: 'judge', teamId: a.id });
    run(st, { type: 'strike', target: b.id, cell: cannon });
    expect(st.current!.extra).toBe(1);
    expect(run(st, { type: 'extraShot' })).toBeNull();
    run(st, { type: 'strike', target: b.id, cell: king });
    expect(b.kingDown).toBe(true);
    expect(a.score).toBe(25 + 50);
    expect(run(st, { type: 'strike', target: b.id, cell: king })).toBe('ليس وقت الضربة');
  });

  it('تنتهي المعركة بعد عدد الجولات', () => {
    const st = started();
    run(st, { type: 'settings', rounds: 1 });
    expect(st.settings.rounds).toBe(5); // الإعدادات مقفلة أثناء اللعب
    for (let i = 0; i < 5 * 2; i++) run(st, { type: 'next' });
    expect(st.phase).toBe('end');
  });
});
