// Applied automatically (idempotently) on first DB use — no separate migration step.
export const SCHEMA_SQL = `
create table if not exists weekly_snapshots (
  id              bigserial primary key,
  week_start      date not null,
  week_end        date not null,
  version         int,
  status          text not null check (status in ('draft','published','archived')),
  uploaded_at     timestamptz not null default now(),
  uploaded_by     text not null,
  source_filename text not null,
  blob_url        text not null,
  data            jsonb not null,
  warnings        jsonb not null default '[]',
  published_at    timestamptz,
  unique (week_start, version)
);
create unique index if not exists one_published_per_week on weekly_snapshots (week_start) where status = 'published';
create table if not exists config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists login_attempts (
  ip           text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists login_attempts_ip on login_attempts (ip, attempted_at);
`;
