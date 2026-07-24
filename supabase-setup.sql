-- Run this once in your Supabase project's SQL Editor.
-- If you already ran an earlier version of this file, you only need to run
-- the new "3. Reactions table" section below — Postgres will error on
-- "create table" if media/profile already exist, which is fine to ignore.

-- 1. Media table (photos/videos)
create table media (
  id uuid primary key default gen_random_uuid(),
  title text,
  type text not null check (type in ('image', 'video')),
  url text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table media enable row level security;

create policy "Public can view media"
  on media for select
  using (true);

create policy "Only authenticated users can insert media"
  on media for insert
  with check (auth.role() = 'authenticated');

create policy "Only authenticated users can delete media"
  on media for delete
  using (auth.role() = 'authenticated');

-- 2. Profile table (your name, bio, avatar — one row)
create table profile (
  id int primary key default 1,
  display_name text default 'Your Name',
  bio text default '',
  avatar_url text default '',
  constraint single_row check (id = 1)
);

insert into profile (id, display_name, bio) values (1, 'Your Name', 'Photographer · Storyteller');

alter table profile enable row level security;

create policy "Public can view profile"
  on profile for select
  using (true);

create policy "Only authenticated users can update profile"
  on profile for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- 3. Reactions table (likes/dislikes from anonymous viewers)
-- Each visiting browser gets a random ID (stored in their own browser only)
-- so they get exactly one vote per post, without needing an account.
create table reactions (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references media(id) on delete cascade,
  voter_id text not null,
  type text not null check (type in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  unique (media_id, voter_id)
);

alter table reactions enable row level security;

create policy "Public can view reactions"
  on reactions for select
  using (true);

create policy "Public can add a reaction"
  on reactions for insert
  with check (true);

create policy "Public can change their own reaction"
  on reactions for update
  using (true)
  with check (true);

create policy "Public can remove their own reaction"
  on reactions for delete
  using (true);

-- 4. Storage bucket policies
-- First: create a PUBLIC bucket named "media" in Storage → New bucket, then run:

create policy "Public can read media files"
  on storage.objects for select
  using (bucket_id = 'media');

create policy "Only authenticated users can upload media files"
  on storage.objects for insert
  with check (bucket_id = 'media' and auth.role() = 'authenticated');

create policy "Only authenticated users can delete media files"
  on storage.objects for delete
  using (bucket_id = 'media' and auth.role() = 'authenticated');
