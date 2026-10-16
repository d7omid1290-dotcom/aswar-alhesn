'use client';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { elById, teamById } from '@/lib/game/engine';
import type { GameState, Strike } from '@/lib/game/types';
import { play, vibrate } from '@/lib/sfx';
import { ar, cn } from '@/lib/utils';
import { ElementIcon } from './element-icon';
import { burst } from './confetti';

/** بطاقة نتيجة الضربة الكبيرة (نصف الشاشة) — تظهر لحظة ارتطام القذيفة */
export function StrikeReveal({ state, delay = 1150, compact }: { state: GameState; delay?: number; compact?: boolean }) {
  const [shown, setShown] = useState<Strike | null>(null);
  const seen = useRef<string | null>(null);
  const s = state.lastStrike;

  useEffect(() => {
    if (!s || s.id === seen.current) return;
    const first = seen.current === null;
    seen.current = s.id;
    if (first && Date.now() - s.at > 8000) return; // لا نعيد عرض ضربة قديمة عند فتح الصفحة
    const t1 = setTimeout(() => {
      setShown(s);
      const el = elById(state.settings, s.el);
      vibrate([80, 40, 160]);
      setTimeout(() => {
        if (el?.effect === 'king') { play('fanfare'); burst(160); }
        else if (s.points < 0) play('fail');
        else if (s.points > 0) { play('coin'); if (s.points >= 30) burst(70); }
        else play('thud');
      }, 350);
    }, delay);
    const t2 = setTimeout(() => setShown((x) => (x?.id === s.id ? null : x)), delay + 5200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [s, delay, state.settings]);

  return (
    <AnimatePresence>
      {shown && <RevealCard key={shown.id} strike={shown} state={state} compact={compact} onClose={() => setShown(null)} />}
    </AnimatePresence>
  );
}

function RevealCard({ strike, state, compact, onClose }: { strike: Strike; state: GameState; compact?: boolean; onClose: () => void }) {
  const att = teamById(state, strike.attacker)!, tgt = teamById(state, strike.target)!;
  const el = elById(state.settings, strike.el) ?? { id: 'empty', name: 'فراغ', points: 0, count: 0 };
  const kind = el.effect === 'king' ? 'king' : el.effect === 'trap' ? 'trap' : el.effect === 'extra' ? 'extra' : strike.points > 0 ? 'good' : 'empty';
  const title = { king: 'سقط الملك!', trap: 'وقع في الفخ!', extra: 'أصاب المدفعية!', good: `أصاب ${el.name}!`, empty: 'ضربة في الفراغ' }[kind];
  const sub = { king: `ضربة قاضية لحصن ${tgt.name}`, trap: `${att.name} يخسر نقاطًا`, extra: 'غنيمة: ضربة إضافية', good: `أحسنتم يا ${att.name}`, empty: 'لم يصب شيئًا هذه المرة' }[kind];
  const mv = useMotionValue(0);
  const txt = useTransform(mv, (v) => (strike.points ? (v > 0 ? '+' : v < 0 ? '−' : '') + ar(Math.abs(Math.round(v))) : 'صفر'));
  useEffect(() => { const c = animate(mv, strike.points, { duration: 0.9, delay: 0.35, ease: 'easeOut' }); return () => c.stop(); }, [mv, strike.points]);
  const tone = kind === 'trap' ? 'text-destructive' : kind === 'empty' ? 'text-muted-foreground' : kind === 'king' ? 'text-gold' : 'text-success';

  return (
    <motion.div className="fixed inset-0 z-50 grid cursor-pointer place-items-center bg-black/45 backdrop-blur-[2px]" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="strike-reveal">
      <motion.div
        initial={{ scale: 0.4, rotate: -6, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className={cn('pattern relative flex flex-col overflow-hidden rounded-[2rem] border-2 border-gold bg-card shadow-[0_30px_100px_-20px_rgb(0_0_0/.7)]',
          compact ? 'h-[72dvh] w-[92vw]' : 'h-[72vh] w-[min(52vw,900px)] min-w-[560px]')}>
        <div className="flex flex-wrap items-center justify-center gap-2 bg-muted/70 p-3 text-lg">
          <span className="rounded-full px-4 py-1 font-bold text-white" style={{ background: att.color }}>{att.name}</span>
          <span>⚔️</span>
          <span className="rounded-full px-4 py-1 font-bold text-white" style={{ background: tgt.color }}>{tgt.name}</span>
          <span className="ms-3 font-display text-xl text-gold">الخانة {ar(strike.cell + 1)}</span>
        </div>
        <div className="relative grid flex-1 place-items-center">
          <motion.div className="absolute size-[70%] rounded-full" style={{ background: `radial-gradient(circle, ${kind === 'trap' ? '#dc262655' : '#f2c64155'}, transparent 65%)` }}
            initial={{ scale: 0.2 }} animate={{ scale: [0.2, 1.3, 1] }} transition={{ duration: 0.8 }} />
          <div className="relative flex flex-col items-center text-center">
            <motion.div initial={{ y: -80, scale: 0.3, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12, delay: 0.1 }}>
              <ElementIcon id={el.id} className={compact ? 'size-36' : 'size-[min(26vh,240px)]'} />
            </motion.div>
            <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className={cn('font-display leading-tight', compact ? 'text-4xl' : 'text-6xl', kind === 'king' && 'text-gold')}>{title}</motion.h2>
            <div className={cn('flex items-baseline gap-3 font-display leading-none', tone)}>
              <motion.span dir="ltr" className={compact ? 'text-7xl' : 'text-[9rem]'} initial={{ scale: 0.5 }} animate={{ scale: [0.5, 1.25, 1] }} transition={{ delay: 0.35, duration: 0.7 }}>{txt}</motion.span>
              {strike.points !== 0 && <span className="text-3xl">نقطة</span>}
            </div>
            <p className="mt-1 text-lg font-semibold text-muted-foreground">{sub}{strike.mult > 1 ? ` · مضاعفة ×${ar(strike.mult)}` : ''}</p>
          </div>
        </div>
        <p className="pb-3 text-center text-xs text-muted-foreground">اضغط للمتابعة</p>
      </motion.div>
    </motion.div>
  );
}
