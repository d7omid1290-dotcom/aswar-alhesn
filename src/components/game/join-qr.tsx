'use client';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Maximize2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Team } from '@/lib/game/types';
import { asset, cn } from '@/lib/utils';

export function joinUrl(code: string, t: Team) { return `${location.origin}/play?room=${code}&code=${t.joinCode}`; }

/** مصفوفة QR بتصحيح أخطاء عالٍ (H) حتى يبقى قابلًا للمسح مع شعار في المنتصف */
function useQrSvg(text: string) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'H', margin: 0, color: { dark: '#1f1409', light: '#0000' } }).then(setSvg);
  }, [text]);
  return svg;
}

/** لوحة QR مربعة دائمًا: تأخذ أكبر مربع يتسع في المساحة المتاحة */
function QrTile({ text, color, ready, onExpand, big }: { text: string; color: string; ready?: boolean; onExpand?: () => void; big?: boolean }) {
  const svg = useQrSvg(text);
  const corner = 'absolute size-[17%] border-[4px]';
  return (
    <div className="relative grid min-h-0 w-full flex-1 place-items-center" style={{ containerType: 'size' }}>
      <button type="button" onClick={onExpand} disabled={!onExpand} aria-label="تكبير رمز QR"
        className="group relative aspect-square rounded-[14%] bg-[#fffaf0] p-[11%] shadow-[0_10px_30px_-12px_rgb(0_0_0/0.45)] transition enabled:hover:scale-[1.02]"
        style={{ width: 'min(100cqw, 100cqh)', height: 'min(100cqw, 100cqh)' }}>
        {/* زوايا بلون الفريق */}
        <span className={cn(corner, 'start-[3%] top-[3%] rounded-ss-[40%] border-e-0 border-b-0')} style={{ borderColor: color }} />
        <span className={cn(corner, 'end-[3%] top-[3%] rounded-se-[40%] border-s-0 border-b-0')} style={{ borderColor: color }} />
        <span className={cn(corner, 'start-[3%] bottom-[3%] rounded-es-[40%] border-e-0 border-t-0')} style={{ borderColor: color }} />
        <span className={cn(corner, 'end-[3%] bottom-[3%] rounded-ee-[40%] border-s-0 border-t-0')} style={{ borderColor: color }} />
        {svg ? <span className="absolute inset-[11%] [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="absolute inset-[11%] animate-pulse rounded-lg bg-black/10" />}
        {/* الشعار في المنتصف */}
        <span className="absolute left-1/2 top-1/2 grid size-[22%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[22%] bg-[#fffaf0] p-[2.5%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={asset('/assets/logo.svg')} alt="" className="size-full rounded-[20%]" />
        </span>
        {onExpand && !ready && (
          <span className="absolute -bottom-2 -end-2 grid size-8 place-items-center rounded-full border bg-card text-foreground opacity-0 shadow transition group-hover:opacity-100">
            <Maximize2 className="size-4" />
          </span>
        )}
        <AnimatePresence>
          {ready && !big && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center rounded-[14%] bg-[#fffaf0]/85 backdrop-blur-[3px]">
              <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                className="grid size-[42%] place-items-center rounded-full text-white shadow-lg" style={{ background: color }}>
                <Check className="size-[60%]" strokeWidth={3.5} />
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}

/** رمز الفريق في خانات منفصلة سهلة القراءة من بعيد */
export function CodeBoxes({ code, className }: { code: string; className?: string }) {
  return (
    <div dir="ltr" className={cn('flex justify-center gap-1', className)}>
      {code.split('').map((c, i) => (
        <span key={i} aria-hidden className="grid h-[1.75em] w-[1.3em] place-items-center rounded-md border border-b-[3px] border-gold/50 bg-card font-mono font-bold leading-none text-foreground shadow-sm">{c}</span>
      ))}
      <span className="sr-only" data-testid="join-code">{code}</span>
    </div>
  );
}

/** بطاقة ربط جوال الفريق: QR مربع + رمز الدخول + تكبير للمسح من بعيد */
export function JoinQr({ team, room, compact }: { team: Team; room: string; compact?: boolean }) {
  const [big, setBig] = useState(false);
  const url = joinUrl(room, team);
  return (
    <>
      <QrTile text={url} color={team.color} ready={team.ready} onExpand={() => setBig(true)} />
      <div className="flex shrink-0 flex-col items-center gap-1.5 pt-1">
        <CodeBoxes code={team.joinCode ?? ''} className={compact ? 'text-lg' : 'text-2xl'} />
        <span className={cn('text-xs text-muted-foreground', compact && 'hidden')}>امسح الرمز، أو اختر «انضم» وأدخل الغرفة <b className="text-foreground">{room}</b> والرمز</span>
      </div>
      <Dialog open={big} onOpenChange={setBig}>
        <DialogContent className="flex h-[min(92dvh,760px)] max-w-[min(92vw,640px)] flex-col items-center">
          <DialogHeader className="items-center text-center">
            <DialogTitle className="font-display text-4xl" style={{ color: team.color }}>{team.name}</DialogTitle>
            <DialogDescription>وجّه كاميرا الجوال إلى الرمز</DialogDescription>
          </DialogHeader>
          <QrTile text={url} color={team.color} big />
          <CodeBoxes code={team.joinCode ?? ''} className="text-3xl" />
        </DialogContent>
      </Dialog>
    </>
  );
}
