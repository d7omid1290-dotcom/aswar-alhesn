'use client';
import { motion } from 'motion/react';
import Link from 'next/link';
import { MonitorPlay, MonitorSmartphone, Smartphone } from 'lucide-react';
import { asset } from '@/lib/utils';
import { ElementIcon } from './element-icon';
import { TopBar } from './top-bar';

const CARDS = [
  { href: '/host', icon: MonitorPlay, title: 'ابدأ لعبة', text: 'شاشة المقدم مع غرفة تتصل بها جوالات الفرق لحظيًا', primary: true },
  { href: '/host?local=1', icon: MonitorSmartphone, title: 'شاشة واحدة', text: 'المقدم يدير كل شيء من شاشة العرض بلا جوالات' },
  { href: '/play', icon: Smartphone, title: 'انضم لفريقك', text: 'من الجوال: وزّع حصنك سرًّا واختر ضرباتك' },
];
const STEPS = [
  { el: 'guard', t: 'وزّع حصنك سرًّا', d: 'الملك والفرسان والمدفعية والفخاخ على خانات مرقّمة' },
  { el: 'market', t: 'أجب السؤال', d: 'من مجالات ومستويات يحددها المقدم' },
  { el: 'cannon', t: 'اضرب حصن خصمك', d: 'اختر رقمًا، وشاهد ما أصابت قذيفتك' },
  { el: 'king', t: 'اجمع النقاط', d: 'الفريق الأعلى نقاطًا يفوز بالمعركة' },
];

export function Landing() {
  return (
    <div className="desert-bg flex h-dvh flex-col">
      <TopBar />
      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col justify-center gap-[3vh] px-4 py-4">
        <section className="text-center">
          <motion.img src={asset('/assets/logo.svg')} alt="" className="mx-auto size-[clamp(72px,13vh,128px)] rounded-[28%] shadow-2xl"
            initial={{ scale: 0.6, rotate: -10, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 12 }} />
          <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
            className="mt-3 font-display text-[clamp(2.6rem,8vh,5.5rem)] leading-none text-gold drop-shadow">أسوار الحصن</motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-2 text-[clamp(.95rem,2.2vh,1.25rem)] text-muted-foreground">
            لعبة مسابقات جماعية: احمِ ملكك، أجب بسرعة، وأسقط حصون خصومك
          </motion.p>
        </section>
        <section className="grid gap-3 md:grid-cols-3">
          {CARDS.map((c, i) => (
            <motion.div key={c.href} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 + i * 0.08 }} whileHover={{ y: -4 }}>
              <Link href={c.href} className={`pattern flex h-full items-center gap-4 rounded-3xl border p-4 shadow-lg backdrop-blur md:flex-col md:items-start md:p-5 ${c.primary ? 'border-gold bg-accent/80' : 'bg-card/80'}`}>
                <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${c.primary ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}><c.icon className="size-6" /></span>
                <span><b className="block font-display text-2xl">{c.title}</b><span className="text-sm text-muted-foreground">{c.text}</span></span>
              </Link>
            </motion.div>
          ))}
        </section>
        <section className="hidden grid-cols-4 gap-3 sm:grid">
          {STEPS.map((s, i) => (
            <motion.div key={s.t} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 + i * 0.08 }} className="flex items-center gap-2 rounded-2xl bg-card/50 p-2.5">
              <ElementIcon id={s.el} className="size-[clamp(40px,7vh,64px)]" />
              <span><b className="block text-sm">{i + 1}. {s.t}</b><span className="text-xs text-muted-foreground">{s.d}</span></span>
            </motion.div>
          ))}
        </section>
      </main>
    </div>
  );
}
