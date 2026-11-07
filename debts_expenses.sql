-- Run in Supabase SQL Editor (after the earlier SQL files)
create table debts(
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,   -- the business (owner) id
  created_by uuid not null default auth.uid(),
  name text not null, phone text, note text,
  amount numeric not null check (amount>0), paid numeric not null default 0,
  created_at timestamptz default now(), settled_at timestamptz);
create table expenses(
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_by uuid not null default auth.uid(),
  date date not null default current_date, category text not null,
  amount numeric not null check (amount>0), note text, created_at timestamptz default now());
alter table debts enable row level security;
alter table expenses enable row level security;

-- Debts: owner and attendants of a Premium business can read, add and record payments; only the owner can delete.
create policy debts_read   on debts for select using (user_id=biz_id() and has_access());
create policy debts_insert on debts for insert with check (user_id=biz_id() and has_access());
create policy debts_update on debts for update using (user_id=biz_id() and has_access()) with check (user_id=biz_id() and has_access());
create policy debts_delete on debts for delete using (user_id=auth.uid() and has_access());
-- Expenses: owner only.
create policy exp_all on expenses for all using (user_id=auth.uid() and has_access()) with check (user_id=auth.uid() and has_access());
