-- Nexus v52 card decks. Apply once in the Supabase SQL editor.
-- Do not run from the app. Does not touch relic-videos or relic_completions.
-- Storage has no UPDATE policy and the client must not send x-upsert.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nexus-cards', 'nexus-cards', true, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.nexus_cards (
  id uuid primary key default gen_random_uuid(),
  deck text not null check (deck in ('food', 'smoothie')),
  name text not null check (char_length(name) between 1 and 80),
  veg numeric(3,1) not null default 0 check (veg between 0 and 10),
  fruit numeric(3,1) not null default 0 check (fruit between 0 and 10),
  path text not null,
  thumb text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint nexus_cards_path_shape check (
    path ~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
    and thumb ~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_t\.(webp|jpg)$'
    and split_part(path, '/', 1) = deck
    and split_part(thumb, '/', 1) = deck
  )
);

create table if not exists public.nexus_slots (
  date_key text not null check (date_key ~ '^2027-\d\d-\d\d$'),
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner')),
  food_id uuid references public.nexus_cards (id),
  smoothie_id uuid references public.nexus_cards (id),
  updated_at timestamptz not null default now(),
  primary key (date_key, slot)
);

alter table public.nexus_cards enable row level security;
alter table public.nexus_slots enable row level security;

grant select, insert, update on public.nexus_cards to anon, authenticated;
grant select, insert, update on public.nexus_slots to anon, authenticated;

drop policy if exists nc_sel on public.nexus_cards;
drop policy if exists nc_ins on public.nexus_cards;
drop policy if exists nc_upd on public.nexus_cards;
drop policy if exists ns_sel on public.nexus_slots;
drop policy if exists ns_ins on public.nexus_slots;
drop policy if exists ns_upd on public.nexus_slots;

create policy nc_sel on public.nexus_cards
  for select to anon, authenticated
  using (true);

create policy nc_ins on public.nexus_cards
  for insert to anon, authenticated
  with check (
    path ~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
    and thumb ~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_t\.(webp|jpg)$'
    and split_part(path, '/', 1) = deck
    and split_part(thumb, '/', 1) = deck
  );

-- Anon may change name, veg, fruit and hidden only.
-- path and thumb must stay on the regex and the folder must match the deck.
create policy nc_upd on public.nexus_cards
  for update to anon, authenticated
  using (true)
  with check (
    path ~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
    and thumb ~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_t\.(webp|jpg)$'
    and split_part(path, '/', 1) = deck
    and split_part(thumb, '/', 1) = deck
    and exists (
      select 1 from public.nexus_cards existing
      where existing.id = nexus_cards.id
        and existing.path = nexus_cards.path
        and existing.thumb = nexus_cards.thumb
        and existing.deck = nexus_cards.deck
        and existing.created_at = nexus_cards.created_at
    )
  );

create policy ns_sel on public.nexus_slots
  for select to anon, authenticated
  using (true);

create policy ns_ins on public.nexus_slots
  for insert to anon, authenticated
  with check (true);

create policy ns_upd on public.nexus_slots
  for update to anon, authenticated
  using (true)
  with check (true);

create or replace function public.nexus_cards_update_guard()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.deck is distinct from old.deck
     or new.path is distinct from old.path
     or new.thumb is distinct from old.thumb
     or new.created_at is distinct from old.created_at then
    raise exception 'nexus_cards updates may change only name, veg, fruit and hidden';
  end if;
  if new.path !~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
     or new.thumb !~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_t\.(webp|jpg)$'
     or split_part(new.path, '/', 1) is distinct from new.deck
     or split_part(new.thumb, '/', 1) is distinct from new.deck then
    raise exception 'nexus_cards path must match the deck folder';
  end if;
  return new;
end;
$$;

drop trigger if exists nexus_cards_update_guard on public.nexus_cards;
create trigger nexus_cards_update_guard
  before update on public.nexus_cards
  for each row
  execute function public.nexus_cards_update_guard();

drop policy if exists nexus_cards_obj_select on storage.objects;
drop policy if exists nexus_cards_obj_insert on storage.objects;
drop policy if exists nexus_cards_obj_update on storage.objects;

create policy nexus_cards_obj_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'nexus-cards');

-- Folder must be food/ or smoothie/ plus a uuid file. No update policy, so upsert cannot replace.
create policy nexus_cards_obj_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'nexus-cards'
    and name ~ '^(food|smoothie)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.(webp|jpg)$'
  );
