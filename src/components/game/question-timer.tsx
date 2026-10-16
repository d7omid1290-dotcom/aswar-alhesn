'use client';
import { useEffect, useRef, useState } from 'react';
import { play } from '@/lib/sfx';
import { ar, cn } from '@/lib/utils';

export function QuestionTimer({ startedAt, total, size = 64, silent }: { startedAt: number; total: number; size?: number; silent?: boolean }) {
  const [left, setLeft] = useState(total);
  const last = useRef(-1);
  useEffect(() => {
    const tick = () => {
      const l = Math.max(0, total - (Date.now() - startedAt) / 1000);
      setLeft(l);
      const sec = Math.ceil(l);
      if (!silent && sec !== last.current) {
        if (sec <= 5 && sec > 0) play('tick');
        if (sec === 0 && last.current > 0) play('fail');
      }
      last.current = sec;
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [startedAt, total, silent]);
  const p = left / total, r = size / 2 - 5, C = 2 * Math.PI * r, low = left <= 5;
  return (
    <div className={cn('relative grid shrink-0 place-items-center', low && 'animate-pulse')} style={{ width: size, height: size }} data-testid="timer">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={low ? 'var(--destructive)' : 'var(--gold)'} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - p)} style={{ transition: 'stroke-dashoffset .2s linear' }} />
      </svg>
      <span className={cn('absolute font-display text-2xl', low && 'text-destructive')}>{ar(Math.ceil(left))}</span>
    </div>
  );
}
