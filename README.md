# Project Helix SAT

Adaptive SAT Intelligence Platform foundation for the AI-powered SAT app described in the master plan.

## What is in this repo now
- **Workspace scaffold** for apps, services, packages, docs, infrastructure, and scripts
- **Core architecture docs** translating the master plan into implementable boundaries
- **v1 domain ontology + error taxonomy**
- **JSON schemas** for the most important AI/runtime contracts
- **PostgreSQL starter schema** for learners, items, attempts, sessions, plans, predictions, and tutor traces
- **OpenAPI starter contract** for the learning/tutor core
- **Zero-dependency verification scripts/tests** so the foundation is machine-checkable immediately

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

## Immediate next build steps
1. Bootstrap the API service and persist the starter schema.
2. Build the diagnostic + attempt/event ingestion path.
3. Implement the daily planner contract against real learner state.
4. Add tutor hint orchestration bound to canonical rationale data only.
5. Stand up the CMS/content DSL flow before large-scale content authoring.

## Validation
Run:
```bash
npm run check
```
