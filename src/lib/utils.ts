import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AR = '٠١٢٣٤٥٦٧٨٩';
/** أرقام عربية مشرقية */
export const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR[+d]);
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + ar(Math.abs(n));
