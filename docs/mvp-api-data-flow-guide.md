# MVP API/Data Flow Guide

## Purpose
This guide translates the current SAT foundation into a zero-dependency MVP vertical slice implementation plan focused on API boundaries, data ownership, and execution order.

It covers the six product flows already implied by the foundation:
1. diagnostic start
2. attempt submission
3. daily plan generation
4. tutor hinting
5. score projection
6. minimal learner dashboard

## Foundation already in place
The current repo already gives the MVP most of its contracts:
- runtime boundary: `services/api/openapi.yaml`
- core persistence: `packages/db/schema.sql`
- plan contract: `packages/schemas/planning/daily-plan.schema.json`
- tutor contracts: `packages/schemas/tutor/*.schema.json`
- score contract: `packages/schemas/scoring/score-prediction.schema.json`
- event envelope: `packages/schemas/events/event-envelope.schema.json`
- product/runtime rules: `docs/architecture.md`, `docs/roadmap.md`

For the MVP, keep the runtime as a modular monolith:
- `services/api` is the only HTTP entrypoint
- `packages/assessment`, `packages/scoring`, and planner logic stay deterministic and in-process
- `services/tutor` remains a thin orchestration boundary grounded in `item_rationales`
- `services/worker` is optional at first and can be limited to non-blocking recompute jobs once the synchronous slice works

## Zero-dependency MVP operating rules
- Prefer Node built-ins, SQL, and JSON contracts already present in the repo.
- Compute synchronously when the learner is waiting on the answer.
- Defer asynchronous fan-out until after the vertical slice is working end-to-end.
- Treat canonical item content and rationale data as the source of truth; tutor output is a formatter over stored content.
- Persist facts first, derive views second.

## Recommended package/service ownership

### `services/api`
Owns HTTP route handlers, request validation wiring, transaction boundaries, and composed dashboard reads.

### `packages/db`
Owns SQL schema, seed assumptions, and SQL query helpers once code is added.

### `packages/assessment`
Owns deterministic session assembly and diagnostic item selection.

### planner module inside `services/api` initially
For MVP speed, implement plan generation in-process inside the API service. Extract later only if needed.

### `packages/scoring`
Owns deterministic projection math, readiness state mapping, and confidence band logic.

### `services/tutor`
Owns hint orchestration only. It reads attempt context plus canonical rationale data and returns structured JSON matching the existing tutor schemas.

## Minimal data model gaps to close first
The current schema is close, but one small addition is needed for reliable session delivery.

### Add `session_items`
Current tables store sessions and attempts, but not the ordered item assignment for a session. Add a join table before building `/diagnostic/start`.

Suggested shape:

```sql
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
```

Why this is the only required addition for the vertical slice:
- diagnostic start needs a pinned item order
- attempt submission needs a way to verify the item belongs to the session
- the dashboard can derive progress from assigned vs answered session items

Everything else can be computed from existing tables:
- learner state: `learner_skill_states`
- plans: `daily_plans.plan_json`
- score bands: `score_predictions`
- tutor traces: `tutor_threads`, `tutor_messages`
- telemetry: `events`

## API surface for the MVP slice
The current OpenAPI file already exposes four required routes:
- `POST /diagnostic/start`
- `POST /attempt/submit`
- `GET /plan/today`
- `POST /tutor/hint`

To complete the requested vertical slice, add two read endpoints in the implementation plan:
- `GET /projection/latest`
- `GET /dashboard/learner`

This keeps the slice coherent without introducing extra services.

## Route-by-route data flow

### 1) `POST /diagnostic/start`
**Goal:** create a diagnostic session with a fixed ordered item set.

**Reads**
- `learner_profiles`
- `skills`
- `content_items`

**Writes**
- `sessions`
- `session_items`
- `events` (`diagnostic_started`)

**Response should include**
- `session_id`
- session type and start timestamp
- ordered first item payload or the first page of session items
- exam/tutor policy flags

**Implementation notes**
- Start with deterministic blueprint selection from `packages/assessment`.
- Avoid adaptive branching during the first diagnostic MVP; pin the whole session at creation time.
- Mark tutor availability off for strict diagnostic mode if product wants exam-like behavior.

### 2) `POST /attempt/submit`
**Goal:** accept an answer, persist it, and update learner state immediately enough for the next read.

**Reads**
- `session_items` to verify membership and ordinal
- `content_items` for answer key and skill binding
- `learner_skill_states` current row for the learner/skill

**Writes**
- `attempts`
- `learner_skill_states`
- `events` (`answer_selected`, `answer_changed`, and/or `session_completed` when applicable)
- optional `score_predictions` refresh when the session or threshold condition completes

**Synchronous behavior recommended for MVP**
1. validate session + item membership
2. score correctness from canonical answer key
3. insert attempt
4. upsert learner skill state for the associated skill
5. mark `session_items.answered_at`
6. if the session is complete, refresh latest score projection inline
7. return accepted attempt plus next-session progress metadata

**Why inline update is preferable now**
The next plan, projection, and dashboard reads all depend on fresh learner state. Delaying the write behind a queue would add product inconsistency without enough scale benefit in v0.

### 3) `GET /plan/today`
**Goal:** return one cached or newly generated daily plan grounded in current learner state.

**Reads**
- `learner_profiles`
- `learner_skill_states`
- recent `attempts`
- latest `score_predictions` if present
- existing `daily_plans` for the current date

**Writes when missing or stale**
- `daily_plans`
- optional `events` (`plan_accepted` is separate and should happen only after explicit learner action)

**Generation strategy for MVP**
- Read-through cache: if today's plan exists and learner state has not materially changed, return it.
- Otherwise compute inline, persist to `daily_plans`, and return the stored JSON.

**Ranking inputs to keep deterministic**
- low mastery
- high retention risk
- high careless risk
- recent wrong attempts
- learner daily minute budget
- proximity to target test date

This matches the existing product rule that the planner optimizes score-delta-per-minute.

### 4) `POST /tutor/hint`
**Goal:** return a structured hint grounded in stored rationale data, never freeform invention.

**Reads**
- `attempts` or current attempt context from the request
- `content_items`
- `item_rationales`
- optional latest learner skill state for tone/level selection

**Writes**
- `tutor_threads` (create if absent)
- `tutor_messages`
- `events` (`hint_requested`)

**Response contract**
Use `packages/schemas/tutor/hint-response.schema.json` exactly.

**MVP orchestration rule**
- If the mode is exam/blocked, return `mode: exam_blocked` and `source_of_truth: exam_policy`.
- Otherwise select the correct hint level from `item_rationales.hint_ladder_json` and optionally attach a diagnosis object derived from the taxonomy.
- Never require model inference to answer when canonical hint ladder data is present.

### 5) `GET /projection/latest`
**Goal:** expose the latest learner-facing score band and readiness state.

**Reads**
- latest `score_predictions`
- `learner_profiles`
- `learner_skill_states`
- recent `attempts` when a projection must be recomputed

**Writes when missing or stale**
- `score_predictions`

**Computation recommendation**
For MVP, store projections as snapshots instead of computing them on every read. This makes the dashboard cheap and preserves versioned outputs, which the architecture doc already requires.

**Refresh triggers**
- diagnostic completion
- session completion
- enough new attempts since the last snapshot
- explicit dashboard read with no prior snapshot

### 6) `GET /dashboard/learner`
**Goal:** provide the minimal learner home payload in one call.

**Reads**
- `learner_profiles`
- today's `daily_plans`
- latest `score_predictions`
- active `sessions` and `session_items`
- recent `attempts`

**Writes**
- none by default
- allowed read-through writes: generate today's plan or latest projection if absent

**Recommended response sections**
- learner summary: target score, current score band, daily minutes
- today: plan headline, completion ratio, next block
- progress: active session state, answered vs assigned count
- score: latest projection band and readiness indicator
- review: recent weak skills inferred from latest wrong attempts

This endpoint should be a read model over already-persisted tables, not a second rules engine.

## Canonical transaction boundaries

### Transaction A: diagnostic session creation
Single DB transaction:
- insert `sessions`
- insert ordered `session_items`
- insert `events`

### Transaction B: attempt submission
Single DB transaction:
- validate session/item
- insert `attempts`
- upsert `learner_skill_states`
- update `session_items`
- optionally close `sessions` when complete
- insert telemetry event rows

### Transaction C: plan generation
Single DB transaction around storing one daily snapshot:
- compute from current reads
- insert or update `daily_plans`

### Transaction D: score projection refresh
Single DB transaction:
- compute deterministic band
- insert `score_predictions`
- optionally mirror band into `learner_profiles.current_score_band_*`

Tutor trace writes can be their own small transaction because they should never block attempt acceptance.

## Event strategy for the MVP
Use the existing `events` table as a durable append log, but do not build a full event-driven architecture yet.

Recommended event names already supported by the schema:
- `diagnostic_started`
- `answer_selected`
- `answer_changed`
- `hint_requested`
- `session_completed`
- `plan_accepted`
- `plan_skipped`

Practical rule:
- write the event row in the same request that produced the user-visible state change
- analyze those events later in `services/analytics`
- do not require an event consumer for the core learner flow to work

## Suggested implementation order

### Lane 1 — storage + route scaffolding
1. add `session_items`
2. wire `POST /diagnostic/start`
3. wire `POST /attempt/submit`

### Lane 2 — deterministic derived state
1. implement learner skill-state updater
2. implement daily plan generator
3. implement score projection refresher

### Lane 3 — learner-facing read models
1. wire `GET /plan/today`
2. wire `GET /projection/latest`
3. wire `GET /dashboard/learner`

### Lane 4 — tutor orchestration
1. wire `POST /tutor/hint`
2. persist tutor traces
3. enforce exam-mode blocking rule

Parallelization note: lanes 2 and 4 can move in parallel once attempt persistence is stable, because both depend on stored canonical data rather than each other.

## Repo-level file plan for implementation
Use the current repo structure without new dependencies.

Suggested additions when coding starts:
- `services/api/src/routes/diagnostic-start.*`
- `services/api/src/routes/attempt-submit.*`
- `services/api/src/routes/plan-today.*`
- `services/api/src/routes/projection-latest.*`
- `services/api/src/routes/dashboard-learner.*`
- `services/api/src/routes/tutor-hint.*`
- `services/api/src/domain/planner.*`
- `services/api/src/domain/learner-state.*`
- `packages/assessment/src/diagnostic-assembly.*`
- `packages/scoring/src/projection.*`
- `packages/db/migrations/*session-items*`

The exact runtime can stay undecided for now; the important constraint is that the business logic remain dependency-light and grounded in the current schema/contracts.

## Risks to avoid in the MVP
- Do not make plan generation depend on async workers before synchronous correctness exists.
- Do not let tutor responses bypass `item_rationales`.
- Do not compute dashboard data from raw events when first-class tables already exist.
- Do not split projection state between multiple write paths; choose one refresh function.
- Do not let diagnostic sessions mutate their assigned item order after creation.

## Definition of done for the vertical slice
The API/data-flow slice is coherent when:
- a learner can start a diagnostic session with pinned items
- each submitted attempt updates learner state immediately
- today's plan is retrievable from current learner state
- tutor hints resolve from canonical rationale data
- a latest score projection snapshot exists and is readable
- the learner dashboard can render from one composed API response
