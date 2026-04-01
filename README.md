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

## Supported Beta Surface (Wave 1)

For the Wave 1 private-beta, **the legacy learner shell (`apps/web/public/*`) is the single supported learner surface.**

The React app is a secondary development surface and is **parity-gated**. Implementation path: `apps/web-react`. It remains an unsupported preview until it passes the full Playwright browser QA suite and meets the promotion criteria defined in `docs/product-completion-milestones.md`.

```bash
# Start the legacy API + web shell (Supported Beta Surface)
node services/api/server.mjs

# Open in browser
open http://localhost:4321
```

The React app is NOT supported for beta use:
```bash
# Run the React app (Secondary / Parity-Gated / Unsupported)
npm run dev:react
```

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
  web/          (Primary Learner Beta Shell)
  web-react/    (Secondary / Unsupported / Parity-Gated)
  mobile/       (Skeleton only — Non-functional placeholder)
  admin/        (Skeleton only — Non-functional placeholder)
services/
  api/
  worker/       (Skeleton only — Non-functional placeholder)
  tutor/
  analytics/    (Skeleton only — Non-functional placeholder)
  content-pipeline/ (Skeleton only — Non-functional placeholder)
packages/
...
infrastructure/
  terraform/    (Skeleton only — Non-functional placeholder)
```

**Note on Skeleton Directories:** Directories marked as "Skeleton only" are architectural placeholders for future Wave releases. They contain non-functional scaffolding and are not supported for any use in the Wave 1 private beta.


## Validation

Run the full test suite:
```bash
node --test
```

Or via npm:
```bash
npm run check
npm run check:ci-local
```

## Runtime modes

### Local fallback mode

Local development can still use env-gated file-backed state without external services:

```bash
HELIX_STATE_FILE=.data/helix-sat-state.json node services/api/server.mjs
```

If the state file becomes malformed, the server falls back to seeded state
and preserves the bad file as `*.corrupt-<timestamp>` for inspection.

Limitation: file-backed mode is for a single local server process.

### Beta-safe mode

Production-like / beta-safe environments now require:

```bash
HELIX_RUNTIME_MODE=staging
HELIX_DATABASE_URL=postgresql://user:pass@host:5432/helix
HELIX_REDIS_URL=redis://host:6379/0
HELIX_TOKEN_SECRET=replace-me
HELIX_LEGACY_PASSWORD_SECRET=replace-me
node services/api/server.mjs
```

In beta-safe mode:
- PostgreSQL is the durable system of record for mutable learner state and auth session records.
- Redis backs auth rate limiting and revocation lookup.
- demo auth is blocked.
- fallback secrets are rejected.

### Release gate

The local release-equivalent command is:

```bash
HELIX_SMOKE_SCREENSHOT=artifacts/learner-smoke.png npm run check:ci-local
```

See `docs/beta-ops.md` for operating constraints and `docs/release-checklist.md` for the operator handoff checklist.
