# Private Beta Execution Plan — Project Helix SAT

## Goal
Ship the next private-beta slice as three reviewable lanes grounded in the repo's current learner shell, contract surface, browser smoke runner, and realism audit.

## Repo-grounded findings

1. **Contract drift risk is real right now.**
   - Runtime routes exist for `GET/POST /api/goal-profile`, `GET /api/next-best-action`, and `GET /api/diagnostic/reveal` in `services/api/src/router.mjs`.
   - Their response/request shapes are still primarily defined inline in `services/api/src/validation.mjs` instead of as dedicated files under `packages/schemas/`.
   - `services/api/openapi.yaml` documents `plan/explanation`, `projection/evidence`, and `learner-narrative`, but does **not** currently document `goal-profile`, `next-best-action`, or `diagnostic/reveal`.
   - `apps/web/public/app.js` fetches all of these surfaces independently inside `loadDashboard()`, so contract drift will land directly in the learner shell.

2. **The browser smoke runner already covers most of the requested activation path, but it is still one broad happy-path check.**
   - `scripts/run-playwright-learner-smoke.mjs` currently exercises signup, goal setup, diagnostic preflight/start, reveal, quick win, dashboard expansion, review recommendations, and exam-profile module start.
   - The remaining weakness is not total absence; it is insufficiently explicit guardrails around interrupted/resumed flows, review assertions, and failure localization.
   - `docs/quality/learner-web-review.md` still calls out visual QA as "mostly headless," so beta-readiness needs stronger documented QA expectations.

3. **The next realism/content gains are already named by the repo's own audit and docs.**
   - `README.md`, `docs/sat-coverage-audit.md`, and `docs/quality/bluebook-khan-slice.md` all point to the same highest-leverage realism gaps: longer/more honest module realism, richer authored remediation, and deeper content realism without overclaiming parity.
   - `docs/product-completion-milestones.md` already frames the private-beta slice, but lane ordering should now be tightened around contract freeze first, QA second, realism/content third.

---

## Lane 1 — Freeze learner product contracts before more UI drift

### Why first
This lane reduces the biggest product-risk multiplier: multiple learner surfaces already depend on payloads whose canonical source of truth is split across `store.mjs`, inline validator objects, and partially incomplete OpenAPI coverage.

### Primary files
- `packages/schemas/README.md`
- `packages/schemas/planning/*.json`
- `packages/schemas/reporting/*.json`
- `services/api/src/validation.mjs`
- `services/api/src/router.mjs`
- `services/api/openapi.yaml`
- `services/api/src/store.mjs`
- `apps/web/public/app.js`
- `tests/api.test.mjs`
- `tests/project-helix-sat-audit.test.mjs`

### Concrete work
1. Move `goal-profile`, `next-best-action`, and `diagnostic-reveal` to dedicated schema files under `packages/schemas/`.
2. Decide whether `session_outcome` and `review_remediation_card` also become explicit standalone schemas now or remain dashboard-owned with an explicit defer note.
3. Make `services/api/src/validation.mjs` load those schemas instead of owning their full shapes inline.
4. Add the missing learner-product endpoints to `services/api/openapi.yaml`.
5. Keep `apps/web/public/app.js` as a renderer/consumer only; do not let it become a fallback schema author.
6. Add contract-truth tests so route exposure, validator wiring, and OpenAPI stay aligned.

### Acceptance criteria
- Dedicated schema files exist for `goal-profile`, `next-best-action`, and `diagnostic-reveal`.
- `validation.mjs` references package schemas instead of duplicating those contracts inline.
- `openapi.yaml` documents `/api/goal-profile`, `/api/next-best-action`, and `/api/diagnostic/reveal`.
- API tests verify those endpoints against stable response expectations.
- Dashboard/bootstrap code continues to consume the same payloads without adding browser-side shaping logic.

### Risks
- Partial migration could leave runtime validation and OpenAPI disagreeing.
- Over-scoping into every dashboard child payload would slow the lane.
- `app.js` is still large, so even safe contract changes can surface hidden coupling.

---

## Lane 2 — Expand browser QA from one broad smoke to explicit beta guardrails

### Why second
The core activation path already exists; the next leverage is making regressions legible before beta users hit them.

### Primary files
- `scripts/run-playwright-learner-smoke.mjs`
- `apps/web/public/app.js`
- `apps/web/public/index.html`
- `apps/web/public/styles.css`
- `tests/project-helix-sat-audit.test.mjs`
- `docs/quality/learner-web-review.md`
- `docs/product-completion-milestones.md`

### Concrete work
1. Split the existing smoke expectations into named checkpoints for:
   - signup landing
   - goal setup completion/resume
   - diagnostic preflight/start
   - diagnostic reveal CTA
   - quick-win completion
   - dashboard review visibility
   - exam-profile module start
2. Add assertions for the fragile transitions that are currently implicit:
   - resumed active diagnostic / resume CTA behavior
   - review lesson-pack visibility and retry actions after the first session
   - section-specific exam-profile labeling before module start
   - duplicate-ID and answer-input checks staying intact across the whole path
3. Keep the smoke runner dependency-free at repo level (`--no-save playwright` remains acceptable).
4. Update documentation so a smoke failure maps to a product surface instead of a generic learner-shell failure.
5. Define a short manual-browser pass for beta-signoff because the repo already flags headless-only QA as insufficient.

### Acceptance criteria
- Smoke output or structure makes each activation checkpoint identifiable.
- The path explicitly covers signup → goal setup → diagnostic → reveal → quick win → dashboard review → exam-profile module start.
- Failing assertions identify the broken phase, not just "smoke failed."
- Docs state which checks are automated versus manual before beta.
- Existing release-bar/audit tests still pass.

### Risks
- One giant smoke file can become harder to debug if expansion happens without structure.
- Browser timing flakes may increase if checkpoint waits stay too implicit.
- If `app.js` markup shifts, QA can become brittle unless selectors stay contract-like.

---

## Lane 3 — Highest-leverage realism/content-depth improvements after contracts and QA

### Why third
The repo's own audit already says the biggest remaining realism gap is not missing skills but believable module shape and deeper authored remediation.

### Primary files
- `docs/quality/bluebook-khan-slice.md`
- `docs/sat-coverage-audit.md`
- `docs/audits/project-helix-sat-coverage.md`
- `docs/product-completion-milestones.md`
- `content/README.md`
- `packages/assessment/src/project-helix-sat-audit.mjs`
- `packages/curriculum/src/lesson-assets.mjs`
- `apps/web/public/review-lesson-pack.js`
- `services/api/src/store.mjs`
- `scripts/check-content-release-bars.mjs`

### Concrete work
1. Pick one realism slice that changes learner trust fastest without forcing a full exam rebuild:
   - stronger module-shape honesty and section-specific framing,
   - deeper authored lesson/remediation assets for top review paths,
   - modest expansion of format realism where audit/docs can still stay honest.
2. Keep the audit, README, and quality docs synchronized with shipped behavior.
3. Prioritize improvements that make reveal → quick win → review → module feel like one authored learning story rather than isolated surfaces.
4. Preserve the repo's current guardrails: no new dependencies, no fake Bluebook parity claims, reviewable diffs.

### Acceptance criteria
- The chosen realism/content slice is visible in both product behavior and audit/docs language.
- Audit snapshots and narrative docs agree on what improved and what still remains incomplete.
- Remediation/review copy and lesson assets feel more authored for the top path, not just longer.
- `npm run audit:helix`, `npm run audit:helix:bars`, and docs-truth checks stay aligned.

### Risks
- Realism work can sprawl into broad content-generation changes.
- Audit/doc dishonesty risk rises if product and docs are not updated together.
- Content-depth work without contract freeze can create more payload drift.

---

## Recommended sequencing

1. **Lane 1 first** — freeze the contract layer so UI, tests, and docs stop drifting independently.
2. **Lane 2 second** — lock the beta-critical learner path with clearer browser guardrails.
3. **Lane 3 third** — ship the most leverage-heavy realism/content slice once the product surface is safer to change.

## Suggested staffing split
- **Executor/API lane:** schemas, validation, router, OpenAPI, API tests.
- **Executor/QA lane:** smoke runner structure, selectors/assertions, QA docs.
- **Executor/content lane:** audit-aligned realism/content improvements plus doc refresh.
- **Verifier lane:** `npm test`, `npm run check`, `npm run audit:helix:bars`, `npm run check:docs-truth`, plus smoke evidence.

## Exit criteria for the overall private-beta slice
- Learner-contract surfaces are explicit, documented, and validator-backed.
- The activation path has durable automated browser coverage plus a documented manual pass.
- The next realism/content improvement is shipped without overclaiming SAT parity.
- Audit/docs/README/OpenAPI all tell the same story.
