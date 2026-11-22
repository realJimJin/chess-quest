-- Multiplayer foundation: friends, challenges and Book Battles.
--
-- Two rules shape the model:
--  * The server is the only clock and the only scorer. A match attempt gets its
--    start and deadline from the database, and points are computed server-side.
--  * Private books never cross accounts. A battle stores exercise ids and a
--    content key only; each player is served the exercise from their own
--    library, so both must already own identical content.

alter table users add column friend_code text unique;

create table friendships (
  user_a       uuid not null references users(id) on delete cascade,  -- always the smaller id
  user_b       uuid not null references users(id) on delete cascade,
  status       text not null check (status in ('pending', 'accepted', 'blocked')),
  requested_by uuid not null references users(id) on delete cascade,
  blocked_by   uuid references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);
create index friendships_b_idx on friendships (user_b);

create table battles (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'book_battle' check (kind in ('book_battle')),
  ranked         boolean not null default false,
  status         text not null default 'active' check (status in ('active', 'finished', 'aborted')),
  book_id        text not null,
  config         jsonb not null,                    -- { exerciseCount, secondsPerExercise, chapterId? }
  seed           text not null,                     -- makes exercise selection reproducible
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz,
  outcome        text check (outcome in ('win', 'draw', 'aborted')),
  winner_user_id uuid references users(id) on delete set null
);

create table challenges (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references users(id) on delete cascade,
  to_user      uuid not null references users(id) on delete cascade,
  kind         text not null default 'book_battle' check (kind in ('book_battle')),
  ranked       boolean not null default false,
  config       jsonb not null,                      -- { bookId, chapterId?, exerciseCount, secondsPerExercise }
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  battle_id    uuid references battles(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  responded_at timestamptz,
  check (from_user <> to_user)
);
create index challenges_to_idx on challenges (to_user, status);
create index challenges_from_idx on challenges (from_user, status);

create table battle_participants (
  battle_id   uuid not null references battles(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  state       text not null default 'playing' check (state in ('playing', 'finished', 'forfeit')),
  score       integer not null default 0,
  correct     integer not null default 0,
  time_ms     bigint not null default 0,
  joined_at   timestamptz not null default now(),
  finished_at timestamptz,
  primary key (battle_id, user_id)
);
create index battle_participants_user_idx on battle_participants (user_id, joined_at desc);

create table battle_exercises (
  battle_id     uuid not null references battles(id) on delete cascade,
  ord           integer not null,
  exercise_id   text not null,
  content_key   text not null,                      -- both players' copies must match this
  time_limit_ms integer not null check (time_limit_ms > 0),
  primary key (battle_id, ord)
);

-- One row per player per exercise. started_at and deadline_at come from the
-- database clock when the exercise is served; the client clock is never used.
create table match_attempts (
  battle_id    uuid not null,
  ord          integer not null,
  user_id      uuid not null references users(id) on delete cascade,
  started_at   timestamptz not null default now(),
  deadline_at  timestamptz not null,
  submitted_at timestamptz,
  moves        jsonb,                               -- the player's own moves, UCI
  status       text not null default 'open' check (status in ('open', 'scored', 'timeout')),
  correct      boolean,
  time_ms      bigint,
  points       integer,
  primary key (battle_id, ord, user_id),
  foreign key (battle_id, ord) references battle_exercises(battle_id, ord) on delete cascade,
  foreign key (battle_id, user_id) references battle_participants(battle_id, user_id) on delete cascade
);

alter table friendships         enable row level security;
alter table friendships         force  row level security;
alter table challenges          enable row level security;
alter table challenges          force  row level security;
alter table battles             enable row level security;
alter table battles             force  row level security;
alter table battle_participants enable row level security;
alter table battle_participants force  row level security;
alter table battle_exercises    enable row level security;
alter table battle_exercises    force  row level security;
alter table match_attempts      enable row level security;
alter table match_attempts      force  row level security;

create policy party on friendships
  using (app_is_system() or app_user_id() in (user_a, user_b))
  with check (app_is_system() or app_user_id() in (user_a, user_b));
create policy party on challenges
  using (app_is_system() or app_user_id() in (from_user, to_user))
  with check (app_is_system() or app_user_id() in (from_user, to_user));

-- Battles span two accounts, so they are reachable only through the battle
-- service (src/server/battles.ts), which runs in system context and checks
-- that the caller is a participant before returning anything.
create policy service_only on battles             using (app_is_system()) with check (app_is_system());
create policy service_only on battle_participants using (app_is_system()) with check (app_is_system());
create policy service_only on battle_exercises    using (app_is_system()) with check (app_is_system());
create policy service_only on match_attempts      using (app_is_system()) with check (app_is_system());
