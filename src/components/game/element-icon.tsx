import { cn } from '@/lib/utils';

/** صورة عنصر الحصن (الأصول الإيزومترية) */
export function ElementIcon({ id, className, alt = '' }: { id: string; className?: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/assets/${id}.svg`} alt={alt} draggable={false} className={cn('size-10 select-none object-contain', className)} />;
}
