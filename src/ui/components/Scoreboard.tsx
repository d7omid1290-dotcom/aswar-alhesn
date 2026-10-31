import { motion } from 'motion/react';
import type { PublicView } from '@/engine/types';
import { fmtPoints, cn } from '@/lib/utils';
import { Crown, Wifi } from 'lucide-react';

export function Scoreboard({ view, compact }: { view: PublicView; compact?: boolean }) {
  const current = view.phase === 'playing' ? view.turnOrder[view.turnIndex] : null;
  const ranked = [...view.teams].sort((a, b) => b.score - a.score);
  const rankOf = (id: string) => ranked.findIndex((t) => t.id === id);
  return (
    <div className={cn('flex flex-col gap-2', compact && 'gap-1.5')}>
      {view.teams.map((t) => {
        const active = t.id === current;
        const attacking = view.attackTeamId === t.id;
        return (
          <motion.div layout key={t.id}
            className={cn('panel relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-2.5 transition-[box-shadow,opacity]', t.eliminated && 'opacity-50', active && 'ring-2 ring-[var(--accent)]')}>
            <span className="absolute inset-y-0 right-0 w-1.5" style={{ background: t.color }} />
            <div className="min-w-0 flex-1 ps-1">
              <div className="flex items-center gap-1.5">
                <span className={cn('truncate font-semibold', compact ? 'text-sm' : 'text-[15px]')}>{t.name}</span>
                {view.settings.winMode === 'king' && !t.kingDown && <Crown size={14} className="shrink-0 text-[var(--accent)]" />}
                {t.connected && <Wifi size={12} className="shrink-0 text-emerald-500" />}
              </div>
              <div className="text-xs text-[var(--ink-soft)]">
                {t.eliminated ? 'خرج من المنافسة' : t.rebuild.active ? `يعيد بناء الملك ${t.rebuild.progress}/${view.settings.rebuildKing.required}` : t.kingDown ? 'سقط الملك' : attacking ? 'يملك حق الهجوم' : active ? 'دوره الآن' : `المركز ${rankOf(t.id) + 1}`}
              </div>
            </div>
            <motion.div key={t.score} initial={{ scale: 1.25, color: '#f0d590' }} animate={{ scale: 1, color: 'var(--ink)' }} transition={{ duration: 0.5 }}
              className={cn('font-bold tabular', compact ? 'text-lg' : 'text-2xl')}>{fmtPoints(t.score)}</motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}
