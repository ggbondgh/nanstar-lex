-- NanStar Lex sync schema
-- Run this in Supabase SQL Editor.

create table if not exists public.se_folders (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint,
  primary key (user_id, id)
);

create table if not exists public.se_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  type text not null check (type in ('word', 'sentence')),
  english text not null,
  chinese text not null,
  folder_id text not null default 'default',
  tags text[] not null default '{}',
  favorite boolean not null default false,
  paused boolean not null default false,
  stats jsonb not null default '{}'::jsonb,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  deleted_at bigint,
  primary key (user_id, id)
);

create table if not exists public.se_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0,
  primary key (user_id, day)
);

alter table public.se_folders enable row level security;
alter table public.se_items enable row level security;
alter table public.se_activity enable row level security;

drop policy if exists "se_folders_select_own" on public.se_folders;
drop policy if exists "se_folders_insert_own" on public.se_folders;
drop policy if exists "se_folders_update_own" on public.se_folders;
drop policy if exists "se_folders_delete_own" on public.se_folders;

drop policy if exists "se_items_select_own" on public.se_items;
drop policy if exists "se_items_insert_own" on public.se_items;
drop policy if exists "se_items_update_own" on public.se_items;
drop policy if exists "se_items_delete_own" on public.se_items;

drop policy if exists "se_activity_select_own" on public.se_activity;
drop policy if exists "se_activity_insert_own" on public.se_activity;
drop policy if exists "se_activity_update_own" on public.se_activity;
drop policy if exists "se_activity_delete_own" on public.se_activity;

create policy "se_folders_select_own"
on public.se_folders for select
using (auth.uid() = user_id);

create policy "se_folders_insert_own"
on public.se_folders for insert
with check (auth.uid() = user_id);

create policy "se_folders_update_own"
on public.se_folders for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "se_folders_delete_own"
on public.se_folders for delete
using (auth.uid() = user_id);

create policy "se_items_select_own"
on public.se_items for select
using (auth.uid() = user_id);

create policy "se_items_insert_own"
on public.se_items for insert
with check (auth.uid() = user_id);

create policy "se_items_update_own"
on public.se_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "se_items_delete_own"
on public.se_items for delete
using (auth.uid() = user_id);

create policy "se_activity_select_own"
on public.se_activity for select
using (auth.uid() = user_id);

create policy "se_activity_insert_own"
on public.se_activity for insert
with check (auth.uid() = user_id);

create policy "se_activity_update_own"
on public.se_activity for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "se_activity_delete_own"
on public.se_activity for delete
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

select schemaname, tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('se_folders', 'se_items', 'se_activity')
order by tablename;
