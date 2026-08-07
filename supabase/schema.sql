-- Cannon — Supabase schema
--
-- Run once in the Supabase SQL editor, then set SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY. Structured data and embeddings share one
-- database, so there is no separate vector store to keep in sync.

create extension if not exists vector;

-- ── Fitness ─────────────────────────────────────────────────────────────────

create table if not exists workouts (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  exercise   text not null,
  sets       integer not null check (sets > 0),
  reps       integer not null check (reps > 0),
  weight     numeric(6, 2) not null check (weight >= 0),
  rpe        numeric(3, 1) check (rpe between 1 and 10),
  notes      text,
  created_at timestamptz not null default now()
);

create index if not exists workouts_date_idx on workouts (date desc);
create index if not exists workouts_exercise_idx on workouts (lower(exercise));

create table if not exists body_metrics (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  weight       numeric(5, 2) not null,
  measurements jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- ── Work ────────────────────────────────────────────────────────────────────

create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  status     text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  priority   text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date   date,
  project    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_status_idx on tasks (status);
create index if not exists tasks_due_idx on tasks (due_date);

create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  content    text not null,
  source     text not null default 'manual',
  date       date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists notes_date_idx on notes (date desc);

-- ── Finance ─────────────────────────────────────────────────────────────────

-- `numeric`, never a float. Money in a float column accumulates rounding error
-- across a month of sums, and the totals are the whole point of this desk.
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

-- ── User-created agents ─────────────────────────────────────────────────────
--
-- The four built-in desks are code, not rows. Only agents created at runtime
-- live here, which is why there is no seed data and no bootstrapping step.

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

-- The generic unit a created agent works in. A built-in desk has a table
-- shaped like its domain; an agent invented at runtime cannot, so it gets one
-- honest shape instead. Deleting the agent takes its records with it.
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

-- ── Shared: transcripts and the vector store ────────────────────────────────

-- No CHECK enumerating agents: the roster is open, because agents are created
-- at runtime. A foreign key to `agents` would be wrong too — the four built-in
-- desks are code and have no row there. The application is the authority on
-- which ids exist, and it validates before every write.
create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  agent      text not null,
  role       text not null check (role in ('user', 'assistant', 'system')),
  parts      jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_agent_idx on messages (agent, created_at desc);

-- 768 dimensions: Gemini is asked to project down to this width via
-- `outputDimensionality`, and the local fallback embedder emits the same size,
-- so both backends write into this column without a migration.
create table if not exists documents (
  id         uuid primary key default gen_random_uuid(),
  agent      text not null,
  content    text not null,
  embedding  vector(768) not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists documents_agent_idx on documents (agent);

-- IVFFlat needs rows before it helps; harmless on an empty table.
create index if not exists documents_embedding_idx
  on documents using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Retrieval entry point. The agent filter lives inside the function, so the
-- per-agent boundary is enforced by the database rather than by every caller
-- remembering to add a WHERE clause.
create or replace function match_documents(
  query_embedding vector(768),
  match_agent     text,
  match_count     integer default 4
)
returns table (
  id         uuid,
  agent      text,
  content    text,
  metadata   jsonb,
  similarity float
)
language sql
stable
as $$
  select
    documents.id,
    documents.agent,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.agent = match_agent
  order by documents.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- ── Row level security ──────────────────────────────────────────────────────
--
-- Cannon is single-user and reaches Postgres with the service role key, which
-- bypasses RLS. It is still enabled on every table so that an anon or
-- authenticated key — one leaked into a client bundle, say — reads nothing.

alter table workouts     enable row level security;
alter table body_metrics enable row level security;
alter table tasks        enable row level security;
alter table notes        enable row level security;
alter table expenses     enable row level security;
alter table reading      enable row level security;
alter table agents       enable row level security;
alter table records      enable row level security;
alter table messages     enable row level security;
alter table documents    enable row level security;

-- Deliberately no permissive policies: without one, non-service keys are denied.
