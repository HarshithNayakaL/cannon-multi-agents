-- Cannon — migration 002: agents you create yourself
--
-- Run this after 001 if your project was created from an earlier schema.
-- A fresh project does not need it — `schema.sql` already contains everything.
--
-- Safe to run more than once.
--
-- Two changes matter here:
--
-- 1. The `agents` and `records` tables, which hold agents created at runtime
--    and the entries they remember.
--
-- 2. Dropping the `agent` CHECK constraint on `messages` and `documents`.
--    That constraint enumerated the desks — first two, then four — which
--    cannot work once the roster is open. Every write is validated against
--    the live registry in the application before it reaches Postgres.

create table if not exists agents (
  id            text primary key check (id ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$' and length(id) <= 32),
  name          text not null,
  title         text not null,
  tagline       text not null,
  accent        text not null check (accent ~* '^#[0-9a-f]{6}$'),
  system_prompt text not null,
  keywords      text[] not null default '{}',
  suggestions   text[] not null default '{}',
  created_at    timestamptz not null default now()
);

create table if not exists records (
  id         uuid primary key default gen_random_uuid(),
  agent      text not null references agents (id) on delete cascade,
  title      text not null,
  body       text not null,
  tags       text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists records_agent_idx on records (agent, created_at desc);
create index if not exists records_tags_idx on records using gin (tags);

alter table agents  enable row level security;
alter table records enable row level security;

-- ── Open the roster on the shared tables ────────────────────────────────────
--
-- Dropped, not widened. There is no list to widen it to: the next agent's id
-- is whatever the user types tomorrow.

alter table messages  drop constraint if exists messages_agent_check;
alter table documents drop constraint if exists documents_agent_check;
