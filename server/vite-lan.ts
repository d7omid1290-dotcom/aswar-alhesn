// خادم الشبكة المحلية: يضيف /api إلى خادم Vite أثناء التطوير، لتتصل الجوالات على نفس الشبكة دون Supabase.
import type { Plugin } from 'vite';
import { MemoryStore, SseHub } from './memory';
import { RoomService } from './rooms';
import { handle, rateLimited } from './http';
import { authenticate } from '../src/engine/engine';
import { networkInterfaces } from 'node:os';

export function lanServer(): Plugin {
  const store = new MemoryStore();
  const hub = new SseHub();
  const svc = new RoomService(store, hub);
  return {
    name: 'aswar-lan-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://x');
        if (!url.pathname.startsWith('/api/')) return next();
        const query = Object.fromEntries(url.searchParams);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (url.pathname === '/api/health') {
          const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
          res.end(JSON.stringify({ mode: 'lan', ips }));
          return;
        }
        if (url.pathname === '/api/stream') {
          const s = await store.get(String(query.roomCode || '').toUpperCase());
          if (!s) { res.statusCode = 404; res.end('{}'); return; }
          const creds = { hostToken: query.hostToken, teamToken: query.teamToken, roomCode: query.roomCode, pin: query.pin };
          void authenticate;
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          res.write(': ok\n\n');
          hub.add({ code: s.roomCode, creds, res });
          const ping = setInterval(() => res.write(': ping\n\n'), 15000);
          res.on('close', () => clearInterval(ping));
          return;
        }
        if (rateLimited(req.socket.remoteAddress || 'x', 80)) { res.statusCode = 429; res.end(JSON.stringify({ error: 'طلبات كثيرة' })); return; }
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', async () => {
          let body: any = {};
          try { body = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
          const r = await handle(svc, { method: req.method || 'GET', path: url.pathname, query, body });
          res.statusCode = r.status;
          res.end(JSON.stringify(r.json));
        });
      });
    },
  };
}
