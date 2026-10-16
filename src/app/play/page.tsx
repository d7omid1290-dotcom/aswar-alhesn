import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TeamApp } from '@/components/game/team-app';

export const metadata: Metadata = { title: 'جوال الفريق' };

export default function PlayPage() {
  return <Suspense><TeamApp /></Suspense>;
}
