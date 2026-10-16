'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type T = { id: number; text: string; kind?: 'error' | 'info' };
let push: (t: T) => void = () => {};
let seq = 0;
export function toast(text: string, kind: T['kind'] = 'info') { push({ id: ++seq, text, kind }); }

export function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    push = (t) => {
      setItems((x) => [...x.slice(-2), t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 2800);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div key={t.id} initial={{ y: 30, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, y: 10 }}
            className={cn('rounded-xl px-5 py-2.5 font-semibold shadow-xl', t.kind === 'error' ? 'bg-destructive text-white' : 'bg-foreground text-background')}>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
