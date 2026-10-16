import { NextResponse } from 'next/server';
import { getView, realtimeMode } from '@/lib/server/rooms';
import { blocked, ipOf, recordFail } from '@/lib/server/limit';

export const dynamic = 'force-dynamic';

/** حالة الغرفة كما يحق لصاحب الرمز أن يراها */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = ipOf(req);
  if (blocked(ip)) return NextResponse.json({ error: 'محاولات كثيرة، انتظر قليلًا' }, { status: 429 });
  const r = await getView(code, req.headers.get('x-room-key'));
  if (r.status !== 200) {
    if (r.status === 403) recordFail(ip);
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  return NextResponse.json({ me: r.me, state: r.state, realtime: realtimeMode() }, { headers: { 'Cache-Control': 'no-store' } });
}
