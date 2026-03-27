# Bluebook / Khan quality-upgrade slice

This note tracks the **current fidelity slice** for Project Helix SAT for the current in-flight fidelity slice. The goal is still not full SAT replication. The goal of the current slice is to close the most visible realism gaps without breaking the existing learner flow:

1. strengthen generation prompts for weak blueprint lanes with specific, testable realism constraints,
2. deepen weak blueprint lanes in both sections so partial coverage shrinks,
3. expand the math grid-in / student-produced-response slice beyond its current narrow footprint,
4. keep audits, tests, and docs explicit about what still remains incomplete.

## Current baseline from the latest audit

- 62 demo items total (`math=30`, `reading_writing=28`)
- 19 ontology skills tracked: 14 covered, 5 partial, 0 missing
- No singleton-skill lanes remain
- 5 hand-authored Math items now use `grid_in`
- Module simulation is now section-separated and expanded to an 8-item block
- `/api/session/review` is wired into the web app via session history "Review Session" buttons

## What this slice improves

### Prompt-contract strengthening (COMPLETED in this commit)
- Added stronger, testable guidance to WEAK_BLUEPRINT_BOOST blocks for all five partial-coverage lanes.
- **rw_transitions**: now requires sentence-boundary realism, punctuation-aware transitions, and specific rhetorical relationships (elaboration vs. contrast vs. sequence).
- **math_linear_equations**: now requires inequality coverage, constraint-checking items, clean numeric results, and word-problem contexts with units.
- **math_quadratic_functions**: now requires axis-of-symmetry or vertex interpretation, graphical reasoning, and Bluebook-clean coefficients.
- **math_area_and_perimeter**: now requires explicit composite-shape descriptions, measure-selection items ("which gives AREA?"), and Bluebook-clean dimensions.
- **math_trigonometry**: now requires angle-of-elevation or real-world context in ≥50% of items, ratio interpretation, and clear opposite/adjacent/hypotenuse labeling.
- Added three new quality gates: weak-blueprint verification, rw_transitions punctuation-context checking, and math numeric cleanliness.
- Updated regression tests to verify all boost constraints are present in prompts.
- Audit and docs now describe prompt improvements honestly without claiming Bluebook parity.

### Still needed (not in this commit)
- Additional hand-authored items are still needed to move the five partial lanes from “partial” to “covered.”
- Expanded math grid-in support beyond 5 items and into more skill families.
- Module realism improvements beyond the current 8-item section-specific blocks.

## What this slice should improve next

### Format realism
- Expand the math grid-in / student-produced-response slice beyond the current 5 items so the format is no longer a narrow hand-authored slice.
- New grid-in items should cover additional math skills (not just the same lane) and work end to end in all session types.
- Do not overclaim generator support while the richer format is still demo-bank-only.

### Module realism
- Keep module simulation section-separated.
- The learner should be able to tell whether a module is Reading/Writing or Math without inferring it from a mixed item list.
- Summary, history, and restore flows should keep telling the same section-specific story.

### Audit honesty
- Docs must describe the shipped behavior, not the hoped-for future state.
- If grid-in support is minimal, say that it is minimal.
- If module simulation is still shorter than a real exam module, keep that limitation visible.

## Guardrails

### Reading and Writing
- Keep passages compact, evidence-based, and screen-native.
- Preserve ontology-targeted skills instead of drifting into generic comprehension.
- Keep distractors plausible for named reasons, not because they are vague.

### Math
- Keep stems concise and SAT-like.
- For grid-in support, prefer predictable validation and review behavior over UI cleverness.
- Wrong answers and rationales should still model realistic student work, even if the UI supports more than one response type.

### Cross-cutting rules
- No new dependencies.
- Preserve existing session restore/history/dashboard flows.
- Preserve `npm run check`.
- Keep remaining gaps explicit in docs and audit output.

## Review checklist for this slice

Before merging, confirm all of the following:

- Multiple math grid-in / student-produced-response items work end to end without regressing existing `single_select` behavior.
- Module simulation no longer presents itself as a mixed-section mini-set.
- `npm run audit:helix` and `docs/audits/project-helix-sat-coverage.md` agree.
- Refresh `docs/audits/project-helix-sat-coverage.md` from `node scripts/audit-project-helix-sat.mjs` output instead of hand-editing the snapshot.
- `docs/sat-coverage-audit.md` matches the same story as the generated audit.
- `content/README.md` still describes the real generation/runtime contract.
- `npm run check` stays green.

## Still not promised after this slice

- Full official-exam replication
- Full-length SAT module sizing (real modules are still much longer than the current 8-item demo modules)
- Broad generator-native support for every SAT interaction type
- Production-depth coverage across every skill bucket
- Adaptive module routing (real digital SAT picks module 2 difficulty based on module 1 performance)

## Canonical references inside this repo

- `content/README.md` — generation contract + guardrails
- `docs/sat-coverage-audit.md` — narrative audit and current risk summary
- `docs/audits/project-helix-sat-coverage.md` — generated audit snapshot
- `packages/assessment/src/project-helix-sat-audit.mjs` — audit logic
