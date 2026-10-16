'use client';
import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_STATIC !== '1') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
