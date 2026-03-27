# Project Helix SAT

Adaptive SAT Intelligence Platform — an AI-powered SAT prep app with adaptive item selection, token-based auth, and exam integrity controls.

## Current capabilities

- **Token-based authentication** — HMAC-SHA256 signed tokens with 24-hour expiry, login UI with localStorage persistence
- **Role-based access control** — four roles (student, teacher, parent, admin) enforced at the API layer
- **Exam integrity** — answer leak prevention (sealed answers), server-authoritative timing
- **Adaptive item selection** — selector-based engine with exposure tracking and skill targeting
- **Contract-enforced API** — OpenAPI + JSON schemas aligned with runtime, request validation via middleware
- **Cold-start handling** — `insufficient_evidence` and `needs_diagnostic` states for new learners
- **Content library** — 11 items across 8 skills with full rationales
- **Test suite** — 64 tests passing (`node --test`)
- **Login UI** — web shell with credential entry and localStorage token persistence

## Quick Start

```bash
# Start the API server + web shell
node services/api/server.mjs

# Open in browser
open http://localhost:3000

# Login with demo credentials
#   Email:    mina@example.com
#   Password: demo123
```

## API Authentication

Obtain a token via the login endpoint:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"mina@example.com","password":"demo123"}'
```

The response includes a `token` field. Use it as a Bearer token on subsequent requests:

```bash
curl -H 'Authorization: Bearer <token>' http://localhost:3000/api/dashboard/learner
```

Tokens expire after 24 hours. Re-authenticate to obtain a fresh token.

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

Run the full test suite (64 tests):
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
