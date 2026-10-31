import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Mode } from '@/net/client';
import { Arena } from '../Arena';
import { Brand } from '../components/Brand';
import { Scoreboard } from '../components/Scoreboard';
import { QuestionCard } from '../components/QuestionCard';
import { QR } from '../components/QR';
import { useRoom, useTheme } from '../hooks';
import { Winner } from './Host';
import { sound } from '@/lib/sound';
import type { PublicView } from '@/engine/types';

// شاشة الجمهور: عرض فقط، ولا تصلها أي بيانات سرية
export default function AudienceScreen({ room, mode }: { room: string; mode: Mode }) {
  const info = useMemo(() => ({ mode, roomCode: room, creds: {} }), [room, mode]);
  const { view, status } = useRoom(info);
  const { theme } = useTheme();
  const [cine, setCine] = useState(false);
  const [recent, setRecent] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const a = view?.attempt;
  useEffect(() => {
    if (a?.result && last.current !== a.id) {
      last.current = a.id;
      sound.play(a.result === 'correct' ? 'correct' : 'wrong');
      setRecent(a.id);
      setTimeout(() => setRecent((r) => (r === a.id ? null : r)), 5000);
    }
  }, [a?.result, a?.id]);
  if (!view) return <div className="grid h-dvh place-items-center text-[var(--ink-soft)]">{status === 'offline' ? 'الغرفة غير موجودة أو غير متاحة' : 'جارٍ الاتصال بالغرفة…'}</div>;
  const v = view as PublicView;
  const cur = v.phase === 'playing' ? v.teams.find((t) => t.id === v.turnOrder[v.turnIndex]) : null;
  const att = v.attackTeamId ? v.teams.find((t) => t.id === v.attackTeamId) : null;
  const showQ = a && (!a.result || recent === a.id) && !v.attackTeamId;
  const joinUrl = `${location.origin}/#/`;
  return (
    <div className="relative h-dvh overflow-hidden">
      <Arena view={v} theme={theme} onCinematic={setCine} allowSkip={false} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-5">
        <div className="panel rounded-2xl px-5 py-3"><Brand compact /></div>
        <div className={`panel rounded-2xl px-6 py-2.5 text-center transition-opacity ${cine ? 'opacity-0' : ''}`}>
          <div className="text-xs text-[var(--ink-soft)]">{v.phase === 'lobby' ? 'بانتظار بدء المباراة' : v.settings.winMode === 'points' ? `الجولة ${v.round} من ${v.settings.rounds}` : `إسقاط الملك · الجولة ${v.round}`}</div>
          <div className="text-lg font-semibold">{att ? <><span style={{ color: att.color }}>{att.name}</span> يختار هدفه</> : cur ? <>الدور على <span style={{ color: cur.color }}>{cur.name}</span></> : 'أسوار الحصن'}</div>
        </div>
        <div className="w-[120px]" />
      </div>
      <div className={`absolute right-5 top-[96px] z-20 w-[min(290px,32vw)] transition-opacity ${cine ? 'opacity-0' : ''}`}><Scoreboard view={v} /></div>
      {v.phase === 'lobby' && (
        <div className="absolute bottom-6 left-6 z-20 panel flex items-center gap-5 rounded-3xl p-5">
          <div className="rounded-xl bg-white p-2"><QR value={joinUrl} size={120} /></div>
          <div>
            <div className="text-sm text-[var(--ink-soft)]">للانضمام كفريق</div>
            <div className="mt-1 text-[15px]">امسح الرمز أو افتح الموقع، ثم اكتب</div>
            <div className="mt-1">رمز الغرفة <span className="font-mono text-3xl font-bold tracking-[0.2em]" dir="ltr">{v.roomCode}</span></div>
            <div className="text-xs text-[var(--ink-soft)]">ورمز فريقك الذي يعطيك إياه المقدم</div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {showQ && !cine && (
          <motion.div key={a!.id} className="absolute bottom-6 left-1/2 z-20 w-[min(980px,calc(100vw-40px))] -translate-x-1/2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            <div className="panel rounded-3xl p-6"><QuestionCard view={v} big /></div>
          </motion.div>
        )}
      </AnimatePresence>
      {v.paused && <div className="absolute inset-0 z-30 grid place-items-center bg-[rgba(4,8,16,0.4)]"><div className="panel rounded-3xl px-10 py-6 text-2xl font-semibold">استراحة قصيرة</div></div>}
      {v.phase === 'ended' && !cine && <Winner view={v} />}
      {status !== 'live' && <div className="absolute bottom-3 right-3 z-40 rounded-lg bg-[#7a2a1f] px-3 py-1.5 text-xs text-white">إعادة الاتصال…</div>}
    </div>
  );
}
