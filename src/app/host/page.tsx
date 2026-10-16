import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HostApp } from '@/components/game/host-app';

export const metadata: Metadata = { title: 'شاشة المقدم' };

export default function HostPage() {
  return <Suspense><HostApp /></Suspense>;
}
