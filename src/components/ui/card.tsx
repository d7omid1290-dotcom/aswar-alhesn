import * as React from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('flex min-h-0 flex-col gap-3 rounded-2xl border bg-card/85 p-4 text-card-foreground shadow-[0_10px_40px_-18px_rgb(60_40_10/.45)] backdrop-blur-md', className)} {...props} />;
}
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex items-center gap-2', className)} {...props} />;
}
function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 data-slot="card-title" className={cn('font-display text-xl leading-none', className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="card-description" className={cn('text-xs text-muted-foreground', className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('min-h-0 flex-1', className)} {...props} />;
}
export { Card, CardHeader, CardTitle, CardDescription, CardContent };
