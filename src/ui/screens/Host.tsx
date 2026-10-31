import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Command, HostView, Question, Settings, Team } from '@/engine/types';
import { ELEMENT_META, TEAM_COLORS } from '@/engine/defaults';
import { randomFortress, mathRng, currentTeamId, validTargets } from '@/engine/engine';
import { lanAddresses, type Mode } from '@/net/client';
import { Arena, type Selection } from '../Arena';
import { Brand } from '../components/Brand';
import { Scoreboard } from '../components/Scoreboard';
import { QuestionCard } from '../components/QuestionCard';
import { FortressEditor } from '../components/FortressEditor';
import { ElementsForm, RulesForm } from '../components/RulesForm';
import { QuestionBankDialog, saveBank } from '../components/QuestionBank';
import { QR } from '../components/QR';
import { Toast } from '../components/Toast';
import { Button } from '../kit/button';
import { Dialog } from '../kit/dialog';
import { Field, Input, Segmented, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '../kit/controls';
import { go, loadHostCreds, useNow, useRoom, useTheme, useToast } from '../hooks';
import { sound } from '@/lib/sound';
import { cn, fmtPoints } from '@/lib/utils';
import {
  BookOpen, Check, ChevronLeft, Crosshair, Eye, EyeOff, Flag, Home, ListChecks, Moon, Pause, Play, Plus, QrCode, Scale, Settings2,
  Shield, SkipForward, Sun, Swords, Trash2, Tv, Volume2, VolumeX, X, Maximize, Castle, Shuffle,
} from 'lucide-react';

export default function HostScreen({ room, mode }: { room: string; mode: Mode }) {
  const creds = loadHostCreds(room);
  const info = useMemo(() => (creds ? { mode, roomCode: room, creds: { hostToken: creds.hostToken } } : null), [room, mode, creds?.hostToken]);
  const { view, status, send } = useRoom(info);
  const { theme, toggle } = useTheme();
  const toast = useToast();

  if (!creds) {
    return (
      <div className="grid h-dvh place-items-center p-6 text-center">
        <div className="panel max-w-md rounded-2xl p-8">
          <h1 className="mb-2 text-xl font-semibold">لا تملك صلاحية المقدم لهذه الغرفة</h1>
          <p className="mb-5 text-[var(--ink-soft)]">صلاحية المقدم محفوظة في المتصفح الذي أنشأ المباراة فقط.</p>
          <Button variant="gold" onClick={() => go('/')}>الصفحة الرئيسية</Button>
        </div>
      </div>
    );
  }
  if (!view || view.kind !== 'host') {
    return <div className="grid h-dvh place-items-center text-[var(--ink-soft)]">{status === 'offline' ? 'تعذر الاتصال بالغرفة' : 'جارٍ تحميل المباراة…'}</div>;
  }

  const run = async (cmd: Command) => {
    const r = await send(cmd);
    if (!r.ok) toast.show(r.error);
    return r.ok;
  };
  return (
    <div className="relative h-dvh overflow-hidden">
      <Toast msg={toast.msg} />
      {view.phase === 'lobby' ? (
        <Lobby view={view as HostView} run={run} theme={theme} toggleTheme={toggle} mode={mode} />
      ) : (
        <Match view={view as HostView} run={run} theme={theme} toggleTheme={toggle} mode={mode} status={status} />
      )}
    </div>
  );
}

type Run = (c: Command) => Promise<boolean>;

function TopBar({ view, theme, toggleTheme, mode, children }: { view: HostView; theme: string; toggleTheme: () => void; mode: Mode; children?: React.ReactNode }) {
  const [muted, setMuted] = useState(sound.muted);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-4">
      <div className="pointer-events-auto flex items-center gap-3">
        <div className="panel flex items-center gap-3 rounded-2xl px-4 py-2.5">
          <button onClick={() => go('/')} aria-label="الرئيسية"><Brand compact /></button>
          <span className="h-6 w-px bg-[var(--line)]" />
          <div className="text-xs leading-tight text-[var(--ink-soft)]">رمز الغرفة<div className="font-mono text-base font-bold tracking-[0.18em] text-[var(--ink)]" dir="ltr">{view.roomCode}</div></div>
          <span className="rounded-full bg-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--ink-soft)]">{mode === 'local' ? 'محلي' : mode === 'lan' ? 'شبكة محلية' : 'متصل'}</span>
        </div>
      </div>
      <div className="pointer-events-auto flex items-center gap-1.5">
        {children}
        <IconBtn label={muted ? 'تشغيل الصوت' : 'كتم الصوت'} onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}>{muted ? <VolumeX /> : <Volume2 />}</IconBtn>
        <IconBtn label="المظهر" onClick={toggleTheme}>{theme === 'dark' ? <Sun /> : <Moon />}</IconBtn>
        <IconBtn label="ملء الشاشة" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}><Maximize /></IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button onClick={onClick} title={label} aria-label={label}
      className={cn('panel grid h-10 w-10 place-items-center rounded-xl text-[var(--ink)] transition-[background-color,transform] hover:bg-[var(--panel-solid)] active:scale-95 [&_svg]:size-[18px]', active && 'ring-2 ring-[var(--accent)]')}>
      {children}
    </button>
  );
}

function teamLink(mode: Mode, room: string, t: Team, origin: string) {
  return `${origin}/#/team?room=${room}&t=${t.token}&mode=${mode}`;
}

function useOrigin(mode: Mode) {
  const [origin, setOrigin] = useState(location.origin);
  useEffect(() => {
    if (mode === 'lan' && /localhost|127\.0\.0\.1/.test(location.hostname)) {
      lanAddresses().then((ips) => ips[0] && setOrigin(`${location.protocol}//${ips[0]}:${location.port}`));
    }
  }, [mode]);
  return origin;
}

// ─────────────────────────── الإعداد ───────────────────────────
function Lobby({ view, run, theme, toggleTheme, mode }: { view: HostView; run: Run; theme: 'dark' | 'light'; toggleTheme: () => void; mode: Mode }) {
  const s = view.full;
  const [preview, setPreview] = useState<string | null>(null);
  const [qrTeam, setQrTeam] = useState<Team | null>(null);
  const [editTeam, setEditTeam] = useState<string | null>(null);
  const [bank, setBank] = useState(false);
  const [audience, setAudience] = useState(false);
  const origin = useOrigin(mode);
  const patch = (p: Partial<Settings>) => run({ type: 'UPDATE_SETTINGS', patch: p });
  const ready = s.teams.filter((t) => t.locked).length;
  const editing = s.teams.find((t) => t.id === editTeam) ?? null;

  return (
    <>
      <Arena view={view} theme={theme} previewTeamId={preview} />
      <TopBar view={view} theme={theme} toggleTheme={toggleTheme} mode={mode}>
        <IconBtn label="شاشة الجمهور" onClick={() => setAudience(true)}><Tv /></IconBtn>
        <IconBtn label="بنك الأسئلة" onClick={() => setBank(true)}><BookOpen /></IconBtn>
      </TopBar>

      <div className="absolute bottom-4 right-4 top-[84px] z-20 flex w-[min(440px,calc(100vw-32px))] flex-col">
        <div className="panel flex min-h-0 flex-1 flex-col rounded-2xl">
          <div className="px-5 pb-3 pt-4">
            <h2 className="text-lg font-semibold">إعداد المباراة</h2>
            <p className="text-sm text-[var(--ink-soft)]">أضف الفرق، وزّع الحصون، واضبط القواعد.</p>
          </div>
          <Tabs defaultValue="teams" dir="rtl" className="flex min-h-0 flex-1 flex-col">
            <div className="px-5"><TabsList><TabsTrigger value="teams">الفرق</TabsTrigger><TabsTrigger value="forts">الحصون</TabsTrigger><TabsTrigger value="rules">القواعد</TabsTrigger></TabsList></div>
            <TabsContent value="teams" className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-2.5">
                {s.teams.map((t) => (
                  <div key={t.id} onMouseEnter={() => setPreview(t.id)} onMouseLeave={() => setPreview(null)}
                    className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel-solid)] p-3">
                    <div className="flex items-center gap-2">
                      <label className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border hairline" style={{ background: t.color }} title="لون الفريق">
                        <input type="color" value={t.color} onChange={(e) => run({ type: 'EDIT_TEAM', teamId: t.id, color: e.target.value })} className="absolute inset-0 opacity-0" />
                      </label>
                      <Input defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && run({ type: 'EDIT_TEAM', teamId: t.id, name: e.target.value })} className="h-9" />
                      <button className="rounded-lg p-2 text-[var(--ink-soft)] hover:bg-[var(--line)]" title="رمز الانضمام" onClick={() => setQrTeam(t)}><QrCode size={18} /></button>
                      {s.teams.length > 2 && <button className="rounded-lg p-2 text-[var(--ink-soft)] hover:bg-[var(--line)] hover:text-[#d0583a]" title="حذف" onClick={() => run({ type: 'REMOVE_TEAM', teamId: t.id })}><Trash2 size={16} /></button>}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className={cn('inline-flex items-center gap-1', t.locked ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--ink-soft)]')}>
                        {t.locked ? <><Check size={15} /> الحصن معتمد</> : t.fortress.some(Boolean) ? `يوزّع… ${t.fortress.filter(Boolean).length}/${s.settings.slotCount}` : 'لم يوزع حصنه بعد'}
                      </span>
                      <span className="text-xs text-[var(--ink-soft)]">· رمز الفريق <b className="font-mono tracking-wider text-[var(--ink)]">{t.pin}</b></span>
                      <Button size="sm" variant="outline" className="ms-auto h-7" onClick={() => setEditTeam(t.id)}><Castle /> توزيع</Button>
                    </div>
                  </div>
                ))}
                {s.teams.length < 8 && (
                  <Button variant="outline" className="w-full" onClick={() => run({ type: 'ADD_TEAM', name: '', color: TEAM_COLORS[s.teams.length % 8] })}><Plus /> إضافة فريق</Button>
                )}
              </div>
            </TabsContent>
            <TabsContent value="forts" className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4"><ElementsForm s={s.settings} onPatch={patch} /></TabsContent>
            <TabsContent value="rules" className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4"><RulesForm s={s.settings} playing={false} onPatch={patch} questions={s.questions} /></TabsContent>
          </Tabs>
        </div>
      </div>

      {/* زر البدء: كبير وواضح دائمًا */}
      <div className="absolute bottom-6 left-6 z-20 flex flex-col items-start gap-2">
        <div className="panel rounded-xl px-3 py-1.5 text-sm text-[var(--ink-soft)]">{ready}/{s.teams.length} حصون معتمدة{ready < s.teams.length ? ' · الباقي يوزع عشوائيًا' : ''}</div>
        <Button variant="gold" size="xl" onClick={async () => { if (await run({ type: 'START_MATCH' })) sound.play('start'); }}><Swords /> ابدأ المباراة</Button>
      </div>

      <Dialog open={!!qrTeam} onOpenChange={(v) => !v && setQrTeam(null)} title={`انضمام ${qrTeam?.name ?? ''}`} description="يمسح الفريق الرمز بجواله ليوزع حصنه ويجيب ويهاجم.">
        {qrTeam && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-2xl bg-white p-3"><QR value={teamLink(mode, view.roomCode, qrTeam, origin)} size={220} /></div>
            <div className="text-sm text-[var(--ink-soft)]">أو من الصفحة الرئيسية: رمز الغرفة <b className="font-mono tracking-widest text-[var(--ink)]" dir="ltr">{view.roomCode}</b> ورمز الفريق <b className="font-mono tracking-widest text-[var(--ink)]">{qrTeam.pin}</b></div>
            <div className="flex w-full gap-2">
              <Input readOnly value={teamLink(mode, view.roomCode, qrTeam, origin)} dir="ltr" className="text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={() => window.open(teamLink(mode, view.roomCode, qrTeam, origin), '_blank')}>فتح</Button>
            </div>
            {mode === 'local' && <p className="text-xs text-[var(--ink-soft)]">في الوضع المحلي يعمل الرابط في تبويب آخر من المتصفح نفسه فقط. للجوالات شغّل الشبكة المحلية أو الوضع المتصل.</p>}
          </div>
        )}
      </Dialog>

      <Dialog open={audience} onOpenChange={setAudience} title="شاشة الجمهور" description="افتحها على شاشة العرض الكبيرة. لا تُرسل إليها أي معلومات سرية.">
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl bg-white p-3"><QR value={`${origin}/#/screen?room=${view.roomCode}&mode=${mode}`} size={180} /></div>
          <Button variant="gold" onClick={() => window.open(`${origin}/#/screen?room=${view.roomCode}&mode=${mode}`, '_blank')}><Tv /> فتح شاشة الجمهور</Button>
        </div>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditTeam(null)} title={`توزيع ${editing?.name ?? ''}`} description="المقدم يوزع نيابة عن الفريق. لا يظهر هذا التوزيع لأي فريق آخر." wide>
        {editing && (
          <div>
            <FortressEditor settings={s.settings} fortress={editing.fortress} onChange={(f) => run({ type: 'SET_FORTRESS', teamId: editing.id, fortress: f })} onRandom={() => run({ type: 'RANDOMIZE_FORTRESS', teamId: editing.id })} locked={editing.locked} />
            <div className="mt-4 flex justify-end gap-2">
              {editing.locked ? <Button variant="outline" onClick={() => run({ type: 'LOCK_FORTRESS', teamId: editing.id, locked: false })}>فك الاعتماد</Button>
                : <Button variant="gold" onClick={async () => (await run({ type: 'LOCK_FORTRESS', teamId: editing.id, locked: true })) && setEditTeam(null)}><Check /> اعتماد الحصن</Button>}
            </div>
          </div>
        )}
      </Dialog>

      <QuestionBankDialog open={bank} onOpenChange={setBank} questions={s.questions} onSave={(q: Question[]) => { saveBank(q); run({ type: 'SET_QUESTIONS', questions: q }); }} />
    </>
  );
}

// ─────────────────────────── المباراة ───────────────────────────
function Match({ view, run, theme, toggleTheme, mode, status }: { view: HostView; run: Run; theme: 'dark' | 'light'; toggleTheme: () => void; mode: Mode; status: string }) {
  const s = view.full;
  const now = useNow(500);
  const [cine, setCine] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [showAns, setShowAns] = useState(false);
  const [dlg, setDlg] = useState<null | 'settings' | 'log' | 'adjust' | 'fortress' | 'bank' | 'pick' | 'end'>(null);
  const [recent, setRecent] = useState<string | null>(null);
  const timeoutSent = useRef<string | null>(null);
  const cur = currentTeamId(s);
  const curTeam = s.teams.find((t) => t.id === cur);
  const a = s.attempt;
  const right = s.attackRight;

  // حق هجوم جديد: ابدأ الاختيار من الخريطة
  useEffect(() => {
    if (right) setSel((x) => (x && x.attackerId === right.teamId ? x : { attackerId: right.teamId, targetId: null, slot: null }));
    else setSel(null);
  }, [right?.token]);

  // أصوات الإجابة، وإبقاء الإجابة الخاطئة ظاهرة لحظات
  const lastResult = useRef<string | null>(null);
  useEffect(() => {
    if (a?.result && lastResult.current !== a.id) {
      lastResult.current = a.id;
      sound.play(a.result === 'correct' ? 'correct' : 'wrong');
      if (a.result !== 'correct') { setRecent(a.id); setTimeout(() => setRecent((r) => (r === a.id ? null : r)), 5000); }
      setShowAns(false);
    }
  }, [a?.result, a?.id]);
  useEffect(() => { sound.setVolume(s.settings.volume); }, [s.settings.volume]);

  // انتهاء الوقت: يرسل المقدم أمر انتهاء الوقت ويتحقق المحرك منه
  useEffect(() => {
    if (a && !a.result && !s.paused && now > a.deadline + 300 && timeoutSent.current !== a.id) {
      timeoutSent.current = a.id;
      run({ type: 'TIMEOUT', attemptId: a.id });
    }
  }, [now, a?.id, a?.result, s.paused]);

  const ended = s.phase === 'ended';
  const showQuestion = a && (!a.result || recent === a.id) && !right;
  const targets = right ? validTargets(s, right.teamId) : [];
  const selTarget = sel?.targetId ? s.teams.find((t) => t.id === sel.targetId) : null;
  const strike = async () => {
    if (!right || !sel?.targetId || sel.slot == null) return;
    const ok = await run({ type: 'STRIKE', targetId: sel.targetId, slot: sel.slot, rightToken: right.token });
    if (ok) setSel(null);
  };
  const matchLeft = s.settings.matchMinutes && s.startedAt ? Math.max(0, s.settings.matchMinutes * 60000 - ((s.paused && s.pausedAt ? s.pausedAt : now) - s.startedAt)) : null;

  return (
    <>
      <Arena view={view} theme={theme} onCinematic={setCine}
        selection={sel && !cine ? sel : null}
        onPickCastle={(id) => setSel((x) => (x ? { ...x, targetId: id, slot: null } : x))}
        onPickSlot={(i) => setSel((x) => (x ? { ...x, slot: i } : x))} />

      <TopBar view={view} theme={theme} toggleTheme={toggleTheme} mode={mode}>
        {!ended && <IconBtn label={s.paused ? 'استئناف' : 'إيقاف مؤقت'} onClick={() => run({ type: s.paused ? 'RESUME' : 'PAUSE' })}>{s.paused ? <Play /> : <Pause />}</IconBtn>}
        <IconBtn label="الإعدادات" onClick={() => setDlg('settings')}><Settings2 /></IconBtn>
        <IconBtn label="تعديل النقاط" onClick={() => setDlg('adjust')}><Scale /></IconBtn>
        <IconBtn label="تعديل حصن" onClick={() => setDlg('fortress')}><Shield /></IconBtn>
        <IconBtn label="بنك الأسئلة" onClick={() => setDlg('bank')}><BookOpen /></IconBtn>
        <IconBtn label="سجل الأحداث" onClick={() => setDlg('log')}><ListChecks /></IconBtn>
        {!ended && <IconBtn label="إنهاء المباراة" onClick={() => setDlg('end')}><Flag /></IconBtn>}
      </TopBar>

      {/* حالة الجولة */}
      <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
        <div className={cn('panel rounded-2xl px-5 py-2 text-center transition-opacity', cine && 'opacity-0')}>
          <div className="text-xs text-[var(--ink-soft)]">{s.settings.winMode === 'points' ? `الجولة ${s.round} من ${s.settings.rounds}` : `إسقاط الملك · الجولة ${s.round}`}{matchLeft != null && ` · ${Math.floor(matchLeft / 60000)}:${String(Math.floor((matchLeft % 60000) / 1000)).padStart(2, '0')}`}</div>
          <div className="text-[15px] font-semibold">{ended ? 'انتهت المباراة' : curTeam ? <>الدور على <span style={{ color: curTeam.color }}>{curTeam.name}</span></> : ''}</div>
        </div>
      </div>

      {/* لوحة النقاط */}
      <div className={cn('absolute right-4 top-[84px] z-20 w-[min(270px,40vw)] transition-[opacity,transform] duration-300', cine && 'translate-x-4 opacity-0')}>
        <Scoreboard view={view} />
        {status !== 'live' && <div className="mt-2 rounded-xl bg-[#7a2a1f] px-3 py-2 text-xs text-white">{status === 'offline' ? 'غير متصل بالخادم' : 'إعادة الاتصال…'}</div>}
      </div>

      {/* منطقة التحكم السفلية */}
      <AnimatePresence mode="wait">
        {!cine && !ended && (
          <motion.div key={right ? 'attack' + (sel?.targetId ?? '') : showQuestion ? 'q' + a!.id : 'idle' + cur}
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10, transition: { duration: 0.15 } }} transition={{ type: 'spring', duration: 0.4, bounce: 0.1 }}
            className="absolute bottom-5 left-1/2 z-20 w-[min(880px,calc(100vw-32px))] -translate-x-1/2">
            <div className="panel rounded-3xl p-5">
              {right ? (
                <AttackDock view={view} sel={sel} setSel={setSel} targets={targets} selTarget={selTarget} onStrike={strike} />
              ) : showQuestion ? (
                <div>
                  <QuestionCard view={view} showAnswer={showAns} big />
                  {!a!.result && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button variant="success" size="lg" onClick={() => run({ type: 'JUDGE_ANSWER', attemptId: a!.id, correct: true })}><Check /> إجابة صحيحة</Button>
                      <Button variant="danger" size="lg" onClick={() => run({ type: 'JUDGE_ANSWER', attemptId: a!.id, correct: false })}><X /> إجابة خاطئة</Button>
                      {a!.mode === 'mobile' && <span className="text-sm text-[var(--ink-soft)]">{a!.submitted ? `وصلت إجابة الفريق: «${a!.submitted.answer}» ${a!.submitted.correct === null ? '(بانتظار حكمك)' : ''}` : 'بانتظار إجابة الفريق من الجوال… يمكنك الحكم يدويًا'}</span>}
                      <button onClick={() => setShowAns(!showAns)} className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-[var(--ink-soft)] hover:bg-[var(--line)]">{showAns ? <EyeOff size={16} /> : <Eye size={16} />} {showAns ? 'إخفاء الإجابة' : 'إظهار الإجابة لي'}</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1">
                    <div className="text-sm text-[var(--ink-soft)]">{curTeam?.rebuild.active ? 'سؤال لإعادة بناء برج الملك' : 'السؤال التالي'}</div>
                    <div className="text-2xl font-semibold">الدور على <span style={{ color: curTeam?.color }}>{curTeam?.name}</span></div>
                    <div className="mt-0.5 text-xs text-[var(--ink-soft)]">{s.settings.answerMode === 'mobile' ? 'الإجابة من الجوال' : 'الإجابة شفهية ويحكم المقدم'}{s.pendingAnswerMode && ' · سيتغير وضع الإجابة من هذا السؤال'}</div>
                  </div>
                  <Button variant="ghost" onClick={() => run({ type: 'SKIP_TURN' })}><SkipForward /> تخطي الدور</Button>
                  <Button variant="outline" size="lg" onClick={() => setDlg('pick')}><BookOpen /> اختر سؤالًا</Button>
                  <Button variant="gold" size="xl" disabled={s.paused} onClick={() => run({ type: 'ASK_QUESTION' })}>اطرح السؤال</Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {s.paused && !ended && (
        <div className="absolute inset-0 z-[25] grid place-items-center bg-[rgba(4,8,16,0.45)] backdrop-blur-[2px]">
          <div className="panel rounded-3xl px-10 py-8 text-center">
            <div className="mb-4 text-2xl font-semibold">المباراة متوقفة مؤقتًا</div>
            <Button variant="gold" size="lg" onClick={() => run({ type: 'RESUME' })}><Play /> استئناف</Button>
          </div>
        </div>
      )}

      {ended && !cine && <Winner view={view} onReset={() => run({ type: 'RESET_TO_LOBBY' })} />}

      <Dialog open={dlg === 'settings'} onOpenChange={(v) => !v && setDlg(null)} title="إعدادات المباراة" description="تُحفظ التغييرات فورًا دون فقدان حالة المباراة.">
        <AnswerModeControl view={view} run={run} />
        <RulesForm s={s.settings} playing onPatch={(p) => run({ type: 'UPDATE_SETTINGS', patch: p })} questions={s.questions} />
      </Dialog>
      <AdjustDialog open={dlg === 'adjust'} onClose={() => setDlg(null)} view={view} run={run} />
      <FortressEditDialog open={dlg === 'fortress'} onClose={() => setDlg(null)} view={view} run={run} />
      <PickQuestionDialog open={dlg === 'pick'} onClose={() => setDlg(null)} view={view} run={run} />
      <QuestionBankDialog open={dlg === 'bank'} onOpenChange={(v) => !v && setDlg(null)} questions={s.questions} onSave={(q) => { saveBank(q); run({ type: 'SET_QUESTIONS', questions: q }); }} />
      <Dialog open={dlg === 'log'} onOpenChange={(v) => !v && setDlg(null)} title="سجل الأحداث" description="العمليات المهمة مسجلة، ومنها تعديلات المقدم.">
        <div className="space-y-1.5">
          {[...s.log].reverse().map((l, i) => (
            <div key={i} className="flex gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-[var(--line)]">
              <span className="shrink-0 text-xs text-[var(--ink-soft)] tabular">{new Date(l.at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="flex-1">{l.text}</span>
              {!l.publicVisible && <span className="shrink-0 rounded bg-[var(--line)] px-1.5 text-[11px] text-[var(--ink-soft)]">للمقدم</span>}
            </div>
          ))}
        </div>
      </Dialog>
      <Dialog open={dlg === 'end'} onOpenChange={(v) => !v && setDlg(null)} title="إنهاء المباراة الآن؟" description="تُحسب النتيجة الحالية ويُعلن الفائز. لا يمكن التراجع.">
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDlg(null)}>إلغاء</Button><Button variant="danger" onClick={async () => { await run({ type: 'END_MATCH' }); setDlg(null); }}><Flag /> إنهاء وإعلان الفائز</Button></div>
      </Dialog>
    </>
  );
}

function AttackDock({ view, sel, setSel, targets, selTarget, onStrike }: { view: HostView; sel: Selection | null; setSel: (s: Selection | null) => void; targets: Team[]; selTarget?: Team | null; onStrike: () => void }) {
  const s = view.full;
  const att = s.teams.find((t) => t.id === s.attackRight!.teamId)!;
  const phoneNote = s.settings.opMode !== 'host' ? `يمكن لـ ${att.name} الاختيار من الجوال، أو نفّذ الضربة من هنا.` : '';
  if (!sel?.targetId || !selTarget) {
    return (
      <div>
        <div className="flex items-center gap-2"><Crosshair className="text-[var(--accent)]" /><div className="text-xl font-semibold"><span style={{ color: att.color }}>{att.name}</span> يملك حق الهجوم: اختر حصن الخصم</div></div>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">انقر الحصن على الخريطة أو اختره هنا. {phoneNote}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {targets.map((t) => (
            <Button key={t.id} variant="outline" size="lg" onClick={() => setSel({ attackerId: att.id, targetId: t.id, slot: null })}>
              <span className="h-3 w-3 rounded-full" style={{ background: t.color }} /> {t.name}
            </Button>
          ))}
        </div>
      </div>
    );
  }
  const n = s.settings.slotCount;
  const hidden = s.settings.fortressStyle === 'hiddenNumbers';
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-lg p-1.5 hover:bg-[var(--line)]" onClick={() => setSel({ attackerId: att.id, targetId: null, slot: null })} aria-label="رجوع"><ChevronLeft className="rotate-180" /></button>
        <div className="flex-1">
          <div className="text-xl font-semibold">الهدف: <span style={{ color: selTarget.color }}>{selTarget.name}</span></div>
          <div className="text-sm text-[var(--ink-soft)]">{hidden ? 'الأرقام مخفية: اختر رقمًا وشاهد أين يسقط الصاروخ.' : 'اختر رقم الموقع على القلعة أو من الأرقام أدناه.'}</div>
        </div>
        <Button variant="gold" size="xl" disabled={sel.slot == null} onClick={onStrike}><Swords /> {sel.slot == null ? 'اختر موقعًا' : `أطلق على الموقع ${sel.slot + 1}`}</Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: n }, (_, i) => {
          const hit = selTarget.hits[i];
          const m = hit ? ELEMENT_META[hit.kind] : null;
          return (
            <button key={i} disabled={!!hit} onClick={() => setSel({ ...sel, slot: i })}
              className={cn('grid h-10 min-w-10 place-items-center rounded-xl border px-2 text-[15px] font-bold tabular transition-[background-color,border-color,transform] active:scale-95',
                sel.slot === i ? 'border-[var(--accent)] bg-[var(--accent)] text-[#1a1408]' : hit ? 'border-transparent bg-[var(--line)] opacity-60' : 'border-[var(--panel-border)] bg-[var(--panel-solid)] hover:border-[var(--accent)]')}>
              {hit ? <span style={{ color: m!.tint }}>{m!.glyph}</span> : i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AnswerModeControl({ view, run }: { view: HostView; run: Run }) {
  const s = view.full;
  const [immediate, setImmediate] = useState(false);
  const effective = s.pendingAnswerMode ?? s.settings.answerMode;
  return (
    <div className="mb-4 rounded-xl border border-[var(--panel-border)] p-4">
      <div className="mb-2 font-semibold">الإجابة من الجوال</div>
      <Segmented value={effective} onChange={(v) => run({ type: 'SET_ANSWER_MODE', mode: v, immediate })} options={[{ value: 'host', label: 'معطلة: يحكم المقدم' }, { value: 'mobile', label: 'مفعّلة' }]} />
      <Switch checked={immediate} onChange={setImmediate} label="تطبيق فوري على السؤال الحالي" hint="افتراضيًا يُطبق التغيير من المحاولة التالية" />
      {s.pendingAnswerMode && <p className="text-xs text-[var(--accent)]">سيُطبق «{s.pendingAnswerMode === 'mobile' ? 'الجوال' : 'المقدم'}» من السؤال التالي.</p>}
    </div>
  );
}

function AdjustDialog({ open, onClose, view, run }: { open: boolean; onClose: () => void; view: HostView; run: Run }) {
  const [team, setTeam] = useState(view.full.teams[0].id);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="تعديل النقاط" description="كل تعديل يُسجل مع سببه في سجل الأحداث.">
      <div className="space-y-3">
        <Field label="الفريق"><Select value={team} onChange={setTeam} options={view.full.teams.map((t) => ({ value: t.id, label: `${t.name} (${fmtPoints(t.score)})` }))} /></Field>
        <Field label="القيمة (سالبة للخصم)"><Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} dir="ltr" /></Field>
        <Field label="السبب"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تصحيح خطأ في التحكيم" /></Field>
        <div className="flex justify-end"><Button variant="gold" disabled={!Number(delta) || !reason.trim()} onClick={async () => { if (await run({ type: 'ADJUST_SCORE', teamId: team, delta: Number(delta), reason })) { setDelta(''); setReason(''); onClose(); } }}>حفظ التعديل</Button></div>
      </div>
    </Dialog>
  );
}

function FortressEditDialog({ open, onClose, view, run }: { open: boolean; onClose: () => void; view: HostView; run: Run }) {
  const s = view.full;
  const [team, setTeam] = useState(s.teams[0].id);
  const t = s.teams.find((x) => x.id === team)!;
  const [draft, setDraft] = useState<(string | null)[]>(t.fortress);
  const [reason, setReason] = useState('');
  useEffect(() => setDraft(t.fortress), [team, open]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="تعديل حصن أثناء المباراة" description="المواقع المكشوفة لا تتغير، والتعديل يُسجل للمقدم." wide>
      <div className="space-y-3">
        <Field label="الفريق"><Select value={team} onChange={setTeam} options={s.teams.map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <FortressEditor settings={s.settings} fortress={draft} onChange={setDraft} hits={t.hits} />
        <Field label="سبب التعديل"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDraft(t.fortress)}><Shuffle /> تراجع</Button><Button variant="gold" onClick={async () => { if (await run({ type: 'SET_FORTRESS', teamId: team, fortress: draft, reason })) onClose(); }}>حفظ الحصن</Button></div>
      </div>
    </Dialog>
  );
}

function PickQuestionDialog({ open, onClose, view, run }: { open: boolean; onClose: () => void; view: HostView; run: Run }) {
  const [q, setQ] = useState('');
  const s = view.full;
  const list = s.questions.filter((x) => !q || x.text.includes(q) || x.category.includes(q));
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="اختر سؤالًا" description="الأسئلة المستخدمة في هذه المباراة معلّمة." wide>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث" className="mb-3" />
      <div className="divide-y divide-[var(--line)] rounded-xl border hairline">
        {list.slice(0, 200).map((x) => (
          <button key={x.id} className="flex w-full items-center gap-3 px-3 py-2.5 text-right hover:bg-[var(--line)]" onClick={async () => { if (await run({ type: 'ASK_QUESTION', questionId: x.id })) onClose(); }}>
            <span className="flex-1">{x.text}<span className="block text-xs text-[var(--ink-soft)]">{x.category} · {x.difficulty === 'easy' ? 'سهل' : x.difficulty === 'medium' ? 'متوسط' : 'صعب'}</span></span>
            {s.usedQuestions.includes(x.id) && <span className="rounded bg-[var(--line)] px-1.5 text-xs text-[var(--ink-soft)]">مستخدم</span>}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function Winner({ view, onReset }: { view: HostView | import('@/engine/types').PublicView; onReset?: () => void }) {
  const ranked = [...view.teams].sort((a, b) => b.score - a.score);
  const winners = view.teams.filter((t) => view.winnerIds.includes(t.id));
  useEffect(() => { sound.play('win'); }, []);
  return (
    <motion.div className="absolute inset-0 z-40 grid place-items-center bg-[rgba(4,8,16,0.55)] p-4 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="panel-solid w-[min(560px,100%)] rounded-3xl p-8 text-center" initial={{ scale: 0.92, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', duration: 0.6, bounce: 0.25 }}>
        <div className="text-sm text-[var(--ink-soft)]">انتهت المباراة</div>
        <div className="gold-text mt-1 font-display text-5xl">{winners.length > 1 ? 'تعادل' : 'الفائز'}</div>
        <div className="mt-3 text-3xl font-bold">{winners.map((w) => <span key={w.id} style={{ color: w.color }} className="mx-2">{w.name}</span>)}</div>
        <div className="mt-6 space-y-2 text-right">
          {ranked.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl bg-[var(--line)] px-4 py-2.5">
              <span className="w-6 text-center font-bold text-[var(--ink-soft)]">{i + 1}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
              <span className="flex-1 font-medium">{t.name}{t.eliminated ? ' · سقط' : ''}</span>
              <span className="text-lg font-bold tabular">{fmtPoints(t.score)}</span>
            </div>
          ))}
        </div>
        {onReset && (
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => go('/')}><Home /> الرئيسية</Button>
            <Button variant="gold" onClick={onReset}>مباراة جديدة بالفرق نفسها</Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

void randomFortress; void mathRng;
