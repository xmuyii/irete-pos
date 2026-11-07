-- Run once in Supabase → SQL Editor
create table profiles(
  user_id uuid primary key references auth.users on delete cascade,
  business_name text,
  trial_ends timestamptz not null default now() + interval '14 days',
  settings jsonb not null default '{}',
  created_at timestamptz default now());
create table subscriptions(
  user_id uuid primary key references auth.users on delete cascade,
  status text not null default 'inactive',
  expires_at timestamptz, paystack_ref text, updated_at timestamptz default now());
create table shifts(
  user_id uuid references auth.users on delete cascade,
  id bigint, date date not null, data jsonb not null,
  updated_at timestamptz default now(), primary key(user_id,id));

alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table shifts enable row level security;

-- access = in trial OR active subscription (enforced server-side, not just in the UI)
create function has_access() returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from profiles where user_id=auth.uid() and trial_ends>now())
      or exists(select 1 from subscriptions where user_id=auth.uid() and status='active' and expires_at>now()) $$;

create policy "own profile read"  on profiles for select using (user_id=auth.uid());
create policy "own profile edit"  on profiles for update using (user_id=auth.uid());
revoke update on profiles from authenticated, anon;
grant update(settings,business_name) on profiles to authenticated; -- users can't extend their own trial

create policy "own sub read" on subscriptions for select using (user_id=auth.uid()); -- writes: service role only

create policy "own shifts read"   on shifts for select using (user_id=auth.uid());
create policy "own shifts insert" on shifts for insert with check (user_id=auth.uid() and has_access());
create policy "own shifts update" on shifts for update using (user_id=auth.uid()) with check (user_id=auth.uid() and has_access());

create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(user_id,business_name) values(new.id,new.raw_user_meta_data->>'business_name'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
