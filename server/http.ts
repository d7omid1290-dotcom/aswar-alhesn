// معالج HTTP مشترك بين Vercel وخادم Vite المحلي.
import { HttpError, RoomService, type Creds } from './rooms';

export type Req = { method: string; path: string; query: Record<string, string>; body: any };
export type Res = { status: number; json: unknown };

// حد بسيط للطلبات لكل عنوان (يحمي من التخمين والطلبات المتكررة)
const hits = new Map<string, { n: number; t: number }>();
export function rateLimited(ip: string, limit = 40, windowMs = 10000) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > windowMs) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n++;
  return h.n > limit;
}

export async function handle(svc: RoomService, req: Req): Promise<Res> {
  try {
    const b = req.body || {};
    const creds: Creds = { hostToken: b.hostToken ?? req.query.hostToken, teamToken: b.teamToken ?? req.query.teamToken, roomCode: b.roomCode ?? req.query.roomCode, pin: b.pin ?? req.query.pin };
    if (req.path.endsWith('/room') && req.method === 'POST') return { status: 200, json: await svc.create(b) };
    if (req.path.endsWith('/view') && (req.method === 'GET' || req.method === 'POST')) {
      const code = String(b.roomCode ?? req.query.roomCode ?? '');
      return { status: 200, json: await svc.view(code, creds) };
    }
    if (req.path.endsWith('/command') && req.method === 'POST') {
      return { status: 200, json: await svc.command(String(b.roomCode), creds, b.envelope) };
    }
    return { status: 404, json: { error: 'غير موجود' } };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, json: { error: e.message } };
    console.error(e);
    return { status: 500, json: { error: 'خطأ في الخادم' } };
  }
}
