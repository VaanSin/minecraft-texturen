-- Minecraft Texturen: Online-Konten und Themen (in Supabase unter "SQL Editor" einfuegen und "Run" klicken)

-- Benutzernamen (zum Konto gehoerend)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles for select using (true);
drop policy if exists "eigenes Profil anlegen" on public.profiles;
create policy "eigenes Profil anlegen" on public.profiles for insert with check (auth.uid() = id);

-- Themen (eine Zeile pro hochgeladenem Thema und Minecraft-Version)
create table if not exists public.themes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  owner_name text not null,
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 300),
  mc_version text not null,
  public boolean not null default true,
  texture_count int not null default 0,
  size_bytes int not null default 0,
  downloads int not null default 0,
  updated_at timestamptz not null default now(),
  unique (owner, name, mc_version)
);
alter table public.themes enable row level security;
drop policy if exists "oeffentliche und eigene Themen lesen" on public.themes;
create policy "oeffentliche und eigene Themen lesen" on public.themes for select using (public or auth.uid() = owner);
drop policy if exists "eigene Themen anlegen" on public.themes;
create policy "eigene Themen anlegen" on public.themes for insert with check (auth.uid() = owner);
drop policy if exists "eigene Themen aendern" on public.themes;
create policy "eigene Themen aendern" on public.themes for update using (auth.uid() = owner);
drop policy if exists "eigene Themen loeschen" on public.themes;
create policy "eigene Themen loeschen" on public.themes for delete using (auth.uid() = owner);

-- Zugriff fuer die Daten-Schnittstelle (falls "Automatically expose new tables" aus ist);
-- was jemand wirklich sehen/aendern darf, regeln die Policies oben.
grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert on public.profiles to authenticated;
grant select on public.themes to anon, authenticated;
grant insert, update, delete on public.themes to authenticated;

-- Downloads zaehlen (darf jeder, aendert sonst nichts)
create or replace function public.zaehle_download(theme uuid) returns void
  language sql security definer set search_path = public as
  $$ update themes set downloads = downloads + 1 where id = theme and public; $$;
grant execute on function public.zaehle_download(uuid) to anon, authenticated;

-- Dateien: Speicher "themen", Pfad <owner-id>/<theme-id>.zip und .png, hoechstens 20 MB
insert into storage.buckets (id, name, public, file_size_limit)
  values ('themen', 'themen', false, 20971520)
  on conflict (id) do nothing;
drop policy if exists "Themen-Dateien lesen" on storage.objects;
create policy "Themen-Dateien lesen" on storage.objects for select using (
  bucket_id = 'themen' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.themes t where t.public and storage.objects.name like t.owner::text || '/' || t.id::text || '.%')
  )
);
drop policy if exists "eigene Dateien hochladen" on storage.objects;
create policy "eigene Dateien hochladen" on storage.objects for insert
  with check (bucket_id = 'themen' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "eigene Dateien ersetzen" on storage.objects;
create policy "eigene Dateien ersetzen" on storage.objects for update
  using (bucket_id = 'themen' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "eigene Dateien loeschen" on storage.objects;
create policy "eigene Dateien loeschen" on storage.objects for delete
  using (bucket_id = 'themen' and (storage.foldername(name))[1] = auth.uid()::text);
