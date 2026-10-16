import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseEnabled = Boolean(url && serviceKey);

let client: SupabaseClient | null = null;
/** عميل الخادم بمفتاح الخدمة — لا يُستخدم في المتصفح أبدًا */
export function adminClient(): SupabaseClient {
  if (!supabaseEnabled) throw new Error('Supabase غير مهيأ');
  client ??= createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** بث إشعار «تغيّرت الغرفة» عبر Supabase Realtime. لا يحمل أي بيانات سرية: رقم الإصدار فقط */
export async function broadcastUpdate(code: string, v: number) {
  await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey!, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ messages: [{ topic: `room:${code}`, event: 'update', payload: { v } }] }),
  }).catch(() => {});
}
