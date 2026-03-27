# Helix Baseline Diagnostic Spec

## Decision

Helix should make the first-run baseline diagnostic **soft-mandatory**.

That means:
- the expected onboarding path is `signup -> goal setup -> baseline diagnostic -> reveal -> first personalized session`
- the diagnostic is the **unlock gate** for high-confidence personalization
- users may pause and return later, but they should not receive the full personalized learner surface without completing it

This should not be framed as a traditional “placement test.” It is a **short adaptive baseline** whose job is to create a believable first plan, not to label the learner.

## Product goals, ranked

1. **Produce a credible first next action** within the first 15 minutes.
2. **Seed enough skill evidence** to make `diagnostic_reveal`, `next_best_action`, `curriculumPath`, and `programPath` feel earned rather than generic.
3. **Create trust** by showing the learner that Helix understands where points are leaking.
4. **Differentiate conceptual weakness from timed-performance weakness** early enough to route the first repair session correctly.
5. **Raise confidence in the score band** without pretending to produce an official or highly precise score.

## What the baseline should estimate

The baseline **should** estimate:
- a **starting score band** plus confidence label
- section imbalance between Reading/Writing and Math
- 2–3 high-yield leak areas
- initial pacing signal
- initial confidence calibration signal
- whether the learner needs more **foundation repair** or can move more quickly into **timed transfer**

The baseline **should not** try to estimate:
- an official SAT-equivalent point score
- stable mastery across the entire ontology
- long-horizon retention
- final readiness for the exam
- complete psychometric precision

The right framing is:
- **band, confidence, evidence**
- not point estimate, certainty, or pseudo-officialness

## Product stance

Helix should optimize the baseline for **activation-first evidence quality**, not psychometric purity.

A learner should finish it thinking:
- “This app read me quickly.”
- “It knows where my first gains are.”
- “The next thing it wants me to do makes sense.”

If the learner instead feels:
- “I just took a mini practice test,” or
- “This score looks fake,” or
- “Why am I doing this?”

then the baseline failed, even if internal measurement quality improved.

## First 15-minute flow

### Minute 0–2 — Setup
Collect:
- target score
- target test date
- daily study time
- self-reported weak area

Explain the value proposition in one sentence:

> “In about 10 minutes, Helix will build your first score-moving plan.”

### Minute 2–12 — Baseline diagnostic
Run a short evidence-rich baseline across both sections.

### Minute 12–14 — Reveal
Show:
- current score band
- confidence label
- top score leaks
- why this is the recommended first plan

### Minute 14–15 — Immediate action
Offer exactly one primary CTA:
- the first personalized repair block
- not a generic dashboard exploration CTA

## Recommended diagnostic structure

## V1 recommendation
Ship a **fixed-but-varied 13-item baseline**.

Suggested structure:
- **Block A — Reading/Writing:** 5 items
- **Block B — Math core / no-calculator-feeling:** 4 items
- **Block C — Math transfer / calculator-feeling:** 4 items

Target total time:
- **8–12 minutes** for most learners

Why 13 items:
- 3 items is too thin to make `diagnostic_reveal` feel real
- 20+ items starts to feel like a test rather than onboarding
- 13 items is enough to seed multiple skill states, error DNA, and first routing decisions without tanking completion

## Content design principles

Each baseline should:
- cover both sections
- touch multiple domains
- include at least one harder “ceiling probe” item in each section cluster
- include exactly **one grid-in / SPR exposure** in Math so the learner encounters the format immediately
- avoid overly niche content in the first-run flow

## Selection strategy for V1

V1 should remain **template-based**, not truly adaptive.

Use 3–4 parallel fixed forms that all obey the same shape:
- broad section coverage
- broad skill coverage
- one ceiling probe per major section cluster
- one Math SPR item

Bias selection slightly toward the learner’s self-reported weak area, but do **not** allow self-report to collapse coverage.

Good rule:
- self-report can influence **one extra emphasis slot**
- it should not replace full cross-section sampling

## V2 recommendation
Move to an uncertainty-aware adaptive baseline:
- start with a broad screen
- branch into targeted probes
- stop once confidence clears a threshold
- extend only when uncertainty remains too high

## Branching model

### V1
- no branching during the session
- fixed form chosen at session start
- simple, reliable, easy to reason about

### V2
Use a 3-stage structure:

1. **Broad screen**
   - quick cross-section coverage
2. **Targeted probe**
   - investigate the highest-value uncertainty
3. **Uncertainty resolver**
   - only if confidence remains too low or routing is still ambiguous

This keeps the session short for most learners while allowing extra evidence only when it matters.

## Immediate outputs after diagnostic

The baseline must populate enough state to make downstream product surfaces feel justified.

Immediately after completion, Helix should update:
- `skillStates` across several distinct skills, not just 1–2
- `errorDna` with real early signal
- `projection` with a tighter score band and non-trivial confidence
- `timed_mastery` / pacing signal
- `confidence_calibration`

The reveal should include:
- `scoreBand`
- `confidence`
- `momentum`
- `topScoreLeaks`
- `firstRecommendedAction`

## Diagnostic reveal contract

The reveal should answer four questions:

1. **Where am I starting?**
   - score band
2. **How sure is Helix?**
   - confidence label grounded in evidence
3. **Why are points leaking?**
   - top 2–3 recurring leak areas translated into student language
4. **What should I do right now?**
   - one immediate personalized CTA

Recommended confidence labels:
- **early read**
- **usable signal**
- **strong starting signal**

Avoid exactness language.

Do not say:
- “You are a 1270 student.”

Prefer:
- “Your starting range looks like 1230–1290, with an early read confidence level.”

## How baseline output should feed downstream objects

### `next_best_action`
The first action after reveal should usually be:
- a **short targeted repair block** tied to the #1 leak
- not a generic module
- not an unguided dashboard state

This is the activation hinge.

### `diagnostic_reveal`
This becomes the emotional trust surface:
- band
- confidence
- evidence
- first action

### `curriculumPath`
The baseline should determine:
- first anchor skill candidate
- support/prereq candidate
- initial revisit cadence priorities
- whether early work should lean toward `foundation_repair` or `controlled_practice`

### `programPath`
The baseline should shape:
- opening phase emphasis
- whether the learner’s early weeks lean more toward repair, acceleration, or transfer prep
- realistic session pacing expectations based on daily minutes and early timing data

### `review / remediation`
Wrong diagnostic items should become the learner’s first review seed.

That means the baseline should directly populate:
- first review queue
- first retry candidate
- first revisit schedule

The baseline is not separate from the learning loop; it should be the first entry point into it.

## Copy principles

### Frame the baseline as value creation, not judgment
Prefer:
- “Build your starting baseline”
- “Find your first score-moving plan”
- “Helix is reading where your fastest gains are”

Avoid:
- “Placement test”
- “Level test”
- “Assessment to determine your rank”

### Explain the purpose before the learner starts
Example:

> “This short baseline helps Helix find where your first points are hiding, so your plan starts in the right place.”

### Use progress copy that feels interpretive, not robotic
Examples:
- “Reading how you handle inference and evidence”
- “Checking whether Math errors come from setup or time pressure”
- “Looking for the fastest score-moving opening lane”

### Reveal tone should be evidence-backed, not humiliating
Prefer:
- “Your first gains are most likely in sentence boundaries and algebra setup.”
- “Helix sees more timing pressure than conceptual collapse right now.”

Avoid:
- “You are weak at…”
- “You failed…”

## Risks and mitigations

### 1. Dropoff from too much upfront work
**Risk:** a longer baseline hurts conversion.

**Mitigation:**
- keep it within 8–12 minutes for most learners
- show clear progress
- explain the value before the learner starts
- immediately show reveal + CTA afterward

### 2. False precision
**Risk:** learners distrust exact-looking scores from a short session.

**Mitigation:**
- show band, not point estimate
- show confidence label
- mention that the signal sharpens after more work

### 3. Confidence damage
**Risk:** a learner feels judged or discouraged too early.

**Mitigation:**
- frame the result as a starting map
- emphasize point-leak repair and next action
- never make the reveal sound final

### 4. Misrouting from too little evidence
**Risk:** Helix routes the learner to the wrong first block.

**Mitigation:**
- use 13 items in V1 instead of 3
- include both section breadth and ceiling probes
- keep the first post-diagnostic block short so bad routing can self-correct quickly

### 5. Test fatigue / product mismatch
**Risk:** onboarding feels like a practice test rather than a smart product.

**Mitigation:**
- hide exam-like pressure in V1
- keep it short
- ensure the first post-diagnostic action is obviously personalized

## Success metrics

### Activation
- signup -> goal setup completion
- goal setup -> diagnostic start
- diagnostic start -> diagnostic completion
- diagnostic completion -> first CTA click
- diagnostic completion -> first personalized session start

### Product conviction
- reveal dwell time
- next-best-action click-through
- day-1 second session rate
- day-3 retention

### Diagnostic quality
- confidence distribution after completion
- score-band width distribution
- diagnostic leak -> first-session focus alignment
- first-session improvement after diagnostic routing
- calibration drift after the first week

## V1 scope

Ship now:
- 13-item fixed baseline
- 3–4 parallel forms
- both sections represented
- one Math SPR item
- hard-item ceiling probes
- improved reveal copy
- specific first CTA tied to top leak
- existing downstream pipeline reused (`diagnostic_reveal`, `next_best_action`, `curriculumPath`, `programPath`, review queue)

## V2 scope

Add later:
- stage-based branching
- uncertainty-triggered extensions
- exposure-aware item pool selection
- dynamic stopping when confidence threshold is met
- more refined pacing modeling
- deeper domain-specific reveal explanations

## Concrete implementation recommendation for the current Helix repo

For the current architecture, the highest-leverage V1 move is:

1. increase first-run diagnostic size from the current tiny pinned set to a **13-item fixed baseline**
2. keep the current scoring / projection pipeline
3. keep `diagnostic_reveal` as the main reveal contract
4. ensure `firstRecommendedAction` targets a specific leak skill rather than generic practice
5. let diagnostic misses seed the first review/retry/revisit loop immediately

This gives Helix a far more believable first-run experience without requiring a full adaptive measurement engine rewrite.

## Final recommendation

Helix should absolutely require a short first-run baseline as the normal onboarding path, but it should be framed as a **quick personalized starting baseline**, not a placement exam. In V1, a fixed 13-item evidence-rich session is the right compromise: long enough to power believable routing, short enough to preserve activation. The product win is not measurement purity; it is the moment where the learner finishes, sees a credible band, recognizes their top leaks, and feels that the next action was chosen specifically for them.
