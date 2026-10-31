import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Stage } from '@/game3d/stage';
import { DEFAULT_ELEMENTS } from '@/engine/defaults';
import type { ElementKind } from '@/engine/types';
import { createMatch, mathRng } from '@/engine/engine';
import { LocalAuthority, createRemoteRoom, deleteLocal, detectServer, listSavedMatches, type Mode } from '@/net/client';
import { Brand } from '../components/Brand';
import { Button } from '../kit/button';
import { Input, Segmented } from '../kit/controls';
import { go, saveHostCreds, useTheme, useToast } from '../hooks';
import { loadBank } from '../components/QuestionBank';
import { Toast } from '../components/Toast';
import { Moon, Sun, Swords, Users, Tv, History, Trash2 } from 'lucide-react';

function Backdrop({ theme }: { theme: 'dark' | 'light' }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<Stage | null>(null);
  useEffect(() => {
    try {
      const s = new Stage(ref.current!);
      st.current = s;
      const kinds = Object.fromEntries(DEFAULT_ELEMENTS.map((e) => [e.id, e.kind])) as Record<string, ElementKind>;
      s.setup([
        { id: 'a', name: 'حصن الشمال', color: '#2f6fd6' }, { id: 'b', name: 'حصن الجنوب', color: '#c8463d' },
        { id: 'c', name: 'حصن الشرق', color: '#2f9e6a' }, { id: 'd', name: 'حصن الغرب', color: '#d39b2a' },
      ], 15, null, kinds);
    } catch { /* بدون WebGL */ }
    return () => st.current?.dispose();
  }, []);
  useEffect(() => st.current?.setTheme(theme === 'dark' ? 'night' : 'day'), [theme]);
  return <div ref={ref} className="stage-host absolute inset-0" />;
}

export default function Home() {
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const [server, setServer] = useState<Mode | null>(null);
  const [mode, setMode] = useState<Mode>('local');
  const [busy, setBusy] = useState(false);
  const [join, setJoin] = useState({ room: '', pin: '' });
  const [saved, setSaved] = useState(listSavedMatches());

  useEffect(() => { detectServer().then((m) => { setServer(m); if (m) setMode(m); }); }, []);

  const create = async () => {
    setBusy(true);
    try {
      const questions = loadBank();
      if (mode === 'local') {
        const a = new LocalAuthority(createMatch({ now: Date.now(), rng: mathRng, teams: 2, questions }));
        const { roomCode, hostToken } = a.raw;
        a.close();
        saveHostCreds(roomCode, 'local', hostToken);
        go('/host', { room: roomCode, mode: 'local' });
      } else {
        const r = await createRemoteRoom({ teams: 2, questions });
        saveHostCreds(r.roomCode, mode, r.hostToken);
        go('/host', { room: r.roomCode, mode });
      }
    } catch (e) {
      toast.show((e as Error).message || 'تعذر إنشاء المباراة');
    } finally { setBusy(false); }
  };

  const modes = [{ value: 'local' as Mode, label: 'هذا الجهاز' }, ...(server === 'lan' ? [{ value: 'lan' as Mode, label: 'الشبكة المحلية' }] : []), ...(server === 'online' ? [{ value: 'online' as Mode, label: 'عبر الإنترنت' }] : [])];
  const modeHint = mode === 'local' ? 'المقدم يدير كل شيء من شاشة واحدة. يمكن فتح شاشة الجمهور وجوالات الفرق في تبويبات المتصفح نفسه للتجربة.' : mode === 'lan' ? 'الجوالات المتصلة بالشبكة نفسها تنضم برمز QR. البيانات في ذاكرة الخادم المحلي.' : 'غرف حقيقية عبر Supabase: تنضم الفرق من أي مكان، والخادم يتحقق من كل إجابة وضربة.';

  return (
    <div className="relative h-dvh overflow-hidden">
      <Backdrop theme={theme} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(270deg,rgba(6,12,24,0.92)_0%,rgba(6,12,24,0.72)_34%,rgba(6,12,24,0.1)_70%)]" />
      <Toast msg={toast.msg} />
      <button onClick={toggle} className="absolute left-5 top-5 z-10 rounded-full bg-[rgba(8,14,26,0.6)] p-2.5 text-[#f3ead2] backdrop-blur hover:bg-[rgba(8,14,26,0.85)]" aria-label="تبديل المظهر">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="dark relative z-10 flex h-full w-full max-w-[560px] flex-col justify-center gap-7 overflow-y-auto px-6 py-8 text-[var(--ink)] sm:px-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <Brand />
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-[#c9d1de]">فرق تتنافس بالمعرفة، وكل إجابة صحيحة تطلق صاروخًا على حصن الخصم. وزّع عناصرك سرًا، واحمِ ملكك.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }} className="space-y-3">
          {modes.length > 1 && <Segmented value={mode} onChange={setMode} options={modes} />}
          <p className="text-sm leading-relaxed text-[#9aa6ba]">{modeHint}</p>
          <Button variant="gold" size="xl" className="w-full" onClick={create} disabled={busy}><Swords /> {busy ? 'جارٍ الإنشاء…' : 'مباراة جديدة'}</Button>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.16, ease: [0.22, 1, 0.36, 1] }} className="panel rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users size={16} className="text-[var(--accent)]" /> انضمام فريق أو شاشة جمهور</div>
          <div className="flex gap-2">
            <Input value={join.room} onChange={(e) => setJoin({ ...join, room: e.target.value.toUpperCase().slice(0, 6) })} placeholder="رمز الغرفة" className="tracking-[0.2em]" dir="ltr" />
            <Input value={join.pin} onChange={(e) => setJoin({ ...join, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} placeholder="رمز الفريق" inputMode="numeric" dir="ltr" className="w-32" />
          </div>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" disabled={join.room.length < 6 || join.pin.length < 4} onClick={() => go('/team', { room: join.room, pin: join.pin, mode })}><Users /> دخول الفريق</Button>
            <Button variant="outline" className="flex-1 text-[#f3ead2]" disabled={join.room.length < 6} onClick={() => go('/screen', { room: join.room, mode })}><Tv /> شاشة الجمهور</Button>
          </div>
        </motion.div>

        {saved.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#c9d1de]"><History size={16} /> مباريات محفوظة على هذا الجهاز</div>
            {saved.slice(0, 4).map((m) => (
              <div key={m.code} className="flex items-center gap-2 rounded-xl bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm">
                <button className="flex-1 text-right hover:text-[var(--accent)]" onClick={() => go('/host', { room: m.code, mode: 'local' })}>
                  {m.teams.join(' · ')} <span className="text-xs text-[#9aa6ba]">({m.phase === 'ended' ? 'انتهت' : m.phase === 'playing' ? 'جارية' : 'إعداد'} · {new Date(m.savedAt).toLocaleString('ar')})</span>
                </button>
                <button className="text-[#9aa6ba] hover:text-[#d0583a]" onClick={() => { deleteLocal(m.code); setSaved(listSavedMatches()); }} aria-label="حذف"><Trash2 size={15} /></button>
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
