import { NextResponse } from 'next/server';
import { createRoom, realtimeMode } from '@/lib/server/rooms';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const room = await createRoom();
    return NextResponse.json({ ...room, realtime: realtimeMode() });
  } catch {
    return NextResponse.json({ error: 'تعذر إنشاء غرفة' }, { status: 500 });
  }
}
