import 'server-only';

/** حد بسيط لمحاولات الدخول الخاطئة لكل عنوان IP (يحد من تخمين رموز الفرق) */
const fails = new Map<string, { n: number; at: number }>();
const WINDOW = 10 * 60_000, MAX = 40;

export function ipOf(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}
export function blocked(ip: string) {
  const f = fails.get(ip);
  return !!f && Date.now() - f.at < WINDOW && f.n >= MAX;
}
export function recordFail(ip: string) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.at > WINDOW) fails.set(ip, { n: 1, at: Date.now() });
  else f.n++;
}
