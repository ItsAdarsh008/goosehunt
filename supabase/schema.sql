-- Goosehunt schema. Paste into Supabase -> SQL Editor -> Run.
-- All access goes through the Next.js API using the server-only secret key,
-- so RLS is enabled with NO policies: the public anon key can read nothing.

create extension if not exists pgcrypto;

create table if not exists games (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  status                text not null default 'lobby' check (status in ('lobby', 'active', 'ended')),
  ping_interval_seconds int  not null default 300 check (ping_interval_seconds between 30 and 3600),
  duration_seconds      int  check (duration_seconds is null or duration_seconds > 0),
  started_at            timestamptz,
  ended_at              timestamptz,
  end_reason            text,
  created_at            timestamptz not null default now()
);

create table if not exists players (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games(id) on delete cascade,
  name           text not null,
  role           text not null default 'hider' check (role in ('hider', 'seeker')),
  is_host        boolean not null default false,
  token_hash     text not null,
  caught_at      timestamptz,
  caught_by      uuid references players(id) on delete set null,
  last_lat       double precision,
  last_lng       double precision,
  last_accuracy  double precision,
  last_ping_at   timestamptz,
  last_ping_slot int,
  joined_at      timestamptz not null default now(),
  unique (game_id, name)
);
create index if not exists players_token_idx on players (game_id, token_hash);

create table if not exists pings (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references games(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  slot       int  not null,
  lat        double precision not null,
  lng        double precision not null,
  accuracy   double precision,
  created_at timestamptz not null default now(),
  unique (player_id, slot)
);
create index if not exists pings_game_slot_idx on pings (game_id, slot desc);

alter table games   enable row level security;
alter table players enable row level security;
alter table pings   enable row level security;

-- Optional housekeeping: delete games older than 2 days (run manually, or schedule with pg_cron).
-- delete from games where created_at < now() - interval '2 days';
