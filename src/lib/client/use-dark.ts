'use client';
import { useEffect, useState } from 'react';

/** يتابع الوضع الداكن (صنف dark على html) */
export function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const upd = () => setDark(el.classList.contains('dark'));
    upd();
    const mo = new MutationObserver(upd);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function toggleTheme() {
  const el = document.documentElement;
  const dark = !el.classList.contains('dark');
  el.classList.toggle('dark', dark);
  try { localStorage.setItem('aswar-theme', dark ? 'dark' : 'light'); } catch {}
}
