import { NextResponse } from 'next/server';
import { act } from '@/lib/server/rooms';
import { actionSchema } from '@/lib/server/schemas';
import { blocked, ipOf, recordFail } from '@/lib/server/limit';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = ipOf(req);
  if (blocked(ip)) return NextResponse.json({ error: 'محاولات كثيرة، انتظر قليلًا' }, { status: 429 });
  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body?.action);
  if (!parsed.success) return NextResponse.json({ error: 'حركة غير صالحة' }, { status: 400 });
  const r = await act(code, req.headers.get('x-room-key'), parsed.data);
  if (r.status === 403) recordFail(ip);
  return NextResponse.json(r.status === 200 ? { ok: true } : { error: r.error }, { status: r.status });
}
