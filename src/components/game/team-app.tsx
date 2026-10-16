'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Crosshair, Pencil, Shield, Trophy } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { checkRoom } from '@/lib/client/room';
import { useDark } from '@/lib/client/use-dark';
import { useRoom, type Target } from '@/lib/client/use-room';
import { LEVELS, remainingTargets, teamById } from '@/lib/game/engine';
import type { GameState, Team } from '@/lib/game/types';
import { play, vibrate } from '@/lib/sfx';
import { ar, cn } from '@/lib/utils';
import { Battlefield } from './battlefield';
import { boardFrom } from './board';
import { burst } from './confetti';
import { LayoutEditor } from './layout-editor';
import { StrikeReveal } from './strike-reveal';
import { TopBar } from './top-bar';

const TEAM_KEY = 'aswar-team-v2';

export function TeamApp() {
  const params = useSearchParams();
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  async function join(code: string, key: string, fromForm = false) {
    setChecking(true);
    const ok = await checkRoom(code, key.toUpperCase()).catch(() => false);
    setChecking(false);
    if (!ok) { setError(fromForm ? 'رمز الغرفة أو رمز الفريق غير صحيح' : null); try { localStorage.removeItem(TEAM_KEY); } catch {} return; }
    try { localStorage.setItem(TEAM_KEY, JSON.stringify({ code, key: key.toUpperCase() })); } catch {}
    router.replace(`/play?room=${code}&code=${key.toUpperCase()}`);
    setTarget({ mode: 'online', code, key: key.toUpperCase() });
  }

  useEffect(() => {
    let saved: { code: string; key: string } | null = null;
    try { saved = JSON.parse(localStorage.getItem(TEAM_KEY) || 'null'); } catch {}
    const code = params.get('room') || saved?.code, key = params.get('code') || saved?.key;
    if (code && key) join(code, key); else setChecking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!target) return <JoinForm error={error} busy={checking} onJoin={(c, k) => join(c, k, true)} defaultRoom={params.get('room') ?? ''} />;
  return <TeamRoom target={target} onLeave={() => { try { localStorage.removeItem(TEAM_KEY); } catch {} setTarget(null); }} />;
}

function JoinForm({ error, busy, onJoin, defaultRoom }: { error: string | null; busy: boolean; onJoin: (c: string, k: string) => void; defaultRoom: string }) {
  const [room, setRoom] = useState(defaultRoom), [code, setCode] = useState('');
  return (
    <div className="desert-bg flex h-dvh flex-col">
      <TopBar compact />
      <main className="relative z-10 grid flex-1 place-items-center p-5">
        <Card className="pattern w-full max-w-sm items-center gap-4 p-6 text-center">
          <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 3 }}><Shield className="size-16 text-gold" strokeWidth={1.5} /></motion.div>
          <h1 className="font-display text-4xl">انضم إلى فريقك</h1>
          <p className="text-sm text-muted-foreground">امسح رمز QR من شاشة المقدم، أو أدخل رقم الغرفة ورمز فريقك.</p>
          {error && <p className="font-bold text-destructive">{error}</p>}
          <form className="flex w-full flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onJoin(room.trim(), code.trim()); }}>
            <Input inputMode="numeric" maxLength={4} placeholder="رقم الغرفة" value={room} onChange={(e) => setRoom(e.target.value)} className="h-14 text-center text-2xl tracking-[0.4em]" dir="ltr" />
            <Input maxLength={6} placeholder="رمز الفريق" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-14 text-center font-mono text-2xl tracking-[0.4em]" dir="ltr" />
            <Button size="xl" disabled={busy || room.length < 4 || code.length < 6}>دخول</Button>
          </form>
        </Card>
      </main>
    </div>
  );
}

function TeamRoom({ target, onLeave }: { target: Target; onLeave: () => void }) {
  const { state, me, status, send } = useRoom(target);
  const team = state && me?.role === 'team' ? teamById(state, me.teamId) : null;
  useEffect(() => { if (status === 'denied') onLeave(); }, [status, onLeave]);
  if (!state || !team) return <div className="desert-bg grid h-dvh place-items-center"><motion.img src="/assets/logo.svg" className="size-24 rounded-3xl" animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} /></div>;
  return (
    <div className="desert-bg flex h-dvh flex-col" style={{ ['--tc' as string]: team.color }}>
      <TopBar compact center={<span className="font-display text-xl" style={{ color: team.color }}>🚩 {team.name}</span>}>
        {(state.phase === 'play' || state.phase === 'end') && <span className="font-display text-2xl text-gold tabular" dir="ltr" data-testid="my-score">{ar(team.score)}</span>}
        <span className={cn('size-2.5 rounded-full', status === 'online' ? 'bg-success' : 'bg-gold animate-pulse')} title="الاتصال" />
      </TopBar>
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-2 p-2.5">
        {state.phase === 'lobby' && <Waiting team={team} send={send} />}
        {state.phase === 'setup' && <TeamSetup state={state} team={team} send={send} />}
        {state.phase === 'play' && <TeamPlay state={state} team={team} send={send} />}
        {state.phase === 'end' && <TeamEnd state={state} team={team} />}
      </main>
      <StrikeReveal state={state} compact />
    </div>
  );
}

type Send = ReturnType<typeof useRoom>['send'];

function Waiting({ team, send }: { team: Team; send: Send }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-7xl">⏳</motion.div>
      <h2 className="font-display text-4xl">أهلًا بفريق <span style={{ color: team.color }}>{team.name}</span></h2>
      <p className="text-muted-foreground">المقدم يجهّز اللعبة، وسيبدأ توزيع الحصن قريبًا.</p>
      <Input defaultValue={team.name} maxLength={24} className="h-12 max-w-64 text-center text-lg font-bold" aria-label="اسم الفريق"
        onBlur={(e) => e.target.value !== team.name && send({ type: 'renameTeam', teamId: team.id, name: e.target.value })} />
      <span className="text-xs text-muted-foreground">يمكنكم تغيير اسم الفريق</span>
    </div>
  );
}

function TeamSetup({ state, team, send }: { state: GameState; team: Team; send: Send }) {
  const dark = useDark();
  const board = useMemo(() => boardFrom(state, dark, { only: [team.id], reveal: () => true, showHeader: false }), [state, dark, team.id]);
  if (team.ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 text-center">
        <h2 className="font-display text-3xl text-success">حصنكم جاهز!</h2>
        <p className="text-sm text-muted-foreground">بانتظار بقية الفرق والمقدم لبدء المعركة.</p>
        <div className="min-h-0 w-full flex-1"><Battlefield board={board} /></div>
        <Button variant="outline" onClick={() => send({ type: 'setReady', teamId: team.id, ready: false })}><Pencil /> تعديل التوزيع</Button>
      </div>
    );
  }
  // المفتاح يعيد بناء المحرر فقط إذا تغيّرت إعدادات الحصن، حتى لا يضيع ما وضعه الفريق مع تحديثات الآخرين
  const key = JSON.stringify(state.settings.elements.map((e) => [e.id, e.count])) + state.settings.gridSize;
  return <LayoutEditor key={key} compact settings={state.settings} initial={team.layout} color={team.color} name={team.name}
    onSave={(layout) => send({ type: 'setLayout', teamId: team.id, layout, ready: true })} />;
}

function TeamPlay({ state, team, send }: { state: GameState; team: Team; send: Send }) {
  const dark = useDark();
  const cur = state.current;
  const turn = state.teams[state.turn];
  const myAim = cur?.stage === 'aim' && cur.attacker === team.id;
  const [tab, setTab] = useState(team.id);
  const [pending, setPending] = useState<{ target: string; cell: number } | null>(null);
  const aimKey = useRef('');

  // عند حلول دورنا في الضرب: تنبيه وانتقال لأول خصم
  useEffect(() => {
    const k = myAim ? `${cur?.q.id}:${state.lastStrike?.id ?? ''}` : '';
    if (myAim && k !== aimKey.current) {
      play('correct'); vibrate([100, 50, 100]);
      setTab(remainingTargets(state, team.id)[0]?.id ?? team.id);
    }
    if (!myAim) setPending(null);
    aimKey.current = k;
  }, [myAim, cur?.q.id, state, team.id]);

  const viewing = teamById(state, tab) ?? team;
  const isMine = viewing.id === team.id;
  const board = useMemo(() => boardFrom(state, dark, {
    only: [viewing.id], reveal: (id) => id === team.id, showHeader: false,
    targetable: (id) => myAim && id !== team.id,
    selected: pending ? { teamId: pending.target, cell: pending.cell } : null,
  }), [state, dark, viewing.id, team.id, myAim, pending]);
  const strike = state.lastStrike && state.lastStrike.target === viewing.id && Date.now() - state.lastStrike.at < 8000 ? state.lastStrike : null;
  const anim = useMemo(() => (strike ? { id: strike.id, attacker: strike.attacker, target: strike.target, cell: strike.cell, el: strike.el, points: strike.points } : null), [strike]);

  let banner: React.ReactNode;
  if (!cur) banner = <Msg me={turn.id === team.id}>{turn.id === team.id ? '⭐ دوركم! استعدوا للسؤال' : `الدور على ${turn.name}`}</Msg>;
  else if (cur.stage === 'question' || cur.stage === 'answer') {
    const shown = cur.stage === 'answer';
    banner = (
      <Card className="gap-2 p-3">
        <div className="flex gap-1.5"><Badge variant="secondary">{cur.q.c}</Badge><Badge variant="secondary">{LEVELS[cur.q.l]}</Badge></div>
        <p className="text-lg font-bold leading-relaxed" data-testid="phone-question">{cur.q.q}</p>
        {cur.q.options && (
          <div className="grid grid-cols-2 gap-1.5">
            {cur.q.options.map((o) => <div key={o} className={cn('rounded-lg border-2 bg-muted/60 p-1.5 text-center text-sm font-bold', shown && o === cur.q.a && 'border-success bg-success/15 text-success')}>{o}</div>)}
          </div>
        )}
        {!cur.q.options && shown && <div className="font-bold text-success">✔ {cur.q.a}</div>}
      </Card>
    );
  } else if (myAim) banner = <Msg aim>🎯 أحسنتم! اختاروا الخصم ثم الخانة</Msg>;
  else if (cur.stage === 'aim') banner = <Msg>🎯 {teamById(state, cur.attacker)?.name} يختار هدفه…</Msg>;
  else if (cur.stage === 'result') banner = <Msg>{cur.extra && cur.attacker === team.id ? '💣 لكم ضربة إضافية! بانتظار المقدم' : 'بانتظار الدور التالي'}</Msg>;
  else banner = <Msg>لم يُجب أحد، بانتظار الدور التالي</Msg>;

  return (
    <>
      <AnimatePresence mode="wait"><motion.div key={(cur?.q.id ?? 'idle') + (cur?.stage ?? '')} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="shrink-0">{banner}</motion.div></AnimatePresence>
      <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto">
        {state.teams.map((t) => (
          <button key={t.id} disabled={myAim && t.id === team.id} onClick={() => { setTab(t.id); setPending(null); }}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition disabled:opacity-40', tab === t.id ? 'bg-card shadow' : 'border-transparent bg-muted/60')}
            style={{ borderColor: tab === t.id ? t.color : undefined }} data-testid="castle-tab">
            <span className="size-2.5 rounded-full" style={{ background: t.color }} />{t.id === team.id ? 'حصني' : t.name}
            <span className="text-xs text-muted-foreground tabular" dir="ltr">{ar(t.score)}</span>
          </button>
        ))}
      </div>
      <Card className="relative min-h-0 flex-1 overflow-hidden bg-card/40 p-0">
        <Battlefield board={board} strike={anim} onTile={(tid, cell) => { if (myAim && tid !== team.id) { play('click'); setPending({ target: tid, cell }); } }} />
        <span className="absolute top-2 right-3 rounded-full bg-card/85 px-3 py-0.5 text-sm font-bold" style={{ color: viewing.color }}>{isMine ? 'حصنكم' : `حصن ${viewing.name}`}</span>
      </Card>
      <AnimatePresence>
        {pending && myAim && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="flex shrink-0 items-center gap-2 rounded-2xl border-2 border-destructive bg-card p-2.5 shadow-xl">
            <b className="flex-1 text-sm">الخانة {ar(pending.cell + 1)} في حصن {teamById(state, pending.target)?.name}؟</b>
            <Button variant="destructive" size="lg" onClick={() => { const p = pending; setPending(null); send({ type: 'strike', target: p.target, cell: p.cell }); }} data-testid="fire"><Crosshair /> اضرب</Button>
            <Button variant="ghost" onClick={() => setPending(null)}>إلغاء</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Msg({ children, me, aim }: { children: React.ReactNode; me?: boolean; aim?: boolean }) {
  return (
    <div className={cn('rounded-2xl p-3 text-center text-lg font-bold', me ? 'text-white shadow-lg' : aim ? 'border-2 border-dashed border-destructive bg-destructive/10' : 'bg-muted/80')}
      style={me ? { background: 'var(--tc)' } : undefined}>{children}</div>
  );
}

function TeamEnd({ state, team }: { state: GameState; team: Team }) {
  const ranked = [...state.teams].sort((a, b) => b.score - a.score);
  const pos = ranked.findIndex((t) => t.id === team.id) + 1;
  useEffect(() => { play('fanfare'); if (pos === 1) burst(120); }, [pos]);
  return (
    <div className="flex flex-1 flex-col items-center gap-3 overflow-auto pt-4 text-center">
      {pos === 1 ? <Trophy className="size-20 text-gold" strokeWidth={1.4} /> : <Shield className="size-20 text-muted-foreground" strokeWidth={1.4} />}
      <h2 className="font-display text-4xl">{pos === 1 ? 'مبروك! فزتم بالمعركة' : `المركز ${ar(pos)}`}</h2>
      <div className="flex w-full flex-col gap-1.5">
        {ranked.map((t, i) => (
          <div key={t.id} className={cn('flex items-center gap-3 rounded-xl bg-muted/70 px-4 py-2 font-bold', i === 0 && 'border border-gold bg-accent')} style={{ borderInlineStart: `6px solid ${t.color}` }}>
            <span className="font-display text-muted-foreground">{ar(i + 1)}</span>{t.name}<span className="ms-auto font-display text-gold" dir="ltr">{ar(t.score)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
