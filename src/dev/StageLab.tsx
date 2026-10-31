import { useEffect, useRef } from 'react';
import { Stage } from '@/game3d/stage';
import { DEFAULT_ELEMENTS } from '@/engine/defaults';
import type { ElementKind } from '@/engine/types';

// صفحة تجربة للمسرح ثلاثي الأبعاد (للتطوير): /#/lab?n=4&view=fortress&strike=1
export default function StageLab() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const n = Number(q.get('n') || 4);
    const st = new Stage(ref.current!);
    if (q.get('instant')) st.instant = true;
    (window as any).stage = st;
    const colors = ['#2f6fd6', '#c8463d', '#2f9e6a', '#d39b2a', '#8a55c9', '#1fa3a8', '#d0621f', '#6b7a8f'];
    const names = ['حصن الشمال', 'حصن الجنوب', 'حصن الشرق', 'حصن الغرب', 'حصن الوادي', 'حصن الساحل', 'حصن الجبل', 'الحصن القديم'];
    const teams = Array.from({ length: n }, (_, i) => ({ id: 't' + i, name: names[i], color: colors[i] }));
    const kinds = Object.fromEntries(DEFAULT_ELEMENTS.map((e) => [e.id, e.kind])) as Record<string, ElementKind>;
    const layout = q.get('hidden') ? ['king', 'knight', 'guard', 'empty', 'market', 'empty', 'guard', 'artillery', 'knight', 'empty', 'market', 'empty', 'guard', 'empty', 'empty'] : null;
    st.setup(teams, 15, layout, kinds);
    if (q.get('night')) st.setTheme('night');
    const hits = q.get('hits');
    if (hits) st.sync(teams.map((t, i) => ({ id: t.id, name: t.name, color: t.color, locked: true, score: 0, kingDown: i === 1, eliminated: false, rebuild: { active: false, progress: 0, attempts: 0 }, hits: i === 1 ? { 2: { element: 'market', kind: 'market', points: 200, by: 't0', at: 0, visualSlot: 2 }, 7: { element: 'empty', kind: 'empty', points: 0, by: 't0', at: 0, visualSlot: 7 } } : {} })) as any);
    if (q.get('view') === 'fortress') st.focusTeam('t1', { pick: true, pickable: [...Array(15).keys()] });
    if (q.get('strike')) setTimeout(() => st.playStrike({ attackerId: 't0', targetId: 't1', visualSlot: 4, kind: (q.get('kind') as ElementKind) || 'king', name: 'الملك', points: 500, kingFell: (q.get('kind') || 'king') === 'king' }, (ph, d) => console.log('phase', ph, d)), 500);
    return () => st.dispose();
  }, []);
  return <div ref={ref} className="stage-host" style={{ position: 'fixed', inset: 0 }} />;
}
