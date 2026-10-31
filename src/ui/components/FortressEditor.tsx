import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { ElementDef, Hit, Settings } from '@/engine/types';
import { ELEMENT_META } from '@/engine/defaults';
import { cn } from '@/lib/utils';
import { Shuffle, Eraser } from 'lucide-react';
import { Button } from '../kit/button';

// محرر الحصن: اختر عنصرًا ثم انقر موقعًا، أو اسحبه وأفلته. اسحب موقعًا إلى آخر للتبديل.
export function FortressEditor({ settings, fortress, onChange, locked, hits, onRandom }: {
  settings: Settings; fortress: (string | null)[]; onChange?: (f: (string | null)[]) => void; locked?: boolean; hits?: Record<number, Hit>; onRandom?: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ el: string; from: number | null; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const counts = new Map<string, number>();
  for (const id of fortress) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const remaining = (e: ElementDef) => e.count - (counts.get(e.id) ?? 0);
  const n = settings.slotCount;
  const cols = n <= 9 ? 3 : n <= 16 ? 4 : n <= 25 ? 5 : 6;
  const editable = !locked && !!onChange;
  const pickedRef = useRef(picked);
  pickedRef.current = picked;

  const place = (slot: number, el: string | null, from: number | null = null) => {
    if (!editable || hits?.[slot]) return;
    const f = fortress.slice();
    if (from != null) {
      [f[slot], f[from]] = [f[from], f[slot]];
    } else if (el) {
      if (f[slot] === el) f[slot] = null;
      else {
        const def = settings.elements.find((e) => e.id === el)!;
        if (remaining(def) <= 0 && f[slot] !== el) return;
        f[slot] = el;
      }
    } else f[slot] = null;
    onChange!(f);
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]') as HTMLElement | null;
      setOver(t ? Number(t.dataset.slot) : null);
    };
    const up = (e: PointerEvent) => {
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]') as HTMLElement | null;
      if (t && drag) place(Number(t.dataset.slot), drag.el, drag.from);
      setDrag(null);
      setOver(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.el, drag?.from]);

  const startDrag = (e: React.PointerEvent, el: string, from: number | null) => {
    if (!editable) return;
    const sx = e.clientX, sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
        window.removeEventListener('pointermove', onMove);
        setDrag({ el, from, x: ev.clientX, y: ev.clientY });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', onMove), { once: true });
  };

  const filled = fortress.filter(Boolean).length;
  return (
    <div className="select-none">
      {editable && (
        <div className="mb-3 flex flex-wrap gap-2">
          {settings.elements.map((e) => {
            const m = ELEMENT_META[e.kind];
            const left = remaining(e);
            return (
              <button key={e.id} type="button" onClick={() => setPicked(picked === e.id ? null : e.id)} onPointerDown={(ev) => left > 0 && startDrag(ev, e.id, null)}
                className={cn('flex touch-none items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-[border-color,background-color,opacity]', picked === e.id ? 'border-[var(--accent)] bg-[var(--accent)]/15' : 'border-[var(--panel-border)] bg-[var(--panel-solid)]', left <= 0 && 'opacity-40')}>
                <span className="text-lg" style={{ color: m.tint }}>{m.glyph}</span>
                <span className="font-medium">{e.name}</span>
                <span className="rounded-md bg-[var(--line)] px-1.5 text-xs tabular">{left}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {fortress.map((id, i) => {
          const def = id ? settings.elements.find((e) => e.id === id) : null;
          const m = def ? ELEMENT_META[def.kind] : null;
          const hit = hits?.[i];
          return (
            <motion.button key={i} type="button" data-slot={i} layout={false}
              onClick={() => (pickedRef.current ? place(i, pickedRef.current) : id && place(i, null))}
              onPointerDown={(ev) => id && !hit && startDrag(ev, id, i)}
              className={cn('relative flex aspect-square touch-none flex-col items-center justify-center rounded-xl border text-center transition-[border-color,background-color,transform] duration-150',
                over === i ? 'scale-[1.04] border-[var(--accent)] bg-[var(--accent)]/20' : def ? 'border-[var(--panel-border)] bg-[var(--panel-solid)]' : 'border-dashed border-[var(--panel-border)] bg-transparent',
                hit && 'opacity-60')}>
              <span className="absolute right-1.5 top-1 text-[11px] font-bold text-[var(--ink-soft)] tabular">{i + 1}</span>
              {m && <span className="text-2xl leading-none" style={{ color: m.tint }}>{m.glyph}</span>}
              {def && <span className="mt-1 max-w-full truncate px-1 text-[11px] font-medium">{def.name}</span>}
              {hit && <span className="absolute inset-0 grid place-items-center rounded-xl bg-[rgba(120,30,20,0.45)] text-xs font-bold text-white">أُصيب</span>}
            </motion.button>
          );
        })}
      </div>
      {editable && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-[var(--ink-soft)]">وُزّع {filled} من {n}</span>
          <div className="ms-auto flex gap-2">
            {onRandom && <Button size="sm" variant="outline" onClick={onRandom}><Shuffle /> عشوائي</Button>}
            <Button size="sm" variant="ghost" onClick={() => onChange!(new Array(n).fill(null))}><Eraser /> مسح</Button>
          </div>
        </div>
      )}
      {drag && (
        <div className="pointer-events-none fixed z-[80] grid h-14 w-14 place-items-center rounded-xl border-2 border-[var(--accent)] bg-[var(--panel-solid)] text-2xl shadow-xl"
          style={{ left: drag.x - 28, top: drag.y - 28, color: ELEMENT_META[settings.elements.find((e) => e.id === drag.el)!.kind].tint }}>
          {ELEMENT_META[settings.elements.find((e) => e.id === drag.el)!.kind].glyph}
        </div>
      )}
    </div>
  );
}
