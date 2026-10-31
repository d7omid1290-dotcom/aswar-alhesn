import { lazy, Suspense } from 'react';
import { MotionConfig } from 'motion/react';
import { useRoute, useTheme } from './hooks';
import type { Mode } from '@/net/client';

const Home = lazy(() => import('./screens/Home'));
const Host = lazy(() => import('./screens/Host'));
const Audience = lazy(() => import('./screens/Audience'));
const Team = lazy(() => import('./screens/Team'));

export default function App() {
  useTheme();
  const { path, params } = useRoute();
  const room = (params.get('room') || '').toUpperCase();
  const mode = (['local', 'lan', 'online'].includes(params.get('mode') || '') ? params.get('mode') : 'local') as Mode;
  let screen;
  if (path === '/host' && room) screen = <Host room={room} mode={mode} />;
  else if (path === '/screen' && room) screen = <Audience room={room} mode={mode} />;
  else if (path === '/team' && room) screen = <Team room={room} mode={mode} token={params.get('t') || undefined} pin={params.get('pin') || undefined} />;
  else screen = <Home />;
  return (
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<div className="grid h-dvh place-items-center text-[var(--ink-soft)]">…</div>}>{screen}</Suspense>
    </MotionConfig>
  );
}
