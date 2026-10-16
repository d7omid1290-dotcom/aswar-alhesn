-- وصول الخادم عبر دوال محمية بسرّ الخادم (بديل لمفتاح الخدمة)
-- الجداول تبقى مقفلة (RLS بلا سياسات). المتصفح يقدر يستدعي الدوال بالمفتاح العام
-- لكنها ترفض أي طلب لا يحمل السر المحفوظ في المخطط الخاص `private`.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (
  key   text primary key,
  value text not null
);
revoke all on private.config from public, anon, authenticated;

create or replace function private.check_secret(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare s text;
begin
  select value into s from private.config where key = 'server_secret';
  if s is null or p_secret is null or length(p_secret) < 32 or p_secret <> s then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
end $$;

create or replace function public.aswar_room_get(p_secret text, p_code text)
returns table (code text, host_key_hash text, state jsonb, version integer)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  return query select r.code, r.host_key_hash, r.state, r.version from public.rooms r where r.code = p_code;
end $$;

create or replace function public.aswar_room_insert(p_secret text, p_code text, p_host_key_hash text, p_state jsonb, p_version integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  insert into public.rooms (code, host_key_hash, state, version) values (p_code, p_host_key_hash, p_state, p_version)
  on conflict (code) do nothing;
  return found;
end $$;

-- تحديث بشرط الإصدار السابق (تزامن متفائل)
create or replace function public.aswar_room_update(p_secret text, p_code text, p_state jsonb, p_version integer, p_prev integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  update public.rooms set state = p_state, version = p_version, updated_at = now()
  where code = p_code and version = p_prev;
  return found;
end $$;

create or replace function public.aswar_questions(p_secret text)
returns table (id bigint, category text, level smallint, question text, answer text, wrong text[])
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  return query select q.id, q.category, q.level, q.question, q.answer, q.wrong from public.questions q where q.active limit 5000;
end $$;

create or replace function public.aswar_result_insert(p_secret text, p_room_code text, p_teams jsonb, p_rounds integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_secret(p_secret);
  insert into public.results (room_code, teams, rounds) values (p_room_code, p_teams, p_rounds);
  -- تنظيف خفيف للغرف القديمة مع كل نتيجة
  delete from public.rooms where updated_at < now() - interval '2 days';
end $$;

revoke execute on function private.check_secret(text) from public, anon, authenticated;
