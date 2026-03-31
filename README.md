# Project Helix SAT

Adaptive SAT Intelligence Platform — an AI-powered SAT prep app with adaptive item selection, cookie-backed auth, curriculum-aware planning, and exam integrity controls.

## Current capabilities

- **Cookie-backed authentication** — HttpOnly `helix_auth` cookie with signed tokens and 24-hour expiry
- **Role-based access control** — four roles (student, teacher, parent, admin) enforced at the API layer
- **Exam integrity** — answer leak prevention (sealed answers), server-authoritative timing
- **Adaptive item selection** — selector-based engine with exposure tracking, skill targeting, and baseline/quick-win routing
- **Contract-enforced API** — OpenAPI + JSON schemas aligned with runtime, request validation via middleware
- **Cold-start handling** — `insufficient_evidence` and `needs_diagnostic` states for new learners
- **Curriculum-aware planning** — goal profile, next-best-action, daily plan, curriculum path, and multi-week program path
- **Lesson-pack depth model** — every tracked skill now carries a middle/full lesson-pack tier so review, revisit, and planning surfaces share the same authored teaching arc
- **Content library** — 79-item demo bank spanning both SAT sections with canonical rationales, hint ladders, and 14 math student-produced responses across grid-in and SPR forms
- **Test suite** — automated regression coverage via `npm test` and `npm run check`
- **Learner shell** — goal setup, 13-item baseline diagnostic, quick win, review remediation, and Playwright smoke coverage on the legacy learner shell (`apps/web/public/*`)

## Quick Start

```bash
# Start the legacy API + web shell
node services/api/server.mjs

# Open in browser
open http://localhost:4321

# Or run the React app with an in-process API
npm run dev:react

# Open in browser
open http://localhost:5173

# Login with demo credentials
#   Email:    mina@example.com
#   Password: demo1234
```

For private-beta browser verification, the currently automated path is still the
legacy learner shell. The React app remains a secondary development surface
until parity browser QA lands.

## API Authentication

Log in via the auth endpoint:

```bash
curl -i -X POST http://localhost:4321/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"mina@example.com","password":"demo1234"}'
```

The server now sets an HttpOnly `helix_auth` cookie and returns auth metadata in the JSON body. Reuse that cookie on subsequent requests:

```bash
curl -b 'helix_auth=<cookie-value>' http://localhost:4321/api/dashboard/learner
```

Sessions expire after 24 hours. Re-authenticate to obtain a fresh cookie.

## SAT content quality snapshot

Current audit status (`npm run audit:helix`):
- Cross-section coverage is **credible for MVP**
- Blueprint coverage is **19/19 skills covered**, with **all 19 skills carrying middle-pack scaffolds** and **11 skills elevated to full-pack**
- Current bank includes **79 items / 79 rationales**, **14 math student-produced responses**, **13-item baseline diagnostic**, **14-item default modules**, and **20-item extended modules**
- Biggest remaining realism gap is **full exam-length module parity**, not missing skill lanes
- The current generator still emits `single_select` only, so hand-authored student-produced responses carry the current math format-realism slice; shipped Math modules now deliberately surface repeated student-response reps (**3** in standard 14-question blocks, **5** in 20-question extended blocks, **6** in the 22-question exam profile)

See `docs/sat-coverage-audit.md` for the narrative audit and `content/README.md` for the content-generation guardrails used in this quality-upgrade slice. For the narrower review brief that defines this first upgrade slice, see `docs/quality/bluebook-khan-slice.md`.
For the next highest-leverage slice toward private beta, see `docs/product-completion-milestones.md`.

## Guiding product decisions captured here
1. Canonical content beats freeform generation.
2. Error DNA is a first-class product asset.
3. Daily planning optimizes score-delta-per-minute, not raw content volume.
4. Exam mode and tutor mode must remain operationally separate.
5. Score outputs are bands/projections, not official-score claims.

## Repository layout
```text
apps/
  web/
  mobile/
  admin/
services/
  api/
  worker/
  tutor/
  analytics/
  content-pipeline/
packages/
  assessment/
  config/
  content-dsl/
  db/
  evals/
  prompts/
  schemas/
  scoring/
  sdk/
  telemetry/
  types/
  ui/
docs/
  architecture.md
  roadmap.md
  ontology/
  taxonomy/
infrastructure/
  terraform/
scripts/
tests/
```

## Validation

Run the full test suite:
```bash
node --test
```

Or via npm:
```bash
npm run check
```

## Durable local state across restarts

The prototype supports env-gated file-backed state without adding dependencies.

```bash
HELIX_STATE_FILE=.data/helix-sat-state.json node services/api/server.mjs
```

If the state file becomes malformed, the server falls back to seeded state
and preserves the bad file as `*.corrupt-<timestamp>` for inspection.

Limitation: file-backed mode is for a single local server process.
