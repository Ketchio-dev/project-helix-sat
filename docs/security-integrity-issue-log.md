# Security / integrity issue log

Last updated: 2026-03-27

This document records the major security, data-model, exam-integrity, and product-readiness issues previously identified for Project Helix SAT, along with current resolution status, evidence, and follow-up notes.

Status labels:
- **fixed** — implemented and covered by runtime behavior and/or tests
- **fixed with follow-up** — the main risk is addressed, but a tighter production-grade follow-up still exists
- **open** — not yet resolved
- **deferred** — intentionally postponed behind higher-priority work

---

## P0 — Immediate fixes

### 1. Demo auth bypass via `x-demo-user-id`
- **Priority:** P0
- **Status:** **fixed**
- **Problem:** broad non-production demo auth effectively bypassed bearer/role checks in dev/staging paths
- **Resolution:**
  - demo auth is now disabled unless `HELIX_ENABLE_DEMO_AUTH === '1'`
  - bearer auth is checked first
  - cookie auth is checked second
  - browser app no longer sends demo headers by default
- **Primary files:**
  - `services/api/src/router.mjs`
  - `apps/web/public/app.js`
  - `tests/api.test.mjs`
  - `tests/sat-coverage-audit.test.mjs`
- **Evidence:**
  - unauthorized requests now return 401 in API tests
  - web app authenticates with cookie login flow instead of demo header flow

### 2. Public registration accepted client-supplied roles
- **Priority:** P0
- **Status:** **fixed**
- **Problem:** open signup with client-controlled `role` created a privilege-escalation path
- **Resolution:**
  - public register route only accepts `name`, `email`, `password`
  - request schema rejects extra properties
  - store registration only creates `student`
  - auth endpoints are rate-limited
- **Primary files:**
  - `services/api/src/router.mjs`
  - `services/api/src/store.mjs`
  - `services/api/src/validation.mjs`
  - `tests/auth.test.mjs`
  - `tests/api.test.mjs`
- **Evidence:**
  - tests cover successful student-only registration
  - tests cover rejection of privileged role input

### 3. Password storage used shared-secret HMAC
- **Priority:** P0
- **Status:** **fixed with follow-up**
- **Problem:** password storage used an HMAC-style scheme and shared secret coupling with token signing
- **Resolution:**
  - passwords now use `scrypt`
  - password and token secrets are separated
  - legacy hashes are automatically rehashed on successful login
- **Primary files:**
  - `services/api/src/auth.mjs`
  - `services/api/src/store.mjs`
  - `tests/auth.test.mjs`
- **Evidence:**
  - tests verify scrypt hash format
  - tests verify login + rehash-compatible auth flow
- **Follow-up still open:**
  - move custom token signing/verification to a more standardized `jose`-style implementation if/when dependency policy allows

### 4. User model and learner model were conflated
- **Priority:** P0
- **Status:** **fixed**
- **Problem:** teacher/parent routes incorrectly assumed every authenticated user was also a learner profile
- **Resolution:**
  - auth users and learner profiles are treated separately
  - `teacherStudentLinks` and `parentStudentLinks` were introduced
  - teacher/parent routes require explicit learner context
  - learner-scoped reads and owner-scoped writes are resolved centrally in the router
- **Primary files:**
  - `services/api/src/demo-data.mjs`
  - `services/api/src/store.mjs`
  - `services/api/src/router.mjs`
  - `services/api/src/state-storage.mjs`
  - `packages/db/schema.sql`
  - `tests/api.test.mjs`
- **Evidence:**
  - teacher and parent summary routes now require linked learner context
  - tests cover missing learner context rejection

### 5. Fresh student bootstrap failed to seed skill state
- **Priority:** P0
- **Status:** **fixed**
- **Problem:** first attempts updated existing skill state only and failed for new learners with empty arrays
- **Resolution:**
  - `submitAttempt()` now calls `ensureSkillState()` before state updates
  - `learnerProfiles` is treated as the source of truth for learner plan/projection inputs
- **Primary files:**
  - `services/api/src/store.mjs`
  - `tests/api.test.mjs`
  - `tests/auth.test.mjs`
- **Evidence:**
  - fresh-student test now verifies diagnostic attempts move projection from `insufficient_evidence` to `low_evidence`
  - plan exits `needs_diagnostic` after first real attempt

---

## P1 — Should be done before wider external exposure

### 6. Exam submit response leaked too much post-answer detail
- **Priority:** P1
- **Status:** **fixed**
- **Problem:** exam-mode submit responses risked exposing correctness/review-style payloads too early
- **Resolution:**
  - exam submit now returns a pure ACK-style contract:
    - `attemptId`
    - `sessionProgress`
    - `sessionType`
    - `nextItemCursor`
    - `summary`
  - detailed review remains behind `/api/session/review` after completion
- **Primary files:**
  - `services/api/src/store.mjs`
  - `services/api/src/router.mjs`
  - `services/api/src/validation.mjs`
  - `apps/web/public/app.js`
  - `tests/integrity.test.mjs`
  - `tests/api.test.mjs`
- **Evidence:**
  - integrity tests verify exam responses omit correctness/review/projection payloads
  - API tests verify ACK shape

### 7. `itemExposure` was not persisted across restarts
- **Priority:** P1
- **Status:** **fixed**
- **Problem:** selector exposure history disappeared after restart, weakening repeat-avoidance behavior
- **Resolution:**
  - `itemExposure` added to mutable state snapshot keys and validators
  - persistence merge defaults include `itemExposure`
- **Primary files:**
  - `services/api/src/state-storage.mjs`
  - `services/api/src/store.mjs`
  - `tests/api.test.mjs`
- **Evidence:**
  - restart/persistence tests verify `itemExposure` survives file-backed reload

### 8. “Contract-enforced API” was not actually enforced centrally
- **Priority:** P1
- **Status:** **fixed**
- **Problem:** request validation was inconsistent and response validation was not centrally enforced
- **Resolution:**
  - centralized route registry now carries auth and schema behavior
  - request schemas were tightened
  - response validation now throws on mismatch
- **Primary files:**
  - `services/api/src/router.mjs`
  - `services/api/src/validation.mjs`
  - `tests/api.test.mjs`
- **Evidence:**
  - register/auth responses now fail closed on schema drift
  - route-level validation is exercised across auth, teacher context, and session flows

### 9. Token storage and security headers were too weak
- **Priority:** P1
- **Status:** **fixed with follow-up**
- **Problem:** frontend used `localStorage`; auth/exam responses lacked stronger browser-side protections
- **Resolution:**
  - auth moved to HttpOnly cookie flow
  - `localStorage` token handling removed from web app
  - JSON/static responses now include no-store and basic hardening headers
- **Primary files:**
  - `apps/web/public/app.js`
  - `services/api/src/http-utils.mjs`
  - `services/api/src/auth.mjs`
  - `services/api/src/router.mjs`
- **Evidence:**
  - browser app uses cookie auth flow
  - tests and manual flow use cookie-based authenticated requests
- **Follow-up still open:**
  - stronger CSRF defenses beyond `SameSite=Lax`
  - potential secure-cookie tightening and broader CSP evolution for production hosting

---

## P2 — Follow-through and regression protection

### 10. Tests over-relied on demo path instead of real auth/role paths
- **Priority:** P2
- **Status:** **fixed**
- **Problem:** demo flows masked issues in bearer/cookie auth, role-specific routes, fresh-user bootstrap, persistence, and exam ACK behavior
- **Resolution:**
  - tests now use real login sessions for app/API flows
  - added coverage for:
    - public register -> student only
    - fresh student diagnostic seeds skill states
    - teacher route requires learner context
    - exam submit omits correctness
    - restart preserves `itemExposure`
- **Primary files:**
  - `tests/api.test.mjs`
  - `tests/auth.test.mjs`
  - `tests/sat-coverage-audit.test.mjs`
- **Evidence:**
  - `node --test` passes
  - `npm run check` passes

---

## Remaining follow-up list after the original issue set

These are not regressions of the original report; they are the next hardening/productization steps after the main fixes landed.

1. Standardize token signing/verification with a stronger library-backed implementation
2. Tighten CSRF protection for cookie-authenticated mutation routes
3. Add teacher/parent/admin invite or admin-created flows instead of relying on seeded/demo setup
4. Continue learner-product completion work tracked in `docs/product-completion-milestones.md`

---

## Reference commits

- `3436a43` — Harden auth boundaries and learner-scoped session integrity
- `8c9a996` — Freeze product-completion priorities for the learner experience
