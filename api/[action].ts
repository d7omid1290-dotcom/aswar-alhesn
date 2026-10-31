// دالة Vercel واحدة: /api/room و/api/view و/api/command
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RoomService } from '../server/rooms';
import { SupabaseBroadcast, SupabaseStore, supabaseEnv } from '../server/supabase';
import { handle, rateLimited } from '../server/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const env = supabaseEnv();
  if (req.query.action === 'health') return res.status(200).json({ mode: env ? 'online' : 'unconfigured' });
  if (!env) return res.status(503).json({ error: 'لم يُضبط Supabase على الخادم. راجع README.' });
  const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0];
  if (rateLimited(ip, 60)) return res.status(429).json({ error: 'طلبات كثيرة' });
  const svc = new RoomService(new SupabaseStore(env.url, env.key, env.secret), new SupabaseBroadcast(env.url, env.key));
  const query = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v)]));
  const r = await handle(svc, { method: req.method || 'GET', path: '/api/' + query.action, query, body: req.body });
  res.status(r.status).json(r.json);
}
