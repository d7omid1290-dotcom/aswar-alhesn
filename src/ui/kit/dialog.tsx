import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// لوحة منبثقة: تفتح من مركزها بحركة قصيرة، وتغلق أسرع من فتحها
export function Dialog({ open, onOpenChange, title, description, children, className, wide }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: React.ReactNode; className?: string; wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-[rgba(4,8,16,0.55)] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.18 }} />
            </D.Overlay>
            <D.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                dir="rtl"
                className={cn('panel-solid fixed left-1/2 top-1/2 z-50 flex max-h-[88dvh] w-[min(94vw,560px)] flex-col rounded-2xl p-0 outline-none', wide && 'w-[min(96vw,980px)]', className)}
                initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-48%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={{ opacity: 0, scale: 0.97, x: '-50%', y: '-49%', transition: { duration: 0.12 } }}
                transition={{ type: 'spring', duration: 0.32, bounce: 0.12 }}
              >
                <div className="flex items-start justify-between gap-4 border-b hairline px-6 pb-4 pt-5">
                  <div>
                    <D.Title className="text-lg font-semibold">{title}</D.Title>
                    {description ? <D.Description className="mt-1 text-sm text-[var(--ink-soft)]">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
                  </div>
                  <D.Close className="rounded-lg p-1.5 text-[var(--ink-soft)] hover:bg-[var(--line)]" aria-label="إغلاق"><X size={18} /></D.Close>
                </div>
                <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
              </motion.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}
