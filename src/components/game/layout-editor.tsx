'use client';
import { motion } from 'motion/react';
import { Dices, Eraser, Sparkles, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cellCount, counts, randomLayout, validLayout } from '@/lib/game/engine';
import type { Settings } from '@/lib/game/types';
import { play } from '@/lib/sfx';
import { useDark } from '@/lib/client/use-dark';
import { ar, cn } from '@/lib/utils';
import { Battlefield } from './battlefield';
import { ElementIcon } from './element-icon';

/** محرر التوزيع السري للحصن: اختر عنصرًا ثم انقر الخانات */
export function LayoutEditor({ settings, initial, color, name, onSave, compact }: {
  settings: Settings; initial: (string | null)[] | null; color: string; name: string; onSave: (layout: string[]) => void; compact?: boolean;
}) {
  const n = cellCount(settings);
  const byId = counts(settings).byId;
  const [layout, setLayout] = useState<(string | null)[]>(() => (initial && validLayout(settings, initial) ? [...initial] : Array(n).fill(null)));
  const placeable = settings.elements.filter((e) => byId[e.id] > 0);
  const left = (id: string) => byId[id] - layout.filter((x) => x === id).length;
  const [sel, setSel] = useState<string>(placeable[0]?.id ?? 'empty');
  const dark = useDark();
  const placed = layout.filter(Boolean).length;
  const complete = placed === n;

  const board = useMemo(() => ({
    gridSize: settings.gridSize, dark, showHeader: false, colors: {},
    castles: [{ id: 'me', name, color, score: 0, layout, hits: {}, reveal: true, editor: true }],
  }), [settings.gridSize, dark, name, color, layout]);

  function onTile(_: string, i: number) {
    play('click');
    setLayout((cur) => {
      const next = [...cur];
      if (next[i]) next[i] = null;
      else {
        let id = sel;
        if (byId[id] - next.filter((x) => x === id).length <= 0) {
          const alt = placeable.find((e) => byId[e.id] - next.filter((x) => x === e.id).length > 0);
          if (!alt) return cur;
          id = alt.id;
          setSel(id);
        }
        next[i] = id;
      }
      return next;
    });
  }
  function fillRest() {
    const rest: string[] = [];
    placeable.forEach((e) => { for (let k = left(e.id); k > 0; k--) rest.push(e.id); });
    rest.sort(() => Math.random() - 0.5);
    setLayout((cur) => cur.map((x) => x ?? rest.pop() ?? null));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className={cn('flex flex-wrap justify-center gap-2', compact && 'gap-1.5')}>
        {placeable.map((e) => {
          const l = left(e.id);
          return (
            <motion.button key={e.id} type="button" whileTap={{ scale: 0.92 }} onClick={() => { setSel(e.id); play('click'); }}
              className={cn('flex items-center gap-1.5 rounded-2xl border-2 bg-card/80 py-1 ps-1.5 pe-2.5 font-semibold transition',
                sel === e.id ? 'border-gold bg-accent shadow-md -translate-y-0.5' : 'border-transparent', l <= 0 && 'opacity-45')}
              data-testid={`pal-${e.id}`}>
              <ElementIcon id={e.id} className={compact ? 'size-8' : 'size-10'} />
              <span className={compact ? 'text-xs' : 'text-sm'}>{e.name}</span>
              <span className={cn('min-w-6 rounded-full px-1.5 text-xs leading-5', l <= 0 ? 'bg-success text-white' : 'bg-primary text-primary-foreground')}>{ar(l)}</span>
            </motion.button>
          );
        })}
      </div>
      <div className="relative min-h-0 flex-1">
        <Battlefield board={board} onTile={onTile} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className={cn('font-semibold text-muted-foreground', compact ? 'w-full text-center text-sm' : 'me-auto')}>
          <b className="text-foreground tabular">{ar(placed)} / {ar(n)}</b> خانة موزعة
        </span>
        <Button variant="outline" size={compact ? 'sm' : 'default'} onClick={() => setLayout(randomLayout(settings))}><Dices /> عشوائي</Button>
        <Button variant="outline" size={compact ? 'sm' : 'default'} onClick={fillRest} disabled={complete}><Sparkles /> أكمل الباقي</Button>
        <Button variant="outline" size={compact ? 'sm' : 'default'} onClick={() => setLayout(Array(n).fill(null))}><Eraser /> مسح</Button>
        <Button size={compact ? 'default' : 'lg'} disabled={!complete} onClick={() => { play('correct'); onSave(layout as string[]); }} data-testid="save-layout"><Check /> حفظ وجاهز</Button>
      </div>
    </div>
  );
}
