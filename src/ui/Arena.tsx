import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Stage, type StrikePhase } from '@/game3d/stage';
import type { AnyView, ElementKind } from '@/engine/types';
import { ELEMENT_META } from '@/engine/defaults';
import { sound } from '@/lib/sound';
import { fmtPoints } from '@/lib/utils';
import { FastForward } from 'lucide-react';

export interface Selection {
  attackerId: string;
  /** الحصن المختار حاليًا (null = اختيار من الخريطة) */
  targetId: string | null;
  slot: number | null;
}

interface Props {
  view: AnyView;
  theme: 'dark' | 'light';
  selection?: Selection | null;
  onPickCastle?: (teamId: string) => void;
  onPickSlot?: (slot: number) => void;
  /** يعرض حصنًا معينًا دون اختيار (لوحة المقدم أثناء الإعداد) */
  previewTeamId?: string | null;
  onCinematic?: (busy: boolean) => void;
  allowSkip?: boolean;
}

export function Arena({ view, theme, selection, onPickCastle, onPickSlot, previewTeamId, onCinematic, allowSkip = true }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const lastStrikeRef = useRef<string | null | undefined>(undefined);
  const [phase, setPhase] = useState<StrikePhase | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [reveal, setReveal] = useState<{ kind: ElementKind; name: string; points: number; kingFell: boolean; attacker: string; target: string; color: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [cine, setCine] = useState(false);

  // إنشاء المسرح مرة واحدة
  useEffect(() => {
    let st: Stage | null = null;
    try {
      st = new Stage(hostRef.current!);
      stageRef.current = st;
      setReady(true);
    } catch (e) {
      console.error('WebGL', e);
    }
    return () => { st?.dispose(); stageRef.current = null; };
  }, []);

  const kinds = Object.fromEntries(view.settings.elements.map((e) => [e.id, e.kind])) as Record<string, ElementKind>;

  // إعداد الحصون والمزامنة وتشغيل مشهد الضربة الجديد
  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    st.setup(view.teams.map((t) => ({ id: t.id, name: t.name, color: t.color })), view.settings.slotCount, view.publicLayout, kinds);
    st.setEffects(view.settings.effects);
    const ls = view.lastStrike;
    if (lastStrikeRef.current === undefined) lastStrikeRef.current = ls?.id ?? null; // لا يعاد عرض ضربة قديمة عند فتح الشاشة
    if (ls && ls.id !== lastStrikeRef.current) {
      lastStrikeRef.current = ls.id;
      const att = view.teams.find((t) => t.id === ls.attacker);
      const tgt = view.teams.find((t) => t.id === ls.target);
      const def = view.settings.elements.find((e) => e.id === ls.element);
      onCinematic?.(true);
      setCine(true);
      void st.playStrike(
        { attackerId: ls.attacker, targetId: ls.target, visualSlot: ls.visualSlot, kind: ls.kind, name: def?.name ?? '', points: ls.points, kingFell: ls.kingFell },
        (ph, data) => {
          setPhase(ph);
          if (ph === 'prep') sound.play('steam', 0.6);
          if (ph === 'countdown') { setCount(data); sound.play('countdown'); }
          if (ph === 'ignition') { setCount(null); sound.play('launch'); }
          if (ph === 'impact') sound.play(ls.kind === 'empty' ? 'thud' : 'explosion');
          if (ph === 'reveal') {
            sound.play(ls.kingFell ? 'king' : 'reveal');
            setReveal({ ...data, attacker: att?.name ?? '', target: tgt?.name ?? '', color: att?.color ?? '#c9a24a' });
          }
          if (ph === 'return' || ph === 'done') setReveal(null);
          if (ph === 'done') { setPhase(null); setCount(null); setCine(false); onCinematic?.(false); }
        },
      );
    }
    st.sync(view.teams, view.settings.rebuildKing.required);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, ready]);

  useEffect(() => { stageRef.current?.setTheme(theme === 'dark' ? 'night' : 'day'); }, [theme, ready]);

  // وضع الاختيار
  const selKey = JSON.stringify([selection?.attackerId, selection?.targetId, previewTeamId, ready, cine]);
  useEffect(() => {
    const st = stageRef.current;
    if (!st || st.isBusy) return;
    if (selection) {
      const targets = view.teams.filter((t) => t.id !== selection.attackerId && !t.eliminated && !t.rebuild.active).map((t) => t.id);
      st.setPickableCastles(selection.targetId ? [] : targets);
      st.onCastlePick = (id) => targets.includes(id) && onPickCastle?.(id);
      if (selection.targetId) {
        const t = view.teams.find((x) => x.id === selection.targetId)!;
        const pickable = [...Array(view.settings.slotCount).keys()].filter((i) => !t.hits[i]);
        st.onSlotPick = (i) => onPickSlot?.(i);
        void st.focusTeam(selection.targetId, { pick: true, pickable });
      } else if (st.mode !== 'map') void st.showMap();
    } else {
      st.setPickableCastles([]);
      st.onCastlePick = null;
      st.onSlotPick = null;
      if (previewTeamId) void st.focusTeam(previewTeamId);
      else if (st.mode !== 'map') void st.showMap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  useEffect(() => { stageRef.current?.highlightSlot(selection?.slot ?? null); }, [selection?.slot, selection?.targetId]);

  const meta = reveal ? ELEMENT_META[reveal.kind] : null;
  return (
    <div className="absolute inset-0">
      <div ref={hostRef} className="stage-host absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--bg)] text-center text-[var(--ink-soft)]">
          <div>تعذر تشغيل الرسوم ثلاثية الأبعاد على هذا الجهاز.<br />فعّل تسريع الرسوم في المتصفح.</div>
        </div>
      )}

      {/* أشرطة سينمائية أثناء الضربة */}
      <AnimatePresence>
        {phase && phase !== 'done' && view.settings.effects !== 'off' && (
          <>
            <motion.div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[7vh] bg-black" initial={{ y: '-100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} />
            <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[7vh] bg-black" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} />
          </>
        )}
      </AnimatePresence>

      {/* مرحلة التجهيز */}
      <AnimatePresence>
        {(phase === 'prep' || phase === 'countdown') && (
          <motion.div className="pointer-events-none absolute inset-x-0 top-[11vh] z-30 flex justify-center" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="rounded-full border border-[rgba(240,213,144,0.5)] bg-[rgba(8,14,26,0.78)] px-5 py-2 text-sm font-medium text-[#f3ead2]">تجهيز الصاروخ على منصة الإطلاق · تعبئة الوقود · سحب ذراع الخدمة</div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="popLayout">
        {count != null && (
          <motion.div key={count} className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
            initial={{ opacity: 0, scale: 1.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.18 } }} transition={{ type: 'spring', duration: 0.45, bounce: 0.2 }}>
            <span className="gold-text font-display text-[22vh] leading-none drop-shadow-[0_8px_30px_rgba(0,0,0,0.6)]">{count}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* بطاقة النتيجة */}
      <AnimatePresence>
        {reveal && meta && (
          <motion.div className="pointer-events-none absolute inset-0 z-30 flex items-end justify-center pb-[13vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            {reveal.kingFell ? (
              <motion.div className="text-center" initial={{ scale: 0.8, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', duration: 0.6, bounce: 0.3 }}>
                <div className="relative mx-auto inline-block rounded-2xl border-2 border-[#f0d590] bg-[linear-gradient(180deg,#8f2a1f,#5c1610)] px-14 py-5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)]">
                  <div className="font-display text-[9vh] leading-none text-[#fbe7b0]">سقط الملك</div>
                </div>
                <div className="mt-3 inline-block rounded-xl bg-[rgba(8,14,26,0.85)] px-6 py-2.5 text-xl text-[#f3ead2]">
                  انهار برج {reveal.target} · <span className="font-bold text-[#f0d590]">+{fmtPoints(reveal.points)}</span> لـ {reveal.attacker}
                </div>
              </motion.div>
            ) : (
              <motion.div className="flex items-center gap-6 rounded-3xl border border-[rgba(240,213,144,0.55)] bg-[rgba(8,14,26,0.88)] py-5 pe-10 ps-6 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)]"
                initial={{ scale: 0.86, y: 24 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', duration: 0.5, bounce: 0.25 }}>
                <div className="grid h-24 w-24 place-items-center rounded-2xl text-6xl" style={{ background: `color-mix(in srgb, ${meta.tint} 22%, transparent)`, color: meta.tint, border: `2px solid ${meta.tint}` }}>{meta.glyph}</div>
                <div>
                  <div className="text-sm text-[#9aa6ba]">{reveal.attacker} أصاب في {reveal.target}</div>
                  <div className="text-4xl font-bold text-[#f6ecd0]">{reveal.name}</div>
                  <motion.div className="mt-1 text-5xl font-extrabold tabular" style={{ color: reveal.points > 0 ? '#f0d590' : '#8d97a8' }}
                    initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25, type: 'spring', bounce: 0.45 }}>
                    {reveal.points > 0 ? `+${fmtPoints(reveal.points)}` : 'ضربة ضائعة'}
                  </motion.div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {phase && phase !== 'done' && allowSkip && (
        <button onClick={() => stageRef.current?.skip()} className="absolute bottom-[8.5vh] left-6 z-40 inline-flex items-center gap-2 rounded-full bg-[rgba(8,14,26,0.75)] px-4 py-2 text-sm text-[#f3ead2] backdrop-blur hover:bg-[rgba(8,14,26,0.95)]">
          <FastForward size={16} /> تخطي المشهد
        </button>
      )}
    </div>
  );
}
