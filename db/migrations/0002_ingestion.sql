-- Hosted book ingestion: private uploads and a leased job queue.
--
-- The web tier only records intent. A separate worker (extraction/worker.py)
-- leases one job at a time, heartbeats while it runs and reports the outcome.
-- lock_token fences every worker write, so a worker that lost its lease cannot
-- complete a job that was handed to another one.

create table uploads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  storage_key  text not null unique,               -- private object key, never a public URL
  filename     text not null,
  content_type text not null,
  size_bytes   bigint not null check (size_bytes > 0),
  status       text not null default 'pending' check (status in ('pending', 'uploaded', 'deleted')),
  created_at   timestamptz not null default now(),
  uploaded_at  timestamptz
);
create index uploads_user_idx on uploads (user_id, created_at desc);

create table ingestion_jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  upload_id    uuid not null references uploads(id) on delete cascade,
  status       text not null default 'queued'
               check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  options      jsonb not null default '{}',        -- validated extractor options
  attempt      integer not null default 0,
  max_attempts integer not null default 3,
  run_after    timestamptz not null default now(), -- retry back-off
  locked_by    text,
  lock_token   uuid,
  locked_until timestamptz,
  heartbeat_at timestamptz,
  progress     jsonb,                              -- { stage, percent, message }
  result_key   text,                               -- private object key of the exercise database
  summary      jsonb,                              -- counts only; no book content
  error        jsonb,                              -- { code, message, retryable }
  book_id      text,
  imported_at  timestamptz,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now()
);
create index ingestion_jobs_user_idx on ingestion_jobs (user_id, created_at desc);
create index ingestion_jobs_queue_idx on ingestion_jobs (status, run_after);

create table ingestion_events (
  id      bigint generated always as identity primary key,
  job_id  uuid not null references ingestion_jobs(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  at      timestamptz not null default now(),
  kind    text not null,
  detail  jsonb
);
create index ingestion_events_job_idx on ingestion_events (job_id, id);

alter table uploads          enable row level security;
alter table uploads          force  row level security;
alter table ingestion_jobs   enable row level security;
alter table ingestion_jobs   force  row level security;
alter table ingestion_events enable row level security;
alter table ingestion_events force  row level security;

create policy tenant on uploads
  using (app_is_system() or user_id = app_user_id())
  with check (app_is_system() or user_id = app_user_id());
create policy tenant on ingestion_jobs
  using (app_is_system() or user_id = app_user_id())
  with check (app_is_system() or user_id = app_user_id());
create policy tenant on ingestion_events
  using (app_is_system() or user_id = app_user_id())
  with check (app_is_system() or user_id = app_user_id());
