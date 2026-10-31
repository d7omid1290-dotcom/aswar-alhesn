import { useMemo, useRef, useState } from 'react';
import type { Question } from '@/engine/types';
import { sanitizeQuestion } from '@/engine/engine';
import { SEED_QUESTIONS } from '@/engine/questions';
import { Dialog } from '../kit/dialog';
import { Button } from '../kit/button';
import { Field, Input, Select } from '../kit/controls';
import { Download, FileUp, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';

const TYPE_LABEL = { mcq: 'اختيار من متعدد', tf: 'صح أو خطأ', short: 'إجابة قصيرة', oral: 'شفهي مفتوح' } as const;
const DIFF_LABEL = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' } as const;
const AGE_LABEL = { all: 'الكل', kids: 'أطفال', teens: 'ناشئة', adults: 'كبار' } as const;

export function loadBank(): Question[] {
  try { const r = localStorage.getItem('aswar:bank'); if (r) { const q = JSON.parse(r); if (Array.isArray(q) && q.length) return q; } } catch { /* */ }
  return SEED_QUESTIONS;
}
export function saveBank(q: Question[]) { try { localStorage.setItem('aswar:bank', JSON.stringify(q)); } catch { /* */ } }

/** يحول صفوف CSV/Excel إلى أسئلة. الأعمدة: النوع، السؤال، الخيارات (مفصولة بـ |) أو خيار1..خيار4، الإجابة، المجال، الصعوبة، الفئة */
export function rowsToQuestions(rows: Record<string, unknown>[]): { ok: Question[]; bad: number } {
  const pick = (r: Record<string, unknown>, ...keys: string[]) => {
    for (const k of Object.keys(r)) if (keys.includes(k.trim().toLowerCase())) return String(r[k] ?? '').trim();
    return '';
  };
  const typeMap: Record<string, Question['type']> = { mcq: 'mcq', 'اختيار': 'mcq', 'اختيار من متعدد': 'mcq', tf: 'tf', 'صح أو خطأ': 'tf', 'صح او خطأ': 'tf', short: 'short', 'قصير': 'short', 'نصي': 'short', oral: 'oral', 'شفهي': 'oral' };
  const diffMap: Record<string, Question['difficulty']> = { easy: 'easy', 'سهل': 'easy', medium: 'medium', 'متوسط': 'medium', hard: 'hard', 'صعب': 'hard' };
  const ageMap: Record<string, Question['age']> = { all: 'all', 'الكل': 'all', kids: 'kids', 'أطفال': 'kids', teens: 'teens', 'ناشئة': 'teens', adults: 'adults', 'كبار': 'adults' };
  let bad = 0;
  const ok: Question[] = [];
  rows.forEach((r, i) => {
    const text = pick(r, 'text', 'question', 'السؤال');
    let options = pick(r, 'options', 'الخيارات').split('|').map((s) => s.trim()).filter(Boolean);
    if (!options.length) options = [1, 2, 3, 4, 5, 6].map((n) => pick(r, `option${n}`, `خيار${n}`, `الخيار${n}`)).filter(Boolean);
    const rawType = pick(r, 'type', 'النوع').toLowerCase();
    const type = typeMap[rawType] ?? (options.length >= 2 ? 'mcq' : 'oral');
    const q = sanitizeQuestion({
      id: 'imp' + Date.now().toString(36) + i, type, text, options, answer: pick(r, 'answer', 'الإجابة', 'الاجابة'),
      category: pick(r, 'category', 'المجال') || 'عام', difficulty: diffMap[pick(r, 'difficulty', 'الصعوبة').toLowerCase()] ?? 'medium', age: ageMap[pick(r, 'age', 'الفئة', 'الفئة العمرية').toLowerCase()] ?? 'all',
    });
    if (q && (q.type !== 'mcq' || q.options!.includes(q.answer))) ok.push(q);
    else bad++;
  });
  return { ok, bad };
}

const EMPTY: Question = { id: '', type: 'mcq', text: '', options: ['', '', '', ''], answer: '', category: 'عام', difficulty: 'medium', age: 'all' };

export function QuestionBankDialog({ open, onOpenChange, questions, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; questions: Question[]; onSave: (q: Question[]) => void }) {
  const [filter, setFilter] = useState({ q: '', cat: '', type: '', diff: '' });
  const [edit, setEdit] = useState<Question | null>(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cats = useMemo(() => Array.from(new Set(questions.map((q) => q.category))), [questions]);
  const list = questions.filter((q) => (!filter.q || q.text.includes(filter.q)) && (!filter.cat || q.category === filter.cat) && (!filter.type || q.type === filter.type) && (!filter.diff || q.difficulty === filter.diff));

  const importFile = async (f: File) => {
    try {
      const XLSX = await import('xlsx');
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', codepage: 65001 });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const { ok, bad } = rowsToQuestions(rows);
      if (ok.length) onSave([...questions, ...ok]);
      setMsg(`استُورد ${ok.length} سؤالًا${bad ? `، وتُجوهل ${bad} صفًا غير صالح` : ''}.`);
    } catch {
      setMsg('تعذرت قراءة الملف. استخدم القالب المرفق.');
    }
  };
  const template = () => {
    const csv = '﻿النوع,السؤال,الخيارات,الإجابة,المجال,الصعوبة,الفئة\nاختيار,ما عاصمة المغرب؟,الرباط|الدار البيضاء|فاس|مراكش,الرباط,جغرافيا,سهل,الكل\nصح أو خطأ,الماء يتجمد عند صفر درجة مئوية.,,صح,علوم,سهل,الكل\nقصير,كم عدد ألوان قوس قزح؟,,7|سبعة,علوم,متوسط,الكل\nشفهي,اذكر ثلاثة أنهار عربية.,,النيل، دجلة، الفرات,جغرافيا,متوسط,الكل\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'قالب-أسئلة-أسوار-الحصن.csv';
    a.click();
  };
  const saveEdit = () => {
    if (!edit) return;
    const q = sanitizeQuestion({ ...edit, id: edit.id || 'u' + Date.now().toString(36) });
    if (!q) { setMsg('أكمل نص السؤال والخيارات'); return; }
    if (q.type === 'mcq' && !q.options!.includes(q.answer)) { setMsg('اختر الإجابة الصحيحة من الخيارات'); return; }
    onSave(edit.id ? questions.map((x) => (x.id === edit.id ? q : x)) : [...questions, q]);
    setEdit(null);
    setMsg('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="بنك الأسئلة" description={`${questions.length} سؤالًا في البنك`} wide>
      {edit ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="النوع"><Select value={edit.type} onChange={(v) => setEdit({ ...edit, type: v as Question['type'], options: v === 'mcq' ? edit.options ?? ['', '', '', ''] : undefined, answer: v === 'tf' ? 'صح' : edit.answer })} options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="المجال"><Input list="cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /><datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
            <Field label="الصعوبة"><Select value={edit.difficulty} onChange={(v) => setEdit({ ...edit, difficulty: v as Question['difficulty'] })} options={Object.entries(DIFF_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="الفئة العمرية"><Select value={edit.age} onChange={(v) => setEdit({ ...edit, age: v as Question['age'] })} options={Object.entries(AGE_LABEL).map(([value, label]) => ({ value, label }))} /></Field>
          </div>
          <Field label="نص السؤال"><Input value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} /></Field>
          {edit.type === 'mcq' && (
            <Field label="الخيارات (اختر الصحيح بالدائرة)">
              <div className="grid gap-2 sm:grid-cols-2">
                {(edit.options ?? []).map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="right" checked={!!o && edit.answer === o} onChange={() => setEdit({ ...edit, answer: o })} className="accent-[var(--accent)]" />
                    <Input value={o} onChange={(e) => { const opts = [...edit.options!]; const was = opts[i]; opts[i] = e.target.value; setEdit({ ...edit, options: opts, answer: edit.answer === was ? e.target.value : edit.answer }); }} placeholder={`الخيار ${i + 1}`} />
                  </div>
                ))}
              </div>
            </Field>
          )}
          {edit.type === 'tf' && <Field label="الإجابة"><Select value={edit.answer} onChange={(v) => setEdit({ ...edit, answer: v })} options={[{ value: 'صح', label: 'صح' }, { value: 'خطأ', label: 'خطأ' }]} /></Field>}
          {(edit.type === 'short' || edit.type === 'oral') && <Field label="الإجابة" hint={edit.type === 'short' ? 'افصل الإجابات المقبولة بالرمز |' : 'إجابة مرجعية تظهر للمقدم فقط'}><Input value={edit.answer} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} /></Field>}
          {msg && <p className="text-sm text-[#d0583a]">{msg}</p>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setEdit(null); setMsg(''); }}>إلغاء</Button><Button variant="gold" onClick={saveEdit}>حفظ السؤال</Button></div>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1"><Search size={16} className="absolute right-3 top-3 text-[var(--ink-soft)]" /><Input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="ابحث في الأسئلة" className="pr-9" /></div>
            <Select className="w-auto" value={filter.cat} onChange={(v) => setFilter({ ...filter, cat: v })} options={[{ value: '', label: 'كل المجالات' }, ...cats.map((c) => ({ value: c, label: c }))]} />
            <Select className="w-auto" value={filter.type} onChange={(v) => setFilter({ ...filter, type: v })} options={[{ value: '', label: 'كل الأنواع' }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]} />
            <Select className="w-auto" value={filter.diff} onChange={(v) => setFilter({ ...filter, diff: v })} options={[{ value: '', label: 'كل المستويات' }, ...Object.entries(DIFF_LABEL).map(([value, label]) => ({ value, label }))]} />
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" variant="gold" onClick={() => setEdit({ ...EMPTY, options: ['', '', '', ''] })}><Plus /> سؤال جديد</Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><FileUp /> استيراد CSV أو Excel</Button>
            <Button size="sm" variant="ghost" onClick={template}><Download /> تنزيل القالب</Button>
            <Button size="sm" variant="ghost" onClick={() => { if (confirm('استعادة البنك الافتراضي؟ ستُحذف الأسئلة المضافة.')) onSave(SEED_QUESTIONS); }}><RotateCcw /> البنك الافتراضي</Button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </div>
          {msg && <p className="mb-2 text-sm text-[var(--ink-soft)]">{msg}</p>}
          <div className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border hairline">
            {list.slice(0, 300).map((q) => (
              <div key={q.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px]">{q.text}</div>
                  <div className="text-xs text-[var(--ink-soft)]">{TYPE_LABEL[q.type]} · {q.category} · {DIFF_LABEL[q.difficulty]} · الإجابة: {q.answer.split('|')[0]}</div>
                </div>
                <button className="rounded-lg p-1.5 text-[var(--ink-soft)] hover:bg-[var(--line)]" onClick={() => setEdit({ ...q, options: q.options ? [...q.options, ...Array(Math.max(0, 4 - q.options.length)).fill('')] : q.options })} aria-label="تعديل"><Pencil size={16} /></button>
                <button className="rounded-lg p-1.5 text-[var(--ink-soft)] hover:bg-[var(--line)] hover:text-[#d0583a]" onClick={() => questions.length > 1 && onSave(questions.filter((x) => x.id !== q.id))} aria-label="حذف"><Trash2 size={16} /></button>
              </div>
            ))}
            {list.length === 0 && <div className="p-6 text-center text-sm text-[var(--ink-soft)]">لا توجد أسئلة مطابقة</div>}
          </div>
        </div>
      )}
    </Dialog>
  );
}
