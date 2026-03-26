-- Project Helix SAT starter schema (PostgreSQL)

create table if not exists users (
  id text primary key,
  email text not null unique,
  role text not null check (role in ('student', 'parent', 'teacher', 'admin')),
  locale text not null default 'en-US',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table if not exists learner_profiles (
  user_id text primary key references users(id) on delete cascade,
  target_score integer check (target_score between 400 and 1600),
  target_test_date date,
  daily_minutes integer not null default 30 check (daily_minutes between 5 and 600),
  preferred_explanation_language text not null default 'en',
  current_score_band_low integer,
  current_score_band_high integer,
  motivation_style text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists skills (
  id text primary key,
  section text not null check (section in ('reading_writing', 'math')),
  domain text not null,
  skill text not null,
  subskill text,
  unique (section, domain, skill, subskill)
);

create table if not exists learner_skill_states (
  user_id text not null references users(id) on delete cascade,
  skill_id text not null references skills(id) on delete cascade,
  mastery numeric(4,3) not null default 0 check (mastery between 0 and 1),
  timed_mastery numeric(4,3) not null default 0 check (timed_mastery between 0 and 1),
  confidence_calibration numeric(4,3) not null default 0.5 check (confidence_calibration between 0 and 1),
  retention_risk numeric(4,3) not null default 0 check (retention_risk between 0 and 1),
  careless_risk numeric(4,3) not null default 0 check (careless_risk between 0 and 1),
  hint_dependency numeric(4,3) not null default 0 check (hint_dependency between 0 and 1),
  trap_susceptibility numeric(4,3) not null default 0 check (trap_susceptibility between 0 and 1),
  last_seen_at timestamptz,
  attempts_count integer not null default 0,
  primary key (user_id, skill_id)
);

create table if not exists content_items (
  item_id text primary key,
  canonical_version integer not null default 1,
  section text not null check (section in ('reading_writing', 'math')),
  domain text not null,
  skill_id text not null references skills(id),
  difficulty_band text not null check (difficulty_band in ('easy', 'medium', 'hard')),
  item_format text not null,
  source_type text not null default 'original',
  stem text not null,
  passage text,
  choices jsonb,
  answer_key text not null,
  status text not null check (status in ('draft', 'review', 'beta', 'production', 'flagged', 'retired')),
  exposure_count integer not null default 0,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists item_rationales (
  item_id text primary key references content_items(item_id) on delete cascade,
  canonical_correct_rationale text not null,
  canonical_wrong_rationales jsonb not null,
  hint_ladder_json jsonb not null,
  misconception_tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null check (type in ('diagnostic', 'learn', 'drill', 'review', 'timed_set', 'module_simulation', 'mock')),
  started_at timestamptz not null,
  ended_at timestamptz,
  energy_self_report integer check (energy_self_report between 1 and 5),
  focus_score numeric(4,3) check (focus_score between 0 and 1),
  notes text
);

create table if not exists session_items (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  item_id text not null references content_items(item_id),
  ordinal integer not null,
  section text not null check (section in ('reading_writing', 'math')),
  module_label text,
  delivered_at timestamptz,
  answered_at timestamptz,
  unique (session_id, ordinal)
);

create table if not exists attempts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  item_id text not null references content_items(item_id),
  session_id text not null references sessions(id) on delete cascade,
  selected_answer text,
  is_correct boolean not null,
  response_time_ms integer not null check (response_time_ms >= 0),
  changed_answer_count integer not null default 0,
  confidence_level integer check (confidence_level between 1 and 4),
  hint_count integer not null default 0,
  tutor_used boolean not null default false,
  mode text not null,
  created_at timestamptz not null default now()
);

create table if not exists daily_plans (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  plan_date date not null,
  plan_json jsonb not null,
  completion_ratio numeric(4,3) not null default 0 check (completion_ratio between 0 and 1),
  generated_by_version text not null,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists score_predictions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  predicted_total_low integer not null,
  predicted_total_high integer not null,
  rw_low integer not null,
  rw_high integer not null,
  math_low integer not null,
  math_high integer not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  model_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists tutor_threads (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  session_id text references sessions(id) on delete cascade,
  item_id text references content_items(item_id),
  mode text not null,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists tutor_messages (
  id text primary key,
  thread_id text not null references tutor_threads(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null,
  structured_payload jsonb,
  latency_ms integer,
  model text,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  session_id text references sessions(id) on delete set null,
  event_name text not null,
  payload_json jsonb not null,
  ts timestamptz not null default now()
);

create index if not exists idx_attempts_user_created_at on attempts (user_id, created_at desc);
create index if not exists idx_events_user_ts on events (user_id, ts desc);
create index if not exists idx_content_items_skill_status on content_items (skill_id, status);
