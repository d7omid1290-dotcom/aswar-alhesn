import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const dbSecret = process.env.SUPABASE_DB_SECRET;

/**
 * طريقتان للوصول من الخادم:
 * - مفتاح الخدمة: قراءة وكتابة الجداول مباشرة.
 * - المفتاح العام + سرّ الخادم: عبر دوال aswar_* التي ترفض أي طلب لا يحمل السر (migrations/0002).
 * في الحالتين تبقى الجداول مقفلة أمام المتصفح.
 */
export const dbMode: 'service' | 'rpc' | null = url && serviceKey ? 'service' : url && anonKey && dbSecret ? 'rpc' : null;
export const supabaseEnabled = dbMode !== null;

let client: SupabaseClient | null = null;
function serverClient(): SupabaseClient {
  if (!supabaseEnabled) throw new Error('Supabase غير مهيأ');
  client ??= createClient(url!, (serviceKey ?? anonKey)!, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export interface RoomRow { code: string; host_key_hash: string; state: unknown; version: number }
export interface QuestionRow { id: number; category: string; level: number; question: string; answer: string; wrong: string[] | null }

export const db = {
  async roomGet(code: string): Promise<RoomRow | null> {
    if (dbMode === 'rpc') {
      const { data } = await serverClient().rpc('aswar_room_get', { p_secret: dbSecret, p_code: code });
      return (data as RoomRow[] | null)?.[0] ?? null;
    }
    const { data } = await serverClient().from('rooms').select('code, host_key_hash, state, version').eq('code', code).maybeSingle();
    return data;
  },
  async roomInsert(r: RoomRow): Promise<boolean> {
    if (dbMode === 'rpc') {
      const { data, error } = await serverClient().rpc('aswar_room_insert', { p_secret: dbSecret, p_code: r.code, p_host_key_hash: r.host_key_hash, p_state: r.state, p_version: r.version });
      return !error && data === true;
    }
    const { error } = await serverClient().from('rooms').insert(r);
    return !error;
  },
  /** حفظ بشرط عدم تغيّر الإصدار (تزامن متفائل) */
  async roomUpdate(code: string, state: unknown, version: number, prev: number): Promise<boolean> {
    if (dbMode === 'rpc') {
      const { data, error } = await serverClient().rpc('aswar_room_update', { p_secret: dbSecret, p_code: code, p_state: state, p_version: version, p_prev: prev });
      return !error && data === true;
    }
    const { data, error } = await serverClient().from('rooms')
      .update({ state, version, updated_at: new Date().toISOString() })
      .eq('code', code).eq('version', prev).select('code');
    return !error && !!data?.length;
  },
  async questions(): Promise<QuestionRow[] | null> {
    if (dbMode === 'rpc') {
      const { data, error } = await serverClient().rpc('aswar_questions', { p_secret: dbSecret });
      return error ? null : (data as QuestionRow[]);
    }
    const { data, error } = await serverClient().from('questions').select('id, category, level, question, answer, wrong').eq('active', true).limit(5000);
    return error ? null : data;
  },
  async resultInsert(roomCode: string, teams: unknown, rounds: number) {
    if (dbMode === 'rpc') {
      await serverClient().rpc('aswar_result_insert', { p_secret: dbSecret, p_room_code: roomCode, p_teams: teams, p_rounds: rounds });
      return;
    }
    await serverClient().from('results').insert({ room_code: roomCode, teams, rounds });
  },
};

/** بث إشعار «تغيّرت الغرفة» عبر Supabase Realtime. لا يحمل أي بيانات سرية: رقم الإصدار فقط */
export async function broadcastUpdate(code: string, v: number) {
  const key = (serviceKey ?? anonKey)!;
  await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ messages: [{ topic: `room:${code}`, event: 'update', payload: { v } }] }),
  }).catch(() => {});
}
