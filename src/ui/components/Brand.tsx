export function CastleMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6e2a8" /><stop offset="0.5" stopColor="#e2bd62" /><stop offset="1" stopColor="#a8823a" /></linearGradient>
      </defs>
      <path d="M8 58V26h7v6h6v-9h7v6h8v-6h7v9h6v-6h7v32H40V44a8 8 0 0 0-16 0v14z" fill="url(#gm)" />
      <path d="M30 4h4v19h-4z" fill="url(#gm)" />
      <path d="M34 5l12 4.5L34 14z" fill="#c8463d" />
    </svg>
  );
}
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <CastleMark size={compact ? 30 : 44} />
      <div className="leading-none">
        <div className={`gold-text font-display ${compact ? 'text-2xl' : 'text-4xl'}`}>أسوار الحصن</div>
        {!compact && <div className="mt-1.5 text-xs tracking-wide text-[var(--ink-soft)]">مسابقة · استراتيجية · حصون</div>}
      </div>
    </div>
  );
}
