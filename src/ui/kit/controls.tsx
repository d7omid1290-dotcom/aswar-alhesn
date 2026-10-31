import * as React from 'react';
import * as S from '@radix-ui/react-switch';
import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = React.useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="cursor-pointer">
        <div className="text-[15px] font-medium">{label}</div>
        {hint && <div className="text-xs text-[var(--ink-soft)]">{hint}</div>}
      </label>
      <S.Root id={id} checked={checked} onCheckedChange={onChange} dir="rtl"
        className="relative h-6 w-11 shrink-0 rounded-full bg-[var(--line)] transition-colors data-[state=checked]:bg-[var(--accent)]">
        <S.Thumb className="block h-5 w-5 translate-x-[-2px] rounded-full bg-white shadow transition-transform duration-150 data-[state=checked]:translate-x-[-22px]" />
      </S.Root>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[var(--ink-soft)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--ink-soft)]">{hint}</span>}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn('h-10 w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel-solid)] px-3 text-[15px] text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]', className)} {...p} />
));
Input.displayName = 'Input';

export function Select({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn('h-10 w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel-solid)] px-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--accent)]', className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--panel-border)] bg-[var(--line)] p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', value === o.value ? 'bg-[var(--panel-solid)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-soft)] hover:text-[var(--ink)]')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div className="inline-flex h-9 items-center rounded-xl border border-[var(--panel-border)] bg-[var(--panel-solid)]">
      <button type="button" className="h-full w-8 text-lg text-[var(--ink-soft)] hover:text-[var(--ink)] disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <span className="w-10 text-center font-semibold tabular">{value}</span>
      <button type="button" className="h-full w-8 text-lg text-[var(--ink-soft)] hover:text-[var(--ink)] disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  );
}

export const Tabs = T.Root;
export function TabsList({ children }: { children: React.ReactNode }) {
  return <T.List className="flex gap-1 rounded-xl bg-[var(--line)] p-1">{children}</T.List>;
}
export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return <T.Trigger value={value} className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors data-[state=active]:bg-[var(--panel-solid)] data-[state=active]:text-[var(--ink)] data-[state=active]:shadow-sm">{children}</T.Trigger>;
}
export const TabsContent = T.Content;
