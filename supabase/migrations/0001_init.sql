-- أسوار الحصن: الجداول الأساسية
-- كل الوصول يتم من خادم Next.js بمفتاح الخدمة؛ RLS مفعّل بلا سياسات فلا يقرأ المتصفح أي جدول مباشرة
-- (هذا يحمي التوزيع السري للحصون ورموز الفرق).

create table if not exists public.rooms (
  code          text primary key,
  host_key_hash text not null,
  state         jsonb not null,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists rooms_updated_idx on public.rooms (updated_at);

create table if not exists public.questions (
  id         bigint generated always as identity primary key,
  category   text not null,
  level      smallint not null check (level between 1 and 3),
  question   text not null,
  answer     text not null,
  wrong      text[] not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists questions_cat_level_idx on public.questions (category, level) where active;

create table if not exists public.results (
  id          bigint generated always as identity primary key,
  room_code   text not null,
  teams       jsonb not null,
  rounds      integer,
  finished_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.questions enable row level security;
alter table public.results enable row level security;

-- تنظيف الغرف الخاملة أكثر من يومين (شغّلها يدويًا أو بجدولة pg_cron)
create or replace function public.cleanup_rooms() returns void language sql as $$
  delete from public.rooms where updated_at < now() - interval '2 days';
$$;
