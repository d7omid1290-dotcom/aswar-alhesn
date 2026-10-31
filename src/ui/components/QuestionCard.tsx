import { motion } from 'motion/react';
import type { PublicView } from '@/engine/types';
import { cn } from '@/lib/utils';
import { useNow } from '../hooks';

const DIFF = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' } as const;

export function TimerRing({ deadline, total, paused, size = 56 }: { deadline: number; total: number; paused?: boolean; size?: number }) {
  const now = useNow(200);
  const left = Math.max(0, deadline - now);
  const frac = Math.min(1, left / (total * 1000));
  const r = size / 2 - 4, c = 2 * Math.PI * r;
  const low = left < 6000;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={5} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={low ? '#d0583a' : 'var(--accent)'} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: paused ? 'none' : 'stroke-dashoffset 0.2s linear' }} />
      </svg>
      <span className={cn('absolute inset-0 grid place-items-center font-bold tabular', low && 'text-[#d0583a]')}>{Math.ceil(left / 1000)}</span>
    </div>
  );
}

/** بطاقة السؤال: تعرض الخيارات، وتبرز الإجابة الصحيحة بعد الحسم */
export function QuestionCard({ view, showAnswer, onChoose, chosen, big }: { view: PublicView; showAnswer?: boolean; onChoose?: (a: string) => void; chosen?: string | null; big?: boolean }) {
  const q = view.question;
  const a = view.attempt;
  if (!q || !a) return null;
  const team = view.teams.find((t) => t.id === a.teamId);
  const resolved = !!a.result;
  const opts = q.type === 'mcq' ? q.options ?? [] : q.type === 'tf' ? ['صح', 'خطأ'] : [];
  const answer = q.answer;
  return (
    <motion.div key={a.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', duration: 0.45, bounce: 0.15 }} className="w-full">
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--ink-soft)]">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-white" style={{ background: team?.color }}>{team?.name}</span>
        <span>{q.category}</span>·<span>{DIFF[q.difficulty]}</span>
        {a.purpose === 'rebuild' && <span className="rounded-full bg-[var(--line)] px-2 py-0.5">سؤال إعادة بناء الملك</span>}
        <span className="ms-auto">{a.mode === 'mobile' ? 'الإجابة من الجوال' : 'الإجابة عبر المقدم'}</span>
      </div>
      <div className="flex items-start gap-4">
        <div className={cn('flex-1 font-semibold leading-relaxed', big ? 'text-[clamp(20px,2.4vw,34px)]' : 'text-xl')}>{q.text}</div>
        {!resolved && <TimerRing deadline={a.deadline} total={view.settings.questionSeconds} paused={view.paused} size={big ? 64 : 52} />}
      </div>
      {opts.length > 0 && (
        <div className={cn('mt-4 grid gap-2', opts.length > 2 ? 'grid-cols-2' : 'grid-cols-2')}>
          {opts.map((o, i) => {
            const isRight = (resolved || showAnswer) && answer != null && o === (q.type === 'tf' ? answer : answer);
            const isChosen = chosen === o || (resolved && a.submitted?.answer === o);
            return (
              <button key={o} disabled={!onChoose || resolved} onClick={() => onChoose?.(o)}
                className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-right transition-[background-color,border-color,transform] duration-150 enabled:active:scale-[0.98]',
                  big ? 'text-[clamp(16px,1.5vw,22px)]' : 'text-base',
                  isRight ? 'border-emerald-500 bg-emerald-500/15' : isChosen ? (resolved ? 'border-[#d0583a] bg-[#d0583a]/15' : 'border-[var(--accent)] bg-[var(--accent)]/15') : 'border-[var(--panel-border)] bg-[var(--panel-solid)] enabled:hover:border-[var(--accent)]')}>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--line)] text-sm font-bold">{'أبجد'[i] ?? i + 1}</span>
                <span className="flex-1">{o}</span>
              </button>
            );
          })}
        </div>
      )}
      {(resolved || showAnswer) && answer && q.type !== 'mcq' && q.type !== 'tf' && (
        <div className="mt-3 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-2.5 text-sm">الإجابة: <b>{answer.split('|')[0]}</b></div>
      )}
      {resolved && (
        <div className={cn('mt-3 text-center text-lg font-bold', a.result === 'correct' ? 'text-emerald-500' : 'text-[#d0583a]')}>
          {a.result === 'correct' ? 'إجابة صحيحة' : a.result === 'timeout' ? 'انتهى الوقت' : 'إجابة خاطئة'}
        </div>
      )}
    </motion.div>
  );
}
