-- Chess Quest core: identities, profiles, training progress and the private library.
--
-- Isolation is enforced twice. Every query in src/server filters by user_id, and
-- row-level security rejects rows that do not belong to the user named in the
-- transaction-local setting app.user_id. Background work that legitimately spans
-- users (sign-in lookup, the ingestion queue) sets app.system = 'on'.

create function app_user_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app_is_system() returns boolean language sql stable as
$$ select coalesce(current_setting('app.system', true), '') = 'on' $$;

create table users (
  id                uuid primary key default gen_random_uuid(),
  auth_sub          text not null unique,          -- identity provider subject (Auth0 "sub")
  email             text,
  email_verified    boolean not null default false,
  name              text,
  picture           text,
  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  -- Per-user change counter. A writer takes the row lock, reserves a range and
  -- stamps each changed row with one value, so "everything after cursor N" is
  -- always complete for a reader that has seen change_seq = N.
  change_seq        bigint not null default 0,
  -- Attempts at or before this time (ms epoch) were wiped by "reset progress".
  progress_reset_at bigint not null default 0
);

create table profiles (
  user_id    uuid primary key references users(id) on delete cascade,
  data       jsonb not null,
  version    integer not null default 1,           -- optimistic concurrency
  seq        bigint not null,
  origin     text,                                 -- sync client that wrote it last
  updated_at timestamptz not null default now()
);

-- One row per solving attempt. (exercise_id, ts) is the attempt's identity on
-- every device, so uploading the same attempt twice is a no-op.
create table attempts (
  user_id     uuid not null references users(id) on delete cascade,
  exercise_id text not null,
  ts          bigint not null,                     -- client clock, ms epoch
  mode        text not null check (mode in ('flow', 'deep', 'review', 'focus')),
  result      text not null check (result in ('solved', 'assisted', 'failed')),
  time_ms     bigint not null check (time_ms >= 0),
  hint_level  integer not null default 0,
  finished    boolean not null default false,
  payload     jsonb not null,                      -- the attempt exactly as clients store it
  hash        text not null,
  seq         bigint not null,
  origin      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, exercise_id, ts)
);
create index attempts_seq_idx on attempts (user_id, seq);
create index attempts_ts_idx on attempts (user_id, ts);

-- Spaced-repetition state, derived from the attempt log by the same pure
-- function the clients use (src/lib/cloud/merge.ts rebuildSrs).
create table srs_state (
  user_id       uuid not null references users(id) on delete cascade,
  exercise_id   text not null,
  due           bigint not null,
  interval_days integer not null,
  lapses        integer not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index srs_due_idx on srs_state (user_id, due);

create table library_books (
  user_id     uuid not null references users(id) on delete cascade,
  book_id     text not null,
  meta        jsonb not null,                      -- BookMeta: id, title, author, edition
  report      jsonb,
  imported_at bigint not null,
  deleted     boolean not null default false,      -- tombstone, so other devices drop the book
  hash        text not null,
  seq         bigint not null,
  origin      text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, book_id)
);
create index library_books_seq_idx on library_books (user_id, seq);

create table library_exercises (
  user_id       uuid not null references users(id) on delete cascade,
  book_id       text not null,
  exercise_id   text not null,
  number        integer not null,
  chapter_id    text not null,
  chapter_title text not null,
  difficulty    real not null default 0,
  -- Derived on the server from the payload; never taken from the client.
  status        text not null check (status in ('verified', 'needs_review')),
  trainable     boolean not null,
  ranked_ok     boolean not null default false,
  synthetic     boolean not null default false,
  content_key   text not null,                     -- hash of position + solution tree
  payload       jsonb not null,                    -- the exercise without its diagram image
  diagram       text,
  hash          text not null,                     -- hash of the full exercise as synced
  seq           bigint not null,
  origin        text,
  updated_at    timestamptz not null default now(),
  primary key (user_id, book_id, exercise_id),
  foreign key (user_id, book_id) references library_books(user_id, book_id) on delete cascade
);
create index library_exercises_seq_idx on library_exercises (user_id, seq);
create index library_exercises_order_idx on library_exercises (user_id, book_id, number);

alter table users             enable row level security;
alter table users             force  row level security;
alter table profiles          enable row level security;
alter table profiles          force  row level security;
alter table attempts          enable row level security;
alter table attempts          force  row level security;
alter table srs_state         enable row level security;
alter table srs_state         force  row level security;
alter table library_books     enable row level security;
alter table library_books     force  row level security;
alter table library_exercises enable row level security;
alter table library_exercises force  row level security;

create policy tenant on users
  using (app_is_system() or id = app_user_id())
  with check (app_is_system() or id = app_user_id());
create policy tenant on profiles
  using (app_is_system() or user_id = app_user_id())
  with check (app_is_system() or user_id = app_user_id());
create policy tenant on attempts
  using (app_is_system() or user_id = app_user_id())
  with check (app_is_system() or user_id = app_user_id());
create policy tenant on srs_state
  using (app_is_system() or user_id = app_user_id())
  with check (app_is_system() or user_id = app_user_id());
create policy tenant on library_books
  using (app_is_system() or user_id = app_user_id())
  with check (app_is_system() or user_id = app_user_id());
create policy tenant on library_exercises
  using (app_is_system() or user_id = app_user_id())
  with check (app_is_system() or user_id = app_user_id());
