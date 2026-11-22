create table if not exists public.contact_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
create unique index if not exists cr_pending_pair on public.contact_requests (least(from_user, to_user), greatest(from_user, to_user)) where status = 'pending';
create index if not exists cr_to_idx on public.contact_requests(to_user, status);
create index if not exists cr_from_idx on public.contact_requests(from_user, status);
create table if not exists public.contact_labels (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  created_at timestamptz not null default now()
);
create unique index if not exists cl_owner_name on public.contact_labels(owner, lower(name));
create table if not exists public.contacts (
  owner uuid not null references public.profiles(id) on delete cascade,
  contact uuid not null references public.profiles(id) on delete cascade,
  favorite boolean not null default false,
  label_id uuid references public.contact_labels(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (owner, contact),
  check (owner <> contact)
);
create index if not exists contacts_contact_idx on public.contacts(contact);
create table if not exists public.blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks(blocked);
alter table public.contact_codes enable row level security;
alter table public.contact_requests enable row level security;
alter table public.contact_labels enable row level security;
alter table public.contacts enable row level security;
alter table public.blocks enable row level security;
revoke all on public.contact_codes, public.contact_requests, public.contact_labels, public.contacts, public.blocks from anon, authenticated;
grant select on public.contact_requests, public.contacts to authenticated;
drop policy if exists cr_sel on public.contact_requests;
create policy cr_sel on public.contact_requests for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());
drop policy if exists contacts_sel on public.contacts;
create policy contacts_sel on public.contacts for select to authenticated using (owner = auth.uid());
