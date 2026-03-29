# Product completion milestones

Last updated: 2026-03-29

Related tracking:
- `docs/security-integrity-issue-log.md` — resolved and follow-up security/integrity issue record

## Why this plan exists

Project Helix SAT already has the core system pieces to function:
- auth and role-scoped access
- learner-state updates
- adaptive item selection
- diagnostic, timed-set, and module-session flows
- request/response validation
- web login shell and session review

The current bottleneck is no longer "can it run?" but "does it feel like a product students trust, understand, and want to return to?" The next delivery slices should therefore optimize for:

1. **first-15-minute activation**
2. **post-session conviction**
3. **visible personalization**
4. **review-as-remediation**
5. **SAT fidelity and content depth**
6. **retention through automatic next actions**

Teacher/parent surfaces remain valuable, but they stay behind learner-product completion unless GTM forces them forward.

## Private beta slice — highest-leverage next work

The next slice toward private beta should stay narrow and reviewable while splitting into three lanes:

### Lane 1 — Strengthen exam/practice realism and learner-surface cohesion
- Keep the learner shell, diagnostic preflight, reveal, quick-win flow, module flow, and return-path copy telling one consistent story about the next best action.
- Make practice and exam profiles feel section-specific and honest about their shape instead of like one generic block with different labels.
- Preserve the current no-new-deps posture and keep the exam path pure: the assessment surfaces should stay assessment-first, not instruction-first.

### Lane 2 — Deepen authored lesson-pack and narrative cohesion
- Keep remediation cards, learner narrative, and quick-win copy aligned around the same teach card / worked example / retry pair / near-transfer pair progression.
- Make the top learner flows feel authored end to end, not stitched together from separate UI fragments with slightly different vocabulary.
- Document the canonical remediation story so reviewable diffs stay easy to inspect across content, UI, and audit copy.

### Lane 3 — Expand Playwright/browser QA and guardrails
- Extend browser smoke coverage across the activation path: signup, goal setup, diagnostic start, reveal, quick win, dashboard review, and exam-profile module start.
- Keep the smoke runner checking for duplicate IDs, answer-input handling, and section-specific module progress without introducing new runtime dependencies.
- Keep guardrails explicit in docs so CI failures point to a concrete product surface instead of a generic smoke failure.

Guardrails for all three lanes:
- no new dependencies
- exam pure-ACK
- reviewable diffs

Current milestone mapping:
- Lane 1 aligns with issues 4.1 and 4.3
- Lane 2 aligns with issue 4.5
- Lane 3 aligns with issue 4.4 and the existing Playwright smoke runner

---

## Product contracts to freeze before major UI work

These payloads should be treated as product contracts. UI work should consume them consistently rather than reinventing logic in the browser.

1. `goal_profile`
2. `diagnostic_reveal`
3. `plan_explanation`
4. `projection_evidence`
5. `error_dna_summary`
6. `session_outcome`
7. `review_remediation_card`
8. `next_best_action`
9. `weekly_digest`

Suggested implementation home:
- `packages/schemas/` for JSON contracts
- `services/api/src/store.mjs` for canonical shaping
- `services/api/src/router.mjs` for route exposure
- `apps/web/public/app.js` for rendering only

---

## Milestone 1 — First 15 Minutes

**Goal:** A new student should move from signup to first recommended session without ever wondering what to do next.

**Definition of done**
- Signup never lands on an empty dashboard
- Goal-setting is captured before the first main dashboard render
- Diagnostic has a clear promise, duration, and payoff
- Diagnostic reveal ends with one obvious CTA into the first score-moving session

### Issue 1.1 — Add post-signup goal capture flow
- **Outcome:** collect test date, goal score, daily time, self-reported weak area
- **Primary files:** `apps/web/public/app.js`, `services/api/src/router.mjs`, `services/api/src/store.mjs`, `services/api/src/validation.mjs`
- **Acceptance criteria:**
  - new students are routed to goal setup before the main dashboard
  - values persist to learner profile
  - goal setup can be resumed if interrupted

### Issue 1.2 — Introduce `goal_profile` API contract
- **Outcome:** one canonical payload for learner goal state
- **Primary files:** `packages/schemas/`, `services/api/src/store.mjs`, `services/api/src/router.mjs`
- **Acceptance criteria:**
  - schema exists
  - response validation enforced
  - browser uses it instead of ad hoc profile fragments

### Issue 1.3 — Add diagnostic preflight surface
- **Outcome:** "12 minutes to your first score-moving plan" style framing before session start
- **Primary files:** `apps/web/public/app.js`
- **Acceptance criteria:**
  - surface explains duration, what Helix is measuring, and what the learner gets after completion
  - CTA starts the diagnostic immediately

### Issue 1.4 — Add in-session diagnostic progress language
- **Outcome:** progress copy explains what is being inferred, not just item counts
- **Primary files:** `apps/web/public/app.js`
- **Acceptance criteria:**
  - progress copy changes meaningfully during the diagnostic
  - copy references pacing/weakness inference rather than generic loading text

### Issue 1.5 — Build `diagnostic_reveal` payload + screen
- **Outcome:** immediate reveal of score band, top leaks, first plan
- **Primary files:** `services/api/src/store.mjs`, `services/api/src/router.mjs`, `packages/schemas/`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - reveal contains score band, confidence, top 2-3 recurring leaks, and first recommended session
  - first CTA enters the recommended session with one click

---

## Milestone 2 — Conviction Surfaces

**Goal:** After every session, the learner should believe Helix understands what changed and why the next session will move the score.

**Definition of done**
- Dashboard shows "why this plan"
- Score band never appears alone; confidence and evidence appear with it
- Learner sees what changed since yesterday/last session
- One primary next action is always visible

### Issue 2.1 — Add `plan_explanation` payload
- **Outcome:** plan cards come with a plain-language reason
- **Primary files:** `services/api/src/store.mjs`, `packages/schemas/`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - every top plan block has a reason sentence
  - reason references recent errors, timing, or projected score impact

### Issue 2.2 — Add `projection_evidence` payload
- **Outcome:** score projection is presented as evidence, not a naked number
- **Primary files:** `packages/scoring/`, `services/api/src/store.mjs`, `packages/schemas/`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - payload includes band, confidence, momentum, and "why this changed"
  - UI does not show a score band without evidence context

### Issue 2.3 — Translate Error DNA into student language
- **Outcome:** internal tags become understandable traps
- **Primary files:** `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - internal tags map to plain-language learner-facing strings
  - dashboard surfaces top 3 recurring traps

### Issue 2.4 — Add "What changed since yesterday" card
- **Outcome:** visible progress delta between sessions
- **Primary files:** `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - card shows improvement, stagnation, or regression with evidence
  - empty-state copy exists for day-one learners

### Issue 2.5 — Add `next_best_action` contract and single CTA
- **Outcome:** home screen always resolves to one recommended next move
- **Primary files:** `packages/schemas/`, `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - exactly one primary CTA is shown on the learner home
  - CTA adapts to active session, unfinished review, or daily plan state

---

## Milestone 3 — Review Loop as Remediation

**Goal:** Review should retrain thinking, not just explain what was wrong.

**Definition of done**
- Session review highlights mistake patterns, not just incorrect items
- Every review card teaches one correction rule
- Every review card offers an immediate retry or near-transfer action
- Review feeds a revisit schedule back into planning

### Issue 3.1 — Add `review_remediation_card` payload
- **Outcome:** standard review unit: misconception, clue, rule, retry
- **Primary files:** `packages/schemas/`, `services/api/src/store.mjs`
- **Acceptance criteria:**
  - each card includes misconception, decisive clue, correction rule, and retry target
  - response validation enforced

### Issue 3.2 — Redesign web review screen around remediation cards
- **Outcome:** review becomes structured instruction instead of raw answer recap
- **Primary files:** `apps/web/public/app.js`
- **Acceptance criteria:**
  - review UI renders remediation cards
  - "close" is not the primary action; retry/revisit is

### Issue 3.3 — Add retry item / near-transfer selection
- **Outcome:** learner can immediately apply the corrected rule
- **Primary files:** `packages/assessment/`, `services/api/src/store.mjs`
- **Acceptance criteria:**
  - each review session can produce at least one retry or near-transfer recommendation
  - repeated identical item replay is not the only path

### Issue 3.4 — Track confidence before/after review
- **Outcome:** remediation shows whether certainty improved along with accuracy
- **Primary files:** `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - review cards can display prior confidence and updated confidence signal

### Issue 3.5 — Feed revisit scheduling back into plan generation
- **Outcome:** reviewed mistakes show up later in a deliberate way
- **Primary files:** `services/api/src/store.mjs`, `packages/assessment/src/daily-plan-generator.mjs`
- **Acceptance criteria:**
  - recent remediations influence later plan blocks
  - revisit timing is visible in UI

---

## Milestone 4 — SAT Fidelity and Content Depth

**Goal:** Make the product feel more like real SAT work and less like a narrow prototype slice.

**Definition of done**
- Partial blueprint lanes are meaningfully deepened
- Grid-in / student-produced-response is no longer a tiny edge path
- Module length and shape move toward more believable SAT blocks
- Review richness improves alongside content depth

### Issue 4.1 — Deepen the five partial blueprint lanes
- **Outcome:** raise item density where audit still calls coverage partial
- **Primary files:** `content/`, `docs/sat-coverage-audit.md`, `scripts/`, relevant packages
- **Acceptance criteria:**
  - each partial lane reaches a declared minimum coverage bar
  - audit output reflects the new counts

### Issue 4.2 — Expand math grid-in coverage
- **Outcome:** student-produced response becomes a meaningful slice of math practice
- **Primary files:** `content/`, `packages/content-dsl` or content validators, tests
- **Acceptance criteria:**
  - grid-in count increases materially above the current slice
  - validation/tests cover accepted response normalization

### Issue 4.3 — Increase module realism
- **Outcome:** section-specific modules feel less compressed
- **Primary files:** `packages/assessment/src/item-selector.mjs`, `services/api/src/store.mjs`, tests
- **Acceptance criteria:**
  - module item count and pacing assumptions are revisited
  - audit and tests reflect the new structure conservatively

### Issue 4.4 — Add release bars for content batches
- **Outcome:** content operations shift from generation to release discipline
- **Primary files:** `scripts/`, `docs/sat-coverage-audit.md`, `docs/quality/`, tests
- **Acceptance criteria:**
  - release bars are explicit: weak-lane minimums, grid-in minimums, defect threshold, retake-resistance threshold
  - CI or scripted audit fails clearly when bars are missed

### Issue 4.5 — Enrich review artifacts for new content
- **Outcome:** new items ship with stronger remediation hooks
- **Primary files:** `content/`, rationales/hint ladder assets, tests
- **Acceptance criteria:**
  - newly added items support richer review cards
  - rationales remain canonical and structured

---

## Milestone 5 — Retention Through Automatic Next Actions

**Goal:** Learners should come back because Helix makes the next action obvious and easy.

**Definition of done**
- Single clear next action on home
- Multiple session lengths fit different energy/time states
- Returning after missed days feels easy, not guilt-inducing
- Progress streak measures completion, not mere login

### Issue 5.1 — Add 15 / 25 / 40 minute plan modes
- **Outcome:** learner can choose effort budget without losing structure
- **Primary files:** `packages/assessment/src/daily-plan-generator.mjs`, `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - plan generator supports short, medium, long modes
  - UI exposes the mode selection without clutter

### Issue 5.2 — Add comeback flow for missed days
- **Outcome:** re-entry path feels forgiving and immediate
- **Primary files:** `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - missed-day learners get a lightweight restart CTA
  - comeback copy is recovery-oriented, not guilt-oriented

### Issue 5.3 — Add plan-completion streak
- **Outcome:** streak rewards meaningful work instead of opens/logins
- **Primary files:** `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - streak increments only on completed meaningful plan/session outcomes
  - streak is visible but not louder than the next action

### Issue 5.4 — Auto-schedule tomorrow’s first session
- **Outcome:** the next day already has an opening move prepared
- **Primary files:** `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - next session recommendation is generated ahead of time
  - home screen can resume directly into it

### Issue 5.5 — Add weekly digest contract
- **Outcome:** weekly summary is evidence-focused and habit-supporting
- **Primary files:** `packages/schemas/`, `services/api/src/store.mjs`, `apps/web/public/app.js`
- **Acceptance criteria:**
  - digest shows most improved pattern, most expensive recurring pattern, and next week’s biggest opportunity
  - no faux-precision score claims

---

## Deprioritized for now

These are still useful, but they do not currently define product completion:

### Teacher surface
Keep it thin and decision-oriented:
- students needing intervention today
- assignment completion
- misconception cluster
- recommended small-group focus

### Parent surface
Keep it lightweight and low-anxiety:
- this week’s consistency
- on-track / off-track signal
- one recommended next action

Do **not** expand either into a broad analytics surface before learner activation, conviction, review, and SAT fidelity are stronger.

---

## Recommended execution order

1. **M1 First 15 Minutes**
2. **M2 Conviction Surfaces**
3. **M3 Review Loop**
4. **M4 SAT Fidelity and Content Depth**
5. **M5 Retention Through Automatic Next Actions**

If only one slice can start now, start with:
- Issue 1.1
- Issue 1.5
- Issue 2.1
- Issue 2.2
- Issue 2.5

That is the smallest coherent package that turns Helix from "working system" into "guided product."
