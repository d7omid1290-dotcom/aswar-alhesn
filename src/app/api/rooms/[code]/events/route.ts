import { roomBus, realtimeMode } from '@/lib/server/rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** بث لحظي (SSE) عند العمل بدون Supabase: يرسل رقم الإصدار فقط، والمتصفح يجلب حالته المصرّح بها */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (realtimeMode() !== 'sse') return new Response('Realtime عبر Supabase', { status: 404 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (s: string) => { try { ctrl.enqueue(enc.encode(s)); } catch { cleanup(); } };
      const onUpdate = (v: number) => send(`data: ${v}\n\n`);
      const ping = setInterval(() => send(': ping\n\n'), 20_000);
      roomBus.on(code, onUpdate);
      send('retry: 2000\n\n');
      cleanup = () => { clearInterval(ping); roomBus.off(code, onUpdate); };
      req.signal.addEventListener('abort', () => { cleanup(); try { ctrl.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}
