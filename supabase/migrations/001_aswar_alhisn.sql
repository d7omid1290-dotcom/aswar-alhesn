-- أسوار الحصن: مخطط قاعدة البيانات
-- المتصفح لا يصل إلى الجداول مباشرة أبدًا. كل قراءة وكتابة تمر عبر دوال /api على Vercel،
-- والتي تستدعي الدوال أدناه بسر خادم لا يعرفه إلا الخادم. البث اللحظي عبر Supabase Realtime Broadcast.

create table if not exists public.hisn_rooms (
  code        text primary key,
  version     integer not null,
  phase       text not null default 'lobby',
  state       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists hisn_rooms_updated_idx on public.hisn_rooms (updated_at);

create table if not exists public.hisn_events (
  id         bigserial primary key,
  room_code  text not null references public.hisn_rooms(code) on delete cascade,
  type       text not null,
  actor      text not null,
  payload    jsonb,
  at         timestamptz not null default now()
);
create index if not exists hisn_events_room_idx on public.hisn_events (room_code, at);

create table if not exists public.hisn_config (
  key   text primary key,
  value text not null
);

-- إغلاق الجداول: تفعيل RLS دون أي سياسة = لا وصول لمفتاح anon أو للمستخدمين
alter table public.hisn_rooms  enable row level security;
alter table public.hisn_events enable row level security;
alter table public.hisn_config enable row level security;
revoke all on public.hisn_rooms, public.hisn_events, public.hisn_config from anon, authenticated;

-- سر الخادم: يُولّد مرة واحدة. انسخه إلى متغير HISN_SERVER_SECRET في Vercel:
--   select value from public.hisn_config where key = 'server_secret';
insert into public.hisn_config (key, value)
values ('server_secret', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function public.hisn_check(p_secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_secret is null or p_secret <> (select value from hisn_config where key = 'server_secret') then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end $$;

create or replace function public.hisn_get(p_secret text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform hisn_check(p_secret);
  return (select state from hisn_rooms where code = p_code);
end $$;

create or replace function public.hisn_insert(p_secret text, p_code text, p_version integer, p_phase text, p_state jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform hisn_check(p_secret);
  -- تنظيف الغرف المهجورة منذ أكثر من 14 يومًا
  delete from hisn_rooms where updated_at < now() - interval '14 days';
  insert into hisn_rooms (code, version, phase, state) values (p_code, p_version, p_phase, p_state);
end $$;

-- تحديث متفائل: لا يحفظ إلا إذا لم تتغير النسخة منذ القراءة (يمنع التنفيذ المزدوج والتعارض)
create or replace function public.hisn_update(p_secret text, p_code text, p_expected integer, p_version integer, p_phase text, p_state jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  perform hisn_check(p_secret);
  update hisn_rooms set version = p_version, phase = p_phase, state = p_state, updated_at = now()
   where code = p_code and version = p_expected;
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function public.hisn_log(p_secret text, p_code text, p_type text, p_actor text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform hisn_check(p_secret);
  insert into hisn_events (room_code, type, actor, payload) values (p_code, p_type, p_actor, p_payload);
end $$;

revoke all on function public.hisn_check(text) from public, anon, authenticated;
grant execute on function public.hisn_get(text, text), public.hisn_insert(text, text, integer, text, jsonb),
  public.hisn_update(text, text, integer, integer, text, jsonb), public.hisn_log(text, text, text, text, jsonb) to anon, authenticated;
