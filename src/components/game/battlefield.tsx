'use client';

import { useEffect, useRef } from 'react';
import type { BattlefieldScene, BoardData, StrikeAnim } from './battlefield-scene';
import { play } from '@/lib/sfx';
import { cn } from '@/lib/utils';

interface Props {
  board: BoardData;
  strike?: StrikeAnim | null;
  onTile?: (teamId: string, cell: number) => void;
  className?: string;
}

/** غلاف React لمشهد Phaser (يُحمّل في المتصفح فقط) */
export function Battlefield({ board, strike, onTile, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BattlefieldScene | null>(null);
  const latest = useRef({ board, onTile });
  latest.current = { board, onTile };
  const shown = useRef<string | null>(null);

  useEffect(() => {
    let game: import('phaser').Game | null = null;
    let dead = false;
    (async () => {
      const [Phaser, mod] = await Promise.all([import('phaser'), import('./battlefield-scene')]);
      await document.fonts?.ready;
      if (dead || !host.current) return;
      const sc = new mod.BattlefieldScene();
      sc.onTile = (t, c) => latest.current.onTile?.(t, c);
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: host.current, transparent: true, antialias: true,
        scale: { mode: Phaser.Scale.RESIZE, width: host.current.clientWidth, height: host.current.clientHeight },
        scene: sc, banner: false, audio: { noAudio: true },
      });
      scene.current = sc;
      sc.setBoard(latest.current.board);
    })();
    return () => { dead = true; game?.destroy(true); scene.current = null; };
  }, []);

  // الضربة قبل تحديث اللوحة: يبدأ المشهد التحريك على الحالة القديمة ثم يطبّق الجديدة لحظة الإصابة
  useEffect(() => {
    if (!strike || strike.id === shown.current) return;
    shown.current = strike.id;
    scene.current?.playStrike(strike, { launch: () => play('launch'), boom: () => play('boom') });
  }, [strike]);

  useEffect(() => { scene.current?.setBoard(board); }, [board]);

  return <div ref={host} className={cn('relative h-full w-full min-h-0 overflow-hidden', className)} data-testid="battlefield" />;
}
