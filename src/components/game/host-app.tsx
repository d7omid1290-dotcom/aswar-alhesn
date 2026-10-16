'use client';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Dices, Eye, Flag, Lock, MonitorSmartphone, Plus, RefreshCw, RotateCcw, Settings2, Swords, Trash2, Trophy, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { checkRoom, clearLocal, createRoom } from '@/lib/client/room';
import { useDark } from '@/lib/client/use-dark';
import { useRoom, type NetStatus, type Target } from '@/lib/client/use-room';
import { LEVEL_MULT, LEVELS, MAX_TEAMS, counts, cellCount, teamById, validLayout, questionPool } from '@/lib/game/engine';
import { CATEGORIES, QUESTIONS } from '@/lib/game/questions';
import type { Action, GameState, Level, Team } from '@/lib/game/types';
import { play } from '@/lib/sfx';
import { ar, cn } from '@/lib/utils';
import { Battlefield } from './battlefield';
import { boardFrom } from './board';
import { burst } from './confetti';
import { ElementIcon } from './element-icon';
import { LayoutEditor } from './layout-editor';
import { QuestionTimer } from './question-timer';
import { StrikeReveal } from './strike-reveal';
import { toast } from './toaster';
import { TopBar } from './top-bar';

type Send = (a: Action) => Promise<{ ok?: boolean; error?: string }>;
const HOST_KEY = 'aswar-host-v2';
const FX: Record<string, string> = { king: 'سقوطه يُعلن للجميع', extra: 'تمنح ضربة إضافية', trap: 'تخصم من المهاجم' };

export function HostApp() {
  const params = useSearchParams();
  const [target, setTarget] = useState<Target | null>(null);
  const [room, setRoom] = useState<{ code: string; hostKey: string } | null>(null);

  useEffect(() => {
    if (params.get('local') === '1') { setTarget({ mode: 'local' }); return; }
    (async () => {
      let saved: { code: string; hostKey: string } | null = null;
      try { saved = JSON.parse(localStorage.getItem(HOST_KEY) || 'null'); } catch {}
      try {
        const r = saved && (await checkRoom(saved.code, saved.hostKey)) ? saved : await createRoom();
        localStorage.setItem(HOST_KEY, JSON.stringify(r));
        setRoom(r);
        setTarget({ mode: 'online', code: r.code, key: r.hostKey });
      } catch {
        toast('تعذر الاتصال بالخادم، سيعمل وضع الشاشة الواحدة', 'error');
        setTarget({ mode: 'local' });
      }
    })();
  }, [params]);

  const { state, status, send } = useRoom(target);
  const local = target?.mode === 'local';

  function newRoom() {
    if (!confirm('بدء غرفة جديدة؟ ستنتهي اللعبة الحالية.')) return;
    try { localStorage.removeItem(HOST_KEY); } catch {}
    clearLocal();
    location.reload();
  }

  if (!state) return <Splash />;
  const turn = state.teams[state.turn];
  const center = {
    lobby: 'إعداد اللعبة', setup: 'توزيع الحصون سرًّا',
    play: <>الجولة {ar(state.round)} من {ar(state.settings.rounds)} · الدور على <b className="ms-1 text-foreground">{turn?.name}</b></>,
    end: 'انتهت المعركة',
  }[state.phase];

  return (
    <div className="desert-bg flex h-dvh flex-col">
      <TopBar center={center}>
        <RoomBadge local={local} room={room} status={status} state={state} />
        {state.phase === 'play' && (
          <Button variant="outline" size="icon" aria-label="إنهاء المعركة" title="إنهاء المعركة" onClick={() => confirm('إنهاء المعركة وإعلان النتيجة؟') && send({ type: 'end' })}><Flag /></Button>
        )}
      </TopBar>
      <main className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3 lg:p-4">
        <AnimatePresence mode="wait">
          <motion.div key={state.phase} className="flex min-h-0 flex-1 flex-col gap-3" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
            {state.phase === 'lobby' && <Lobby state={state} send={send} local={local} onNewRoom={newRoom} />}
            {state.phase === 'setup' && <Setup state={state} send={send} local={local} room={room} />}
            {state.phase === 'play' && <Play state={state} send={send} />}
            {state.phase === 'end' && <End state={state} send={send} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <StrikeReveal state={state} />
    </div>
  );
}

function Splash() {
  return (
    <div className="desert-bg grid h-dvh place-items-center">
      <motion.img src="/assets/logo.svg" alt="" className="size-28 rounded-3xl" animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />
    </div>
  );
}

function RoomBadge({ local, room, status, state }: { local: boolean; room: { code: string } | null; status: NetStatus; state: GameState }) {
  const [open, setOpen] = useState(false);
  if (local || !room) return <Badge variant="outline" className="h-9 gap-2 px-3 text-sm"><MonitorSmartphone className="size-4" /> شاشة واحدة</Badge>;
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-full border bg-card/70 px-3 text-sm font-semibold" data-testid="room-badge">
        <span className={cn('size-2.5 rounded-full', status === 'online' ? 'bg-success shadow-[0_0_0_4px_color-mix(in_oklch,var(--success)_25%,transparent)]' : 'bg-gold animate-pulse')} />
        الغرفة <span className="font-display text-xl tracking-widest text-gold" data-testid="room-code">{room.code}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>ربط جوالات الفرق</DialogTitle><DialogDescription>كل فريق يمسح رمزه فقط، فالرمز يفتح حصنه السري.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 overflow-auto">
            {state.teams.map((t) => <JoinCard key={t.id} team={t} code={room.code} />)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function joinUrl(code: string, t: Team) { return `${location.origin}/play?room=${code}&code=${t.joinCode}`; }

function Qr({ text, className }: { text: string; className?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: 360, color: { dark: '#2a1d11', light: '#fffaf0' } }).then(setSrc); }, [text]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="رمز QR" className={cn('aspect-square rounded-xl', className)} /> : <div className={cn('aspect-square rounded-xl bg-muted', className)} />;
}

function JoinCard({ team, code }: { team: Team; code: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border p-3" style={{ borderTop: `5px solid ${team.color}` }}>
      <b className="font-display text-xl" style={{ color: team.color }}>{team.name}</b>
      <Qr text={joinUrl(code, team)} className="w-full max-w-40" />
      <span className="font-mono text-lg font-bold tracking-[0.3em] text-gold">{team.joinCode}</span>
    </div>
  );
}

// ---------- الإعدادات ----------
function Stepper({ value, min, max, step = 1, onChange, fmt }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border bg-background/50 p-0.5">
      <Button variant="ghost" size="icon" className="size-7" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</Button>
      <b className="min-w-10 text-center tabular">{fmt ? fmt(value) : ar(value)}</b>
      <Button variant="ghost" size="icon" className="size-7" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</Button>
    </div>
  );
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed py-2 last:border-0">
      <div><div className="font-semibold">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>
      {children}
    </div>
  );
}

function Lobby({ state, send, local, onNewRoom }: { state: GameState; send: Send; local: boolean; onNewRoom: () => void }) {
  const s = state.settings;
  const { byId, overflow } = counts(s);
  const n = cellCount(s);
  const cats = Array.from(new Set([...CATEGORIES, ...s.custom.map((q) => q.c)]));
  const available = questionPool(s, QUESTIONS).filter((q) => s.categories.includes(q.c) && s.levels.includes(q.l)).length;
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto lg:grid-cols-[1fr_1.3fr_1.2fr] lg:overflow-visible">
        <Card className="pattern">
          <CardHeader><Swords className="size-5 text-gold" /><CardTitle>الفرق</CardTitle><CardDescription className="ms-auto">{ar(state.teams.length)} من {ar(MAX_TEAMS)}</CardDescription></CardHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
            <AnimatePresence initial={false}>
              {state.teams.map((t) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                  className="flex items-center gap-2 rounded-xl bg-muted/70 p-1.5">
                  <input type="color" value={t.color} aria-label="لون الفريق" onChange={(e) => send({ type: 'renameTeam', teamId: t.id, color: e.target.value })}
                    className="size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0" />
                  <Input defaultValue={t.name} key={t.name} maxLength={24} aria-label="اسم الفريق" className="h-9 border-transparent bg-transparent font-bold shadow-none hover:border-input"
                    onBlur={(e) => e.target.value !== t.name && send({ type: 'renameTeam', teamId: t.id, name: e.target.value })} />
                  <Button variant="ghost" size="icon" aria-label="حذف الفريق" disabled={state.teams.length <= 2} onClick={() => send({ type: 'removeTeam', teamId: t.id })}><Trash2 /></Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <Button variant="outline" disabled={state.teams.length >= MAX_TEAMS} onClick={() => send({ type: 'addTeam' })}><Plus /> إضافة فريق</Button>
        </Card>

        <Card className="pattern">
          <CardHeader><span className="text-lg">🏰</span><CardTitle>عناصر الحصن</CardTitle><CardDescription className="ms-auto">الفراغ يُحسب تلقائيًا</CardDescription></CardHeader>
          <Row label="حجم الحصن">
            <div className="flex items-center gap-2">
              <Stepper value={s.gridSize} min={3} max={8} onChange={(v) => send({ type: 'settings', gridSize: v })} fmt={(v) => `${ar(v)}×${ar(v)}`} />
              <Badge variant="secondary">{ar(n)} خانة</Badge>
            </div>
          </Row>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
            <div className="grid grid-cols-[2.6rem_1fr_auto_4.5rem] gap-2 px-1 text-xs text-muted-foreground"><span /><span>العنصر</span><span className="w-28 text-center">العدد</span><span className="text-center">النقاط</span></div>
            {s.elements.map((e) => (
              <div key={e.id} className="grid grid-cols-[2.6rem_1fr_auto_4.5rem] items-center gap-2 rounded-xl bg-muted/60 px-1 py-0.5">
                <ElementIcon id={e.id} className="size-10" />
                <div className="leading-tight"><b>{e.name}</b>{(e.effect || e.auto) && <div className="text-[11px] text-muted-foreground">{e.auto ? 'يملأ الباقي' : FX[e.effect!]}</div>}</div>
                <div className="flex w-28 justify-center">{e.auto ? <b className="tabular">{ar(byId[e.id])}</b> : <Stepper value={e.count} min={0} max={64} onChange={(v) => send({ type: 'settings', element: { id: e.id, count: v } })} />}</div>
                <Input type="number" step={5} defaultValue={e.points} key={`${e.id}-${e.points}`} className="h-8 px-1 text-center" dir="ltr"
                  onBlur={(ev) => +ev.target.value !== e.points && send({ type: 'settings', element: { id: e.id, points: +ev.target.value } })} aria-label={`نقاط ${e.name}`} />
              </div>
            ))}
          </div>
          {overflow > 0 && <p className="text-sm font-bold text-destructive">العناصر أكثر من الخانات بـ {ar(overflow)}، كبّر الحصن أو قلّل العناصر.</p>}
          <Button variant="ghost" size="sm" className="self-start" onClick={() => send({ type: 'settings', resetElements: true })}><RotateCcw /> القيم الافتراضية</Button>
        </Card>

        <Card className="pattern">
          <CardHeader><span className="text-lg">📜</span><CardTitle>الأسئلة والجولات</CardTitle><CardDescription className="ms-auto">{ar(available)} سؤال متاح</CardDescription></CardHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            <div className="border-b border-dashed pb-2">
              <div className="mb-1.5 font-semibold">المجالات</div>
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => {
                  const on = s.categories.includes(c);
                  return <Chip key={c} on={on} onClick={() => send({ type: 'settings', categories: on ? s.categories.filter((x) => x !== c) : [...s.categories, c] })}>{c}</Chip>;
                })}
              </div>
            </div>
            <Row label="المستويات">
              <div className="flex gap-1.5">
                {([1, 2, 3] as Level[]).map((l) => {
                  const on = s.levels.includes(l);
                  return <Chip key={l} on={on} onClick={() => send({ type: 'settings', levels: on ? s.levels.filter((x) => x !== l) : [...s.levels, l] })}>{LEVELS[l]}</Chip>;
                })}
              </div>
            </Row>
            <Row label="عدد الجولات"><Stepper value={s.rounds} min={1} max={30} onChange={(v) => send({ type: 'settings', rounds: v })} /></Row>
            <Row label="وقت السؤال"><Stepper value={s.timer} min={0} max={120} step={5} onChange={(v) => send({ type: 'settings', timer: v })} fmt={(v) => (v ? `${ar(v)} ث` : 'مفتوح')} /></Row>
            <Row label="مضاعفة النقاط حسب الصعوبة" hint="سهل ×١ · متوسط ×١٫٥ · صعب ×٢">
              <Switch checked={s.levelMultiplier} onCheckedChange={(v) => send({ type: 'settings', levelMultiplier: v })} />
            </Row>
          </div>
          <Button variant="outline" onClick={() => setCustomOpen(true)}>✍️ أسئلتي الخاصة ({ar(s.custom.length)})</Button>
        </Card>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3">
        {local ? <p className="text-sm text-muted-foreground">وضع الشاشة الواحدة: المقدم يدير كل شيء.</p>
          : <Button variant="ghost" onClick={onNewRoom}><RefreshCw /> غرفة جديدة</Button>}
        <Button size="xl" disabled={overflow > 0 || !available} onClick={() => send({ type: 'toSetup' })} data-testid="to-setup">التالي: توزيع الحصون <ArrowLeft /></Button>
      </div>
      <CustomQuestions open={customOpen} onOpenChange={setCustomOpen} state={state} send={send} />
    </>
  );
}

function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('rounded-full border px-3 py-1 text-sm font-semibold transition', on ? 'border-gold bg-accent text-accent-foreground shadow-sm' : 'bg-muted/50 text-muted-foreground')}>
      {children}
    </button>
  );
}

function CustomQuestions({ open, onOpenChange, state, send }: { open: boolean; onOpenChange: (v: boolean) => void; state: GameState; send: Send }) {
  const s = state.settings;
  const [text, setText] = useState('');
  const [cat, setCat] = useState('أسئلة خاصة');
  const [lvl, setLvl] = useState<Level>(1);
  useEffect(() => {
    if (open) { setText(s.custom.map((q) => [q.q, q.a, ...q.w].join(' | ')).join('\n')); setCat(s.custom[0]?.c ?? 'أسئلة خاصة'); }
  }, [open, s.custom]);
  async function save() {
    const c = cat.trim() || 'أسئلة خاصة';
    const custom = text.split('\n').map((line) => line.split('|').map((x) => x.trim()).filter(Boolean)).filter((p) => p.length >= 2)
      .map((p) => ({ c, l: lvl, q: p[0], a: p[1], w: p.slice(2, 7) }));
    const r = await send({ type: 'settings', custom, categories: Array.from(new Set([...s.categories, c])), levels: Array.from(new Set([...s.levels, lvl])) });
    if (r.ok) { toast(`حُفظ ${ar(custom.length)} سؤال`); onOpenChange(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>أسئلتي الخاصة</DialogTitle><DialogDescription>سؤال في كل سطر: السؤال | الإجابة الصحيحة | خيارات خاطئة (اختياري)</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">المجال</span><Input value={cat} onChange={(e) => setCat(e.target.value)} className="w-48" />
          <span className="text-sm font-semibold">المستوى</span>
          {([1, 2, 3] as Level[]).map((l) => <Chip key={l} on={lvl === l} onClick={() => setLvl(l)}>{LEVELS[l]}</Chip>)}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder="ما عاصمة مصر؟ | القاهرة | الإسكندرية | أسوان | الجيزة"
          className="w-full rounded-xl border bg-background/60 p-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40" />
        <Button onClick={save} className="self-end">حفظ</Button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- التوزيع ----------
function Setup({ state, send, local, room }: { state: GameState; send: Send; local: boolean; room: { code: string } | null }) {
  const [editing, setEditing] = useState<Team | null>(null);
  const [confirmFor, setConfirmFor] = useState<Team | null>(null);
  const k = state.teams.length;
  const cols = k <= 4 ? k : Math.ceil(k / 2);
  const notReady = state.teams.filter((t) => !t.ready).length;
  return (
    <>
      <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: 'minmax(0,1fr)' }}>
        {state.teams.map((t, i) => {
          const valid = validLayout(state.settings, t.layout);
          return (
            <motion.div key={t.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="min-h-0">
              <Card className="pattern h-full items-center justify-between overflow-hidden text-center" style={{ borderTop: `6px solid ${t.color}` }} data-testid="team-card">
                <div>
                  <h3 className="font-display text-3xl" style={{ color: t.color }}>{t.name}</h3>
                  <p className={cn('mt-1 font-semibold', t.ready ? 'text-success' : 'text-muted-foreground')}>{t.ready ? '✅ الحصن جاهز' : valid ? '✏️ موزّع ولم يؤكد' : '⏳ بانتظار التوزيع'}</p>
                </div>
                <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1">
                  {!local && room ? (
                    <>
                      <Qr text={joinUrl(room.code, t)} className="max-h-full min-h-0 w-auto max-w-44 flex-1" />
                      <span className="text-xs text-muted-foreground">امسح بالجوال أو أدخل الغرفة <b>{room.code}</b> والرمز</span>
                      <span className="font-mono text-xl font-bold tracking-[0.3em] text-gold" data-testid="join-code">{t.joinCode}</span>
                    </>
                  ) : (
                    <motion.div animate={t.ready ? { rotate: [0, -6, 6, 0] } : {}} className="grid size-28 place-items-center rounded-3xl bg-muted">
                      {t.ready ? <ElementIcon id="king" className="size-20" /> : <Lock className="size-12 text-muted-foreground" />}
                    </motion.div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setConfirmFor(t)}><MonitorSmartphone /> وزّع هنا</Button>
                  <Button variant="ghost" size="icon" title="توزيع عشوائي" aria-label="توزيع عشوائي"
                    onClick={async () => { const r = await send({ type: 'randomLayout', teamId: t.id }); if (r.ok) send({ type: 'setReady', teamId: t.id, ready: true }); }}><Dices /></Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => send({ type: 'toLobby' })}><ArrowRight /> الإعدادات</Button>
        <p className="text-sm text-muted-foreground">{notReady ? `الفرق غير الجاهزة (${ar(notReady)}) ستأخذ توزيعًا عشوائيًا عند البدء` : 'كل الحصون جاهزة!'}</p>
        <Button size="xl" onClick={() => { play('correct'); send({ type: 'start' }); }} data-testid="start"><Swords /> ابدأ المعركة</Button>
      </div>

      <Dialog open={!!confirmFor} onOpenChange={(v) => !v && setConfirmFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>👀 لحظة!</DialogTitle><DialogDescription>تأكد أن الفرق الأخرى لا ترى الشاشة قبل فتح حصن {confirmFor?.name}.</DialogDescription></DialogHeader>
          <Button size="lg" onClick={() => { setEditing(confirmFor); setConfirmFor(null); }}><Eye /> افتح الحصن</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="h-[calc(100dvh-2rem)] max-w-5xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle style={{ color: editing?.color }}>توزيع حصن {editing?.name}</DialogTitle><DialogDescription>اختر عنصرًا ثم انقر الخانات لوضعه، وانقر خانة ممتلئة لإفراغها.</DialogDescription></DialogHeader>
          {editing && (
            <div className="min-h-0 flex-1">
              <LayoutEditor settings={state.settings} initial={editing.layout} color={editing.color} name={editing.name}
                onSave={async (layout) => { const r = await send({ type: 'setLayout', teamId: editing.id, layout, ready: true }); if (r.ok) { toast(`حُفظ حصن ${editing.name}`); setEditing(null); } }} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- المعركة ----------
function Play({ state, send }: { state: GameState; send: Send }) {
  const dark = useDark();
  const cur = state.current;
  const aiming = cur?.stage === 'aim';
  const board = useMemo(() => boardFrom(state, dark, {
    targetable: (id) => !!aiming && id !== cur?.attacker,
    highlight: (id, idx) => (aiming ? (id === cur?.attacker ? 'dim' : 'target') : idx === state.turn ? 'turn' : null),
  }), [state, dark, aiming, cur?.attacker]);
  const strike = state.lastStrike && Date.now() - state.lastStrike.at < 8000 ? state.lastStrike : null;
  const anim = useMemo(() => (strike ? { id: strike.id, attacker: strike.attacker, target: strike.target, cell: strike.cell, el: strike.el, points: strike.points } : null), [strike]);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_clamp(340px,30vw,500px)]">
      <Card className="relative min-h-[40vh] overflow-hidden bg-card/40 p-0">
        <Battlefield board={board} strike={anim} onTile={(teamId, cell) => aiming && send({ type: 'strike', target: teamId, cell })} />
        <AnimatePresence>
          {aiming && cur?.attacker && (
            <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}
              className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full border-2 border-destructive bg-card/90 px-5 py-2 text-lg font-bold shadow-lg">
              🎯 <span style={{ color: teamById(state, cur.attacker)?.color }}>{teamById(state, cur.attacker)?.name}</span> يختار هدفه، انقر خانة في حصن خصم
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      <QuestionPanel state={state} send={send} />
    </div>
  );
}

function QuestionPanel({ state, send }: { state: GameState; send: Send }) {
  const cur = state.current, turn = state.teams[state.turn];
  const order = [...state.teams.slice(state.turn), ...state.teams.slice(0, state.turn)];
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <motion.div key={turn.id} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${turn.color}, color-mix(in oklch, ${turn.color} 70%, black))` }}>
        <span className="text-sm opacity-85">الدور على</span>
        <b className="font-display text-3xl">{turn.name}</b>
        <span className="ms-auto rounded-full bg-black/20 px-3 py-0.5 text-sm">الجولة {ar(state.round)} / {ar(state.settings.rounds)}</span>
      </motion.div>

      <Card className="pattern flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {!cur ? (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 2.4 }} className="text-7xl">📜</motion.div>
              <h2 className="font-display text-3xl">سؤال لفريق {turn.name}</h2>
              <p className="text-sm text-muted-foreground">اختر مستوى السؤال</p>
              <div className="grid w-full grid-cols-2 gap-2">
                {([1, 2, 3] as Level[]).map((l) => <Button key={l} variant="outline" size="lg" onClick={() => send({ type: 'question', level: l })}>{LEVELS[l]}</Button>)}
                <Button size="lg" onClick={() => send({ type: 'question' })} data-testid="random-question"><Dices /> عشوائي</Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => send({ type: 'next' })}>تخطي الدور</Button>
            </motion.div>
          ) : (
            <motion.div key={cur.q.id + cur.stage.slice(0, 1)} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">{cur.q.c}</Badge><Badge variant="secondary">{LEVELS[cur.q.l]}</Badge>
                {state.settings.levelMultiplier && cur.q.l > 1 && <Badge>×{ar(LEVEL_MULT[cur.q.l])}</Badge>}
                <span className="flex-1" />
                {cur.stage === 'question' && state.settings.timer > 0 && <QuestionTimer startedAt={cur.startedAt} total={state.settings.timer} />}
              </div>
              <h2 className="text-[clamp(1.2rem,1.9vw,2rem)] font-bold leading-relaxed" data-testid="question-text">{cur.q.q}</h2>
              {cur.q.options ? (
                <div className="grid grid-cols-2 gap-2">
                  {cur.q.options.map((o, i) => {
                    const correct = cur.stage !== 'question' && o === cur.q.a;
                    return (
                      <motion.div key={o} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, scale: correct ? [1, 1.06, 1] : 1 }} transition={{ delay: i * 0.06 }}
                        className={cn('rounded-xl border-2 bg-muted/60 p-3 text-center text-[clamp(.9rem,1.1vw,1.15rem)] font-bold', correct && 'border-success bg-success/15 text-success')}>{o}</motion.div>
                    );
                  })}
                </div>
              ) : cur.stage !== 'question' && <div className="rounded-xl border-2 border-success bg-success/15 p-3 text-xl font-bold text-success">✔ {cur.q.a}</div>}
              <div className="flex-1" />
              {(cur.stage === 'question' || cur.stage === 'answer') && (
                <div className="flex flex-wrap gap-2">
                  <p className="w-full text-sm font-semibold text-muted-foreground">من أجاب إجابة صحيحة؟</p>
                  {order.map((t) => (
                    <Button key={t.id} variant="team" style={{ background: t.color }} onClick={() => { play('correct'); send({ type: 'judge', teamId: t.id }); }} data-testid="judge-team">✔ {t.name}</Button>
                  ))}
                  <Button variant="outline" className="text-destructive" onClick={() => { play('fail'); send({ type: 'judge', teamId: null }); }}><X /> لا أحد</Button>
                  {cur.stage === 'question' && <Button variant="ghost" onClick={() => send({ type: 'reveal' })}><Eye /> كشف الإجابة</Button>}
                </div>
              )}
              {cur.stage === 'aim' && <div className="rounded-2xl border-2 border-dashed border-destructive bg-destructive/10 p-3 text-center font-bold">🎯 بانتظار اختيار الهدف من الشاشة أو جوال الفريق</div>}
              {cur.stage === 'result' && (cur.extra
                ? <Button size="xl" onClick={() => send({ type: 'extraShot' })}><ElementIcon id="cannon" className="size-8" /> الضربة الإضافية</Button>
                : <Button size="xl" onClick={() => send({ type: 'next' })} data-testid="next-turn">الدور التالي <ArrowLeft /></Button>)}
              {cur.stage === 'none' && <Button size="xl" onClick={() => send({ type: 'next' })} data-testid="next-turn">الدور التالي <ArrowLeft /></Button>}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Scores state={state} send={send} />
    </div>
  );
}

function Scores({ state, send }: { state: GameState; send: Send }) {
  // لا نكشف النقاط قبل ارتطام القذيفة
  const [, force] = useState(0);
  const ls = state.lastStrike, early = ls && Date.now() - ls.at < 1200;
  useEffect(() => { if (early) { const t = setTimeout(() => force((x) => x + 1), 1250 - (Date.now() - ls!.at)); return () => clearTimeout(t); } }, [early, ls]);
  const shown = (t: Team) => (early && ls!.attacker === t.id ? t.score - ls!.points : t.score);
  const ranked = [...state.teams].sort((a, b) => shown(b) - shown(a));
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5">
      {ranked.map((t) => (
        <motion.button layout key={t.id} title="انقر مرتين لتعديل النقاط" onDoubleClick={() => {
          const v = prompt(`تعديل نقاط ${t.name} (مثال: 10 أو -10)`, '10');
          if (v && !isNaN(+v)) send({ type: 'adjustScore', teamId: t.id, delta: Math.round(+v) });
        }} className="flex flex-1 items-center gap-2 rounded-xl border bg-card/80 px-3 py-1.5 text-sm font-bold">
          <span className="size-2.5 rounded-full" style={{ background: t.color }} />{t.name}
          <motion.span key={shown(t)} initial={{ scale: 1.8, color: 'var(--success)' }} animate={{ scale: 1, color: 'var(--gold)' }} className="ms-auto font-display text-lg tabular" dir="ltr">{ar(shown(t))}</motion.span>
        </motion.button>
      ))}
    </div>
  );
}

// ---------- النهاية ----------
function End({ state, send }: { state: GameState; send: Send }) {
  const dark = useDark();
  const ranked = [...state.teams].sort((a, b) => b.score - a.score);
  const tie = ranked.length > 1 && ranked[0].score === ranked[1].score;
  const board = useMemo(() => boardFrom(state, dark, { reveal: () => true }), [state, dark]);
  useEffect(() => { play('fanfare'); burst(160); }, []);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(320px,.8fr)_1.6fr]">
      <Card className="pattern items-center justify-center gap-4 text-center">
        <motion.div animate={{ y: [0, -12, 0], rotate: [0, -4, 4, 0] }} transition={{ repeat: Infinity, duration: 3 }}><Trophy className="size-24 text-gold" strokeWidth={1.4} /></motion.div>
        <h2 className="font-display text-5xl text-gold" data-testid="winner">{tie ? 'تعادل!' : `الفائز: ${ranked[0].name}`}</h2>
        <div className="flex w-full flex-col gap-2">
          {ranked.map((t, i) => (
            <motion.div key={t.id} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.12 }}
              className={cn('flex items-center gap-3 rounded-xl bg-muted/70 px-4 py-2 text-lg font-bold', t.score === ranked[0].score && 'border border-gold bg-accent text-xl')}
              style={{ borderInlineStart: `6px solid ${t.color}` }}>
              <span className="w-6 font-display text-muted-foreground">{ar(i + 1)}</span>{t.name}
              <span className="ms-auto font-display text-gold" dir="ltr">{ar(t.score)}</span>
            </motion.div>
          ))}
        </div>
        <div className="mt-auto flex gap-2">
          <Button size="lg" onClick={() => send({ type: 'restart' })}><RotateCcw /> معركة جديدة</Button>
          <Button size="lg" variant="outline" onClick={async () => { const r = await send({ type: 'restart' }); if (r.ok) send({ type: 'toLobby' }); }}><Settings2 /> الإعدادات</Button>
        </div>
      </Card>
      <Card className="min-h-[40vh] overflow-hidden bg-card/40 p-0"><Battlefield board={board} /></Card>
    </div>
  );
}

