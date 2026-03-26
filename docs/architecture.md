# Architecture v0.1

## Product boundary
Project Helix SAT is an **Adaptive SAT Intelligence Platform** that combines:
- SAT-aligned original content
- learner-state modeling
- canonical explanation delivery
- adaptive planning and assessment
- operator tooling for content and analytics

## Initial architecture decision
Start with a **modular monolith** for delivery speed and schema consistency.
Split only when load, ownership, or deployment cadence justifies it.

## Module map
### Frontend surfaces
- `apps/web`: primary learner product and exam-mode surface
- `apps/admin`: CMS, QA, analytics triage, item review
- `apps/mobile`: optional learner companion, not primary exam surface

### Backend/service boundaries
- `services/api`: auth, learner profile, plan, attempts, review, projections API
- `services/tutor`: tutor orchestration, tool routing, structured responses
- `services/worker`: async jobs for reports, retraining, content processing
- `services/analytics`: event ingestion transforms, warehouse sync, cohort reporting
- `services/content-pipeline`: offline item generation/review/calibration pipeline

### Shared packages
- `packages/schemas`: JSON schemas for runtime AI and API payloads
- `packages/content-dsl`: authoring DSL and validators for SAT-aligned items
- `packages/db`: SQL migrations and data contracts
- `packages/scoring`: projected-score and readiness logic
- `packages/assessment`: blueprint/test assembly logic
- `packages/telemetry`: event names and envelopes
- `packages/types`: cross-surface TS model layer (to be added with TS bootstrap)

## Runtime AI layering
### Offline AI
Used for:
- item drafting
- distractor review
- rationale drafting
- ambiguity scanning
- psychometric prechecks
- evaluation reporting

### Online AI
Used for:
- hint ladder delivery
- error diagnosis
- daily plan generation
- tutor chat
- teacher/parent summaries

### Hard rule
Online AI must ground itself in canonical content artifacts. It is a **delivery layer**, not the source of truth.

## Core data flows
1. **Attempt ingestion** -> attempts table + event stream
2. **Learner state update** -> mastery/timed mastery/retention/error DNA updates
3. **Plan generation** -> daily plan blocks ranked by expected benefit per minute
4. **Tutor interaction** -> structured JSON response + trace persistence
5. **Assessment/session completion** -> score band refresh + review queue generation

## Reliability rules
- Exam mode disables tutor generation.
- If tutor is unavailable, static hint ladder still works.
- Score predictions remain banded and versioned.
- Item defects can hot-pull an item from future assembly.

## Non-goals for v0
- exact SAT-score replication claims
- microservice fragmentation
- fully automated item publication
- open-ended chat as the main learning surface
