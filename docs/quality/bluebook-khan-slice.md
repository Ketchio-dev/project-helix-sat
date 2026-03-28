# Bluebook / Khan quality-upgrade slice

This note tracks the **current fidelity slice** for Project Helix SAT for the current in-flight fidelity slice. The goal is still not full SAT replication. The goal of the current slice is to close the most visible realism gaps without breaking the existing learner flow:

1. strengthen generation prompts for weak blueprint lanes with specific, testable realism constraints,
2. deepen weak blueprint lanes in both sections so partial coverage shrinks,
3. expand the math grid-in / student-produced-response slice beyond its current narrow footprint,
4. keep audits, tests, and docs explicit about what still remains incomplete.

## Current baseline from the latest audit

- 79 demo items total (`math=46`, `reading_writing=33`)
- 19 ontology skills tracked: 19 covered, 0 partial, 0 missing
- No singleton-skill lanes remain
- 14 hand-authored Math items now use `grid_in`
- Module simulation is section-separated, ships with a 12-item default block, and now exposes optional 16-item extended profiles for denser Reading/Writing and Math practice
- `/api/session/review`, remediation cards, retry loops, curriculum paths, and weekly evidence surfaces are wired into the learner flow

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
- Expanded math grid-in support beyond 14 items and into more skill families.
- Module realism improvements beyond the current 12-item section-specific blocks.
- Richer authored lesson assets so curriculum remediation depends less on rationale-derived scaffolding.

## What this slice should improve next

### Format realism
- Expand the math grid-in / student-produced-response slice beyond the current 14 items so the format is no longer a narrow hand-authored slice.
- New grid-in items should cover additional math skills (not just the same lane) and work end to end in all session types.
- Do not overclaim generator support while the richer format is still demo-bank-only.

### Module realism
- Keep module simulation section-separated.
- Keep the default 12-item module shape stable until audit/docs intentionally move together.
- Treat the 16-item extended module profiles as honest intermediate realism steps, not as full Bluebook parity.
- The learner should be able to tell whether a module is Reading/Writing or Math without inferring it from a mixed item list.
- Summary, history, restore flows, and the web controls should keep telling the same section-specific story.

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
- Full-length SAT module sizing (real modules are still much longer than the current 12-item default and 16-item extended demo modules in both sections)
- Broad generator-native support for every SAT interaction type
- Production-depth coverage across every skill bucket
- Adaptive module routing (real digital SAT picks module 2 difficulty based on module 1 performance)

## Canonical references inside this repo

- `content/README.md` — generation contract + guardrails
- `docs/sat-coverage-audit.md` — narrative audit and current risk summary
- `docs/audits/project-helix-sat-coverage.md` — generated audit snapshot
- `packages/assessment/src/project-helix-sat-audit.mjs` — audit logic
