'use client';
import Link from 'next/link';
import { Maximize, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isMuted, toggleMute } from '@/lib/sfx';
import { toggleTheme, useDark } from '@/lib/client/use-dark';
import { asset, cn } from '@/lib/utils';

export function TopBar({ center, children, compact }: { center?: React.ReactNode; children?: React.ReactNode; compact?: boolean }) {
  const dark = useDark();
  const [muted, setMuted] = useState(false);
  useEffect(() => setMuted(isMuted()), []);
  return (
    <header className={cn('relative z-20 flex shrink-0 items-center gap-3 border-b bg-card/60 px-4 backdrop-blur-md', compact ? 'h-14 px-3' : 'h-16')}>
      <Link href="/" className="flex items-center gap-2 font-display text-2xl text-gold">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset('/assets/logo.svg')} alt="" className="size-9 rounded-xl" />
        {!compact && <span className="drop-shadow-sm">أسوار الحصن</span>}
      </Link>
      <div className="flex min-w-0 flex-1 justify-center truncate text-sm font-semibold text-muted-foreground">{center}</div>
      <div className="flex items-center gap-1.5">
        {children}
        <Button variant="outline" size="icon" aria-label="الصوت" onClick={() => setMuted(toggleMute())}>{muted ? <VolumeX /> : <Volume2 />}</Button>
        <Button variant="outline" size="icon" aria-label="الوضع الداكن" onClick={toggleTheme}>{dark ? <Sun /> : <Moon />}</Button>
        {!compact && (
          <Button variant="outline" size="icon" aria-label="ملء الشاشة" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>
            <Maximize />
          </Button>
        )}
      </div>
    </header>
  );
}
