-- ChronKeep cloud database (Postgres 15+, for example Supabase).
-- The server applies this on start (every statement is safe to run again), or paste it into the Supabase SQL editor.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- How a person signs in: provider 'password' (subject = email, secret_hash = scrypt), 'google' or 'apple' (subject = their id there).
create table if not exists auth_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  subject text not null,
  secret_hash text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (provider, subject)
);
create index if not exists auth_identities_user on auth_identities (user_id);

-- One document per person: settings, profile, items, bin, calendars, note, plus the sync bookkeeping (see lib/sync.js).
create table if not exists user_data (
  user_id uuid primary key references users(id) on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

-- Files attached to items (10 MB each, 10 per item).
create table if not exists files (
  user_id uuid not null references users(id) on delete cascade,
  item_id text not null,
  att_id text not null,
  data bytea not null,
  primary key (user_id, item_id, att_id)
);

-- Daily and manual copies of a person's document.
create table if not exists backups (
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  doc jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);

-- Only the server (the database owner) reads these tables. With row level security on and no policies,
-- Supabase's public API cannot reach them.
alter table users enable row level security;
alter table auth_identities enable row level security;
alter table user_data enable row level security;
alter table files enable row level security;
alter table backups enable row level security;
