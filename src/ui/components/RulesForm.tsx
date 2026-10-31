import { useEffect, useState } from 'react';
import type { ElementDef, Settings, Question } from '@/engine/types';
import { Field, Input, Segmented, Stepper, Switch } from '../kit/controls';
import { Button } from '../kit/button';
import { ELEMENT_META } from '@/engine/defaults';
import { validateComposition } from '@/engine/engine';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="border-b hairline py-4 first:pt-0 last:border-0">
      <h3 className="mb-1 text-[15px] font-semibold">{title}</h3>
      {hint && <p className="mb-3 text-xs text-[var(--ink-soft)]">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-[15px]">{label}</span>{children}</div>;
}

export function RulesForm({ s, playing, onPatch, questions }: { s: Settings; playing: boolean; onPatch: (p: Partial<Settings>) => void; questions: Question[] }) {
  const cats = Array.from(new Set(questions.map((q) => q.category)));
  return (
    <div>
      <Section title="نظام الفوز" hint={playing ? 'لا يمكن تغييره أثناء المباراة' : undefined}>
        <div className={cn(playing && 'pointer-events-none opacity-50')}>
          <Segmented value={s.winMode} onChange={(v) => onPatch({ winMode: v })} options={[{ value: 'points', label: 'أعلى النقاط' }, { value: 'king', label: 'إسقاط الملك' }]} />
        </div>
        <p className="text-xs text-[var(--ink-soft)]">{s.winMode === 'points' ? 'يفوز صاحب أعلى مجموع عند انتهاء الجولات أو الوقت.' : 'من يُصاب ملكه يخرج، ويفوز آخر حصن صامد.'}</p>
        {s.winMode === 'points' ? (
          <Row label="عدد الجولات"><Stepper value={s.rounds} min={1} max={50} onChange={(v) => onPatch({ rounds: v })} /></Row>
        ) : (
          <>
            <Switch checked={s.rebuildKing.enabled} onChange={(v) => onPatch({ rebuildKing: { ...s.rebuildKing, enabled: v } })} label="إعادة بناء الملك" hint="يعود الفريق إذا أجاب عددًا من الأسئلة، ويكون حصنه محصنًا أثناء البناء" />
            {s.rebuildKing.enabled && (
              <>
                <Row label="الإجابات الصحيحة المطلوبة"><Stepper value={s.rebuildKing.required} min={1} max={10} onChange={(v) => onPatch({ rebuildKing: { ...s.rebuildKing, required: v, maxAttempts: Math.max(v, s.rebuildKing.maxAttempts) } })} /></Row>
                <Row label="أقصى عدد محاولات"><Stepper value={s.rebuildKing.maxAttempts} min={s.rebuildKing.required} max={20} onChange={(v) => onPatch({ rebuildKing: { ...s.rebuildKing, maxAttempts: v } })} /></Row>
              </>
            )}
          </>
        )}
        <Row label="مدة المباراة (دقائق، 0 بلا حد)"><Stepper value={s.matchMinutes} min={0} max={240} step={5} onChange={(v) => onPatch({ matchMinutes: v })} /></Row>
      </Section>
      <Section title="الأسئلة">
        <Row label="وقت السؤال (ثانية)"><Stepper value={s.questionSeconds} min={5} max={300} step={5} onChange={(v) => onPatch({ questionSeconds: v })} /></Row>
        <Field label="الصعوبة">
          <Segmented value={s.difficulty} onChange={(v) => onPatch({ difficulty: v })} options={[{ value: 'any', label: 'الكل' }, { value: 'easy', label: 'سهل' }, { value: 'medium', label: 'متوسط' }, { value: 'hard', label: 'صعب' }]} />
        </Field>
        <Field label="الفئة العمرية">
          <Segmented value={s.ageGroup} onChange={(v) => onPatch({ ageGroup: v })} options={[{ value: 'any', label: 'الكل' }, { value: 'kids', label: 'أطفال' }, { value: 'teens', label: 'ناشئة' }, { value: 'adults', label: 'كبار' }]} />
        </Field>
        <Field label="المجالات (بلا اختيار = الكل)">
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => {
              const on = s.categories.includes(c);
              return <button key={c} type="button" onClick={() => onPatch({ categories: on ? s.categories.filter((x) => x !== c) : [...s.categories, c] })}
                className={cn('rounded-full border px-3 py-1 text-sm transition-colors', on ? 'border-[var(--accent)] bg-[var(--accent)]/15' : 'border-[var(--panel-border)] text-[var(--ink-soft)]')}>{c}</button>;
            })}
          </div>
        </Field>
      </Section>
      <Section title="التشغيل">
        <Field label="من يدير اللعب">
          <Segmented value={s.opMode} onChange={(v) => onPatch({ opMode: v })} options={[{ value: 'host', label: 'المقدم وحده' }, { value: 'teams', label: 'الفرق من جوالاتها' }, { value: 'mixed', label: 'مختلط' }]} />
        </Field>
        {!playing && (
          <Field label="طريقة الإجابة">
            <Segmented value={s.answerMode} onChange={(v) => onPatch({ answerMode: v })} options={[{ value: 'host', label: 'شفهيًا ويحكم المقدم' }, { value: 'mobile', label: 'من الجوال' }]} />
          </Field>
        )}
        <Field label="شكل الحصن" hint={s.fortressStyle === 'numbered' ? 'أرقام ظاهرة فوق مواقع متشابهة، والعناصر سرية حتى الإصابة.' : 'العناصر ظاهرة في القلعة، والأرقام سرية: يختار المهاجم رقمًا ويرى أين يسقط.'}>
          <div className={cn(playing && 'pointer-events-none opacity-50')}>
            <Segmented value={s.fortressStyle} onChange={(v) => onPatch({ fortressStyle: v })} options={[{ value: 'numbered', label: 'مواقع مرقمة' }, { value: 'hiddenNumbers', label: 'عناصر ظاهرة وأرقام مخفية' }]} />
          </div>
        </Field>
      </Section>
      <Section title="المؤثرات والصوت">
        <Field label="المؤثرات السينمائية">
          <Segmented value={s.effects} onChange={(v) => onPatch({ effects: v })} options={[{ value: 'full', label: 'كاملة' }, { value: 'reduced', label: 'مختصرة' }, { value: 'off', label: 'بدون مشهد' }]} />
        </Field>
        <Field label={`مستوى الصوت ${Math.round(s.volume * 100)}٪`}>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => onPatch({ volume: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
        </Field>
      </Section>
    </div>
  );
}

export function ElementsForm({ s: live, onPatch: apply }: { s: Settings; onPatch: (p: Partial<Settings>) => void }) {
  // مسودة محلية: تُعتمد فقط عندما تصبح التركيبة صحيحة
  const [draft, setDraft] = useState<Pick<Settings, 'slotCount' | 'elements'>>({ slotCount: live.slotCount, elements: live.elements });
  const liveKey = JSON.stringify([live.slotCount, live.elements]);
  useEffect(() => setDraft({ slotCount: live.slotCount, elements: live.elements }), [liveKey]);
  const s = { ...live, ...draft };
  const onPatch = (p: Partial<Settings>) => setDraft((d) => ({ slotCount: p.slotCount ?? d.slotCount, elements: p.elements ?? d.elements }));
  const dirty = JSON.stringify([draft.slotCount, draft.elements]) !== liveKey;
  const err = validateComposition(s);
  const set = (i: number, p: Partial<ElementDef>) => onPatch({ elements: s.elements.map((e, k) => (k === i ? { ...e, ...p } : e)) });
  const autoEmpty = () => {
    const others = s.elements.filter((e) => e.kind !== 'empty').reduce((a, e) => a + e.count, 0);
    const hasEmpty = s.elements.some((e) => e.kind === 'empty');
    const elements = hasEmpty ? s.elements.map((e) => (e.kind === 'empty' ? { ...e, count: Math.max(0, s.slotCount - others) } : e)) : [...s.elements, { id: 'empty', name: 'موقع فارغ', kind: 'empty' as const, count: Math.max(0, s.slotCount - others), points: 0 }];
    onPatch({ elements });
  };
  return (
    <div>
      <Section title="حجم الحصن" hint="غيّر عدد المواقع ثم اضبط الأعداد. تغيير التركيبة يمسح التوزيع الحالي للحصون.">
        <Row label="عدد المواقع"><Stepper value={s.slotCount} min={4} max={40} onChange={(v) => onPatch({ slotCount: v })} /></Row>
      </Section>
      <Section title="العناصر والنقاط">
        <div className="overflow-hidden rounded-xl border hairline">
          <div className="grid grid-cols-[1fr_88px_96px_36px] gap-2 bg-[var(--line)] px-3 py-2 text-xs font-medium text-[var(--ink-soft)]"><span>العنصر</span><span>العدد</span><span>النقاط</span><span /></div>
          {s.elements.map((e, i) => (
            <div key={e.id} className="grid grid-cols-[1fr_88px_96px_36px] items-center gap-2 border-t hairline px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-lg" style={{ color: ELEMENT_META[e.kind].tint }}>{ELEMENT_META[e.kind].glyph}</span>
                <Input value={e.name} onChange={(ev) => set(i, { name: ev.target.value })} className="h-8" />
              </div>
              <Stepper value={e.count} min={0} max={40} onChange={(v) => set(i, { count: v })} />
              <Input type="number" value={e.points} onChange={(ev) => set(i, { points: Math.trunc(Number(ev.target.value) || 0) })} className="h-8 tabular" />
              {e.kind === 'custom' ? <button className="text-[var(--ink-soft)] hover:text-[#d0583a]" onClick={() => onPatch({ elements: s.elements.filter((_, k) => k !== i) })}><Trash2 size={16} /></button> : <span />}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onPatch({ elements: [...s.elements, { id: 'c' + Date.now().toString(36), name: 'عنصر جديد', kind: 'custom', count: 0, points: 50 }] })}><Plus /> عنصر مخصص</Button>
          <Button size="sm" variant="outline" onClick={autoEmpty}><Wand2 /> أكمل بالمواقع الفارغة</Button>
          <span className={cn('ms-auto text-sm', err ? 'text-[#d0583a]' : 'text-emerald-600 dark:text-emerald-400')}>{err ?? 'التركيبة صحيحة'}</span>
        </div>
        {dirty && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft({ slotCount: live.slotCount, elements: live.elements })}>تراجع</Button>
            <Button size="sm" variant="gold" disabled={!!err} onClick={() => apply({ slotCount: draft.slotCount, elements: draft.elements })}>اعتماد التركيبة</Button>
          </div>
        )}
      </Section>
    </div>
  );
}
