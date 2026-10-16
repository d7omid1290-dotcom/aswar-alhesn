import type { GameState } from '@/lib/game/types';
import type { BoardData, CastleData } from './battlefield-scene';

/** تحويل حالة اللعبة إلى بيانات رسم لساحة Phaser */
export function boardFrom(state: GameState, dark: boolean, opts: {
  only?: string[]; reveal?: (teamId: string) => boolean; targetable?: (teamId: string) => boolean;
  highlight?: (teamId: string, idx: number) => CastleData['highlight']; selected?: BoardData['selected']; showHeader?: boolean;
} = {}): BoardData {
  const teams = opts.only ? state.teams.filter((t) => opts.only!.includes(t.id)) : state.teams;
  const ls = state.lastStrike;
  return {
    gridSize: state.settings.gridSize, dark, showHeader: opts.showHeader,
    colors: Object.fromEntries(state.teams.map((t) => [t.id, t.color])),
    castles: teams.map((t) => ({
      id: t.id, name: t.name, color: t.color, score: t.score, layout: t.layout, hits: t.hits, kingDown: t.kingDown,
      reveal: opts.reveal?.(t.id) ?? false, targetable: opts.targetable?.(t.id) ?? false,
      highlight: opts.highlight?.(t.id, state.teams.indexOf(t)) ?? null,
    })),
    selected: opts.selected ?? null,
    last: ls ? { teamId: ls.target, cell: ls.cell } : null,
  };
}
