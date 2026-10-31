import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Mode } from '@/net/client';
import type { Command, TeamView } from '@/engine/types';
import { ELEMENT_META } from '@/engine/defaults';
import { randomFortress, mathRng } from '@/engine/engine';
import { FortressEditor } from '../components/FortressEditor';
import { QuestionCard } from '../components/QuestionCard';
import { CastleMark } from '../components/Brand';
import { Toast } from '../components/Toast';
import { Button } from '../kit/button';
import { Input } from '../kit/controls';
import { go, useRoom, useTheme, useToast } from '../hooks';
import { cn, fmtPoints } from '@/lib/utils';
import { Check, ChevronRight, Crosshair, Lock, Swords, Wifi, WifiOff } from 'lucide-react';
import { sound } from '@/lib/sound';

// واجهة الفريق على الجوال: توزيع الحصن، الإجابة، اختيار الهدف
export default function TeamScreen({ room, mode, token, pin }: { room: string; mode: Mode; token?: string; pin?: string }) {
  const info = useMemo(() => ({ mode, roomCode: room, creds: token ? { teamToken: token } : { roomCode: room, pin } }), [room, mode, token, pin]);
  const { view, status, send } = useRoom(info);
  useTheme();
  const toast = useToast();
  const run = async (c: Command) => { const r = await send(c); if (!r.ok) toast.show(r.error); return r.ok; };

  if (!view) return <div className="grid h-dvh place-items-center p-6 text-center text-[var(--ink-soft)]">{status === 'offline' ? 'تعذر الانضمام. تحقق من رمز الغرفة ورمز الفريق.' : 'جارٍ الاتصال بالغرفة…'}</div>;
  if (view.kind !== 'team') {
    return (
      <div className="grid h-dvh place-items-center p-6 text-center">
        <div><p className="mb-4">رمز الفريق غير صحيح.</p><Button onClick={() => go('/')}>رجوع</Button></div>
      </div>
    );
  }
  const v = view as TeamView;
  const me = v.teams.find((t) => t.id === v.me.id)!;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col">
      <Toast msg={toast.msg} />
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b hairline bg-[var(--bg)]/90 px-4 py-3 backdrop-blur">
        <span className="h-9 w-1.5 rounded-full" style={{ background: me.color }} />
        <CastleMark size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{me.name}</div>
          <div className="text-xs text-[var(--ink-soft)]">غرفة <span className="font-mono" dir="ltr">{v.roomCode}</span></div>
        </div>
        <div className="text-left"><div className="text-xs text-[var(--ink-soft)]">النقاط</div><div className="text-xl font-bold tabular">{fmtPoints(me.score)}</div></div>
        {status === 'live' ? <Wifi size={18} className="text-emerald-500" /> : <WifiOff size={18} className="text-[#d0583a]" />}
      </header>
      <main className="flex-1 px-4 py-4">
        {v.phase === 'lobby' && <TeamLobby v={v} run={run} />}
        {v.phase === 'playing' && <TeamPlay v={v} run={run} />}
        {v.phase === 'ended' && <TeamEnded v={v} />}
      </main>
    </div>
  );
}

function TeamLobby({ v, run }: { v: TeamView; run: (c: Command) => Promise<boolean> }) {
  const me = v.teams.find((t) => t.id === v.me.id)!;
  const [draft, setDraft] = useState(v.me.fortress);
  const key = JSON.stringify(v.me.fortress);
  useEffect(() => setDraft(v.me.fortress), [key]);
  const timer = useRef<number>(0);
  const change = (f: (string | null)[]) => {
    setDraft(f);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => run({ type: 'SET_FORTRESS', teamId: me.id, fortress: f }), 250);
  };
  const complete = draft.every(Boolean);
  return (
    <div>
      <h1 className="text-xl font-semibold">وزّع عناصر حصنك سرًا</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ink-soft)]">اختر عنصرًا ثم انقر رقم الموقع، أو اسحبه إليه. الخصوم لا يرون هذا التوزيع.</p>
      <FortressEditor settings={v.settings} fortress={draft} onChange={me.locked ? undefined : change} locked={me.locked} onRandom={() => change(randomFortress(v.settings, mathRng))} />
      <div className="sticky bottom-0 mt-5 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] pb-4 pt-3">
        {me.locked ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500/10 py-4 font-semibold text-emerald-600 dark:text-emerald-400"><Lock size={18} /> الحصن معتمد. بانتظار بدء المباراة</div>
        ) : (
          <Button variant="gold" size="xl" className="w-full" disabled={!complete} onClick={async () => { await run({ type: 'SET_FORTRESS', teamId: me.id, fortress: draft }); if (await run({ type: 'LOCK_FORTRESS', teamId: me.id, locked: true })) sound.play('correct'); }}>
            <Check /> {complete ? 'اعتماد الحصن' : `بقي ${draft.filter((x) => !x).length} مواقع`}
          </Button>
        )}
      </div>
    </div>
  );
}

function TeamPlay({ v, run }: { v: TeamView; run: (c: Command) => Promise<boolean> }) {
  const me = v.teams.find((t) => t.id === v.me.id)!;
  const cur = v.turnOrder[v.turnIndex];
  const curTeam = v.teams.find((t) => t.id === cur);
  const a = v.attempt;
  const mine = a && a.teamId === me.id;
  const [chosen, setChosen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  useEffect(() => { setChosen(null); setText(''); }, [a?.id]);
  useEffect(() => { setTarget(null); setSlot(null); }, [v.me.rightToken]);
  const lastRes = useRef<string | null>(null);
  useEffect(() => {
    if (mine && a?.result && lastRes.current !== a.id) { lastRes.current = a.id; sound.play(a.result === 'correct' ? 'correct' : 'wrong'); navigator.vibrate?.(a.result === 'correct' ? [60, 40, 60] : 200); }
  }, [a?.result]);

  const canAttack = !!v.me.rightToken && v.settings.opMode !== 'host';
  const submit = async (ans: string) => { setChosen(ans); await run({ type: 'SUBMIT_ANSWER', attemptId: a!.id, answer: ans }); };

  if (canAttack) {
    const targets = v.teams.filter((t) => t.id !== me.id && !t.eliminated && !t.rebuild.active);
    const tgt = v.teams.find((t) => t.id === target);
    return (
      <div>
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[var(--accent)]/15 p-4"><Crosshair className="text-[var(--accent)]" /><div><div className="font-semibold">إجابة صحيحة! لك حق الهجوم</div><div className="text-sm text-[var(--ink-soft)]">{tgt ? 'اختر رقم الموقع' : 'اختر حصن الخصم'}</div></div></div>
        {!tgt ? (
          <div className="grid gap-2">
            {targets.map((t) => (
              <button key={t.id} onClick={() => setTarget(t.id)} className="flex items-center gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-solid)] p-4 text-right active:scale-[0.98]">
                <span className="h-10 w-2 rounded-full" style={{ background: t.color }} />
                <span className="flex-1"><span className="block font-semibold">{t.name}</span><span className="text-xs text-[var(--ink-soft)]">{Object.keys(t.hits).length} مواقع مكشوفة · {fmtPoints(t.score)} نقطة</span></span>
                <ChevronRight className="rotate-180 text-[var(--ink-soft)]" />
              </button>
            ))}
          </div>
        ) : (
          <div>
            <button className="mb-3 text-sm text-[var(--ink-soft)]" onClick={() => { setTarget(null); setSlot(null); }}>← تغيير الحصن ({tgt.name})</button>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: v.settings.slotCount }, (_, i) => {
                const h = tgt.hits[i];
                return (
                  <button key={i} disabled={!!h} onClick={() => setSlot(i)}
                    className={cn('grid aspect-square place-items-center rounded-xl border text-lg font-bold tabular transition-transform active:scale-95', slot === i ? 'border-[var(--accent)] bg-[var(--accent)] text-[#1a1408]' : h ? 'border-transparent bg-[var(--line)] opacity-60' : 'border-[var(--panel-border)] bg-[var(--panel-solid)]')}>
                    {h ? <span style={{ color: ELEMENT_META[h.kind].tint }}>{ELEMENT_META[h.kind].glyph}</span> : i + 1}
                  </button>
                );
              })}
            </div>
            <Button variant="gold" size="xl" className="mt-5 w-full" disabled={slot == null} onClick={() => run({ type: 'STRIKE', targetId: tgt.id, slot: slot!, rightToken: v.me.rightToken! })}>
              <Swords /> {slot == null ? 'اختر موقعًا' : `أطلق على الموقع ${slot + 1}`}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-solid)] p-4">
        <div className="text-xs text-[var(--ink-soft)]">{v.settings.winMode === 'points' ? `الجولة ${v.round} من ${v.settings.rounds}` : `الجولة ${v.round}`}</div>
        <div className="text-lg font-semibold">
          {me.eliminated ? 'خرج حصنك من المنافسة' : v.attackTeamId ? `${v.teams.find((t) => t.id === v.attackTeamId)?.name} يختار هدفه` : cur === me.id ? 'دورك الآن' : <>الدور على <span style={{ color: curTeam?.color }}>{curTeam?.name}</span></>}
        </div>
        {me.rebuild.active && <div className="mt-2 text-sm">إعادة بناء برج الملك: {me.rebuild.progress} من {v.settings.rebuildKing.required} (المحاولات {me.rebuild.attempts}/{v.settings.rebuildKing.maxAttempts})</div>}
        {cur === me.id && !a?.id && !v.attackTeamId && v.settings.opMode !== 'host' && (
          <Button variant="gold" size="lg" className="mt-3 w-full" onClick={() => run({ type: 'ASK_QUESTION' })}>اطلب السؤال</Button>
        )}
        {cur === me.id && a && a.result && !v.attackTeamId && v.settings.opMode !== 'host' && a.teamId !== me.id && (
          <Button variant="gold" size="lg" className="mt-3 w-full" onClick={() => run({ type: 'ASK_QUESTION' })}>اطلب السؤال</Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {a && !a.result && (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-solid)] p-4">
            <QuestionCard view={v} onChoose={mine && a.mode === 'mobile' && !a.submitted && v.question?.type !== 'short' ? submit : undefined} chosen={chosen} />
            {mine && a.mode === 'mobile' && v.question?.type === 'short' && !a.submitted && (
              <div className="mt-3 flex gap-2"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب الإجابة" /><Button variant="gold" disabled={!text.trim()} onClick={() => submit(text)}>إرسال</Button></div>
            )}
            {mine && a.mode === 'host' && <p className="mt-3 rounded-xl bg-[var(--line)] p-3 text-center text-sm">أجب شفهيًا، والمقدم يحكم على إجابتك</p>}
            {mine && a.submitted && <p className="mt-3 text-center text-sm text-[var(--ink-soft)]">أُرسلت إجابتك…</p>}
          </motion.div>
        )}
        {a && a.result && a.teamId === me.id && (
          <motion.div key={a.id + 'r'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('rounded-2xl p-4 text-center text-lg font-bold', a.result === 'correct' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-[#d0583a]/15 text-[#d0583a]')}>
            {a.result === 'correct' ? (v.settings.opMode === 'host' ? 'إجابة صحيحة! المقدم ينفذ الضربة' : 'إجابة صحيحة!') : a.result === 'timeout' ? 'انتهى الوقت' : 'إجابة خاطئة'}
            {a.result !== 'correct' && v.question?.answer && <div className="mt-1 text-sm font-normal text-[var(--ink)]">الإجابة الصحيحة: {v.question.answer.split('|')[0]}</div>}
          </motion.div>
        )}
      </AnimatePresence>

      <details className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-solid)] p-4" open={!a || !!a.result}>
        <summary className="cursor-pointer font-semibold">حصنك ({Object.keys(me.hits).length} مواقع أصيبت)</summary>
        <div className="mt-3"><FortressEditor settings={v.settings} fortress={v.me.fortress} locked hits={me.hits} /></div>
      </details>
    </div>
  );
}

function TeamEnded({ v }: { v: TeamView }) {
  const ranked = [...v.teams].sort((a, b) => b.score - a.score);
  const won = v.winnerIds.includes(v.me.id);
  return (
    <div className="text-center">
      <div className="gold-text mt-6 font-display text-5xl">{won ? 'فزتم!' : 'انتهت المباراة'}</div>
      <div className="mt-6 space-y-2 text-right">
        {ranked.map((t, i) => (
          <div key={t.id} className={cn('flex items-center gap-3 rounded-xl px-4 py-3', t.id === v.me.id ? 'bg-[var(--accent)]/15' : 'bg-[var(--line)]')}>
            <span className="w-5 font-bold text-[var(--ink-soft)]">{i + 1}</span><span className="h-3 w-3 rounded-full" style={{ background: t.color }} /><span className="flex-1">{t.name}</span><span className="font-bold tabular">{fmtPoints(t.score)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
