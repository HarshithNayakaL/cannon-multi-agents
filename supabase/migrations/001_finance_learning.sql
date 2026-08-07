-- Cannon — migration 001: the Finance and Learning desks
--
-- Run this in the Supabase SQL editor if your project was created from an
-- earlier `schema.sql` (fitness + work only). A fresh project does not need
-- it — `schema.sql` already contains everything here.
--
-- Safe to run more than once: every statement is idempotent.
--
-- The important part is the last section. `messages` and `documents` carried a
-- CHECK constraint listing only 'fitness' and 'work', so without this the two
-- new desks fail on their first write — the tables exist, the insert is
-- rejected, and the error surfaces as a generic 500 from the chat route.

-- ── Finance ─────────────────────────────────────────────────────────────────

create table if not exists expenses (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  merchant   text not null,
  category   text not null default 'other'
             check (category in ('food', 'transport', 'housing', 'health',
                                 'subscriptions', 'shopping', 'other')),
  amount     numeric(12, 2) not null check (amount >= 0),
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on expenses (date desc);
create index if not exists expenses_category_idx on expenses (category);

-- ── Learning ────────────────────────────────────────────────────────────────

create table if not exists reading (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  kind       text not null default 'article'
             check (kind in ('book', 'paper', 'article', 'course', 'video')),
  status     text not null default 'queued'
             check (status in ('queued', 'reading', 'finished')),
  topic      text,
  takeaway   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reading_status_idx on reading (status);
create index if not exists reading_updated_idx on reading (updated_at desc);

alter table expenses enable row level security;
alter table reading  enable row level security;

-- ── Widen the agent constraint on the shared tables ─────────────────────────
--
-- Dropped and recreated rather than altered: Postgres has no "modify CHECK",
-- and the constraint is what currently rejects a finance or learning row.

alter table messages  drop constraint if exists messages_agent_check;
alter table messages  add  constraint messages_agent_check
  check (agent in ('fitness', 'work', 'finance', 'learning'));

alter table documents drop constraint if exists documents_agent_check;
alter table documents add  constraint documents_agent_check
  check (agent in ('fitness', 'work', 'finance', 'learning'));
