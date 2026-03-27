# Bluebook / Khan quality-upgrade slice

This note tracks the **current fidelity slice** for Project Helix SAT after commit `30f2588`. The goal is still not full SAT replication. The goal of the current slice is to close the most visible realism gaps without breaking the existing learner flow:

1. deepen weak blueprint lanes in both sections so partial coverage shrinks,
2. expand the math grid-in / student-produced-response slice beyond its current narrow footprint,
3. improve prompt and content guidance so generated items stay closer to Bluebook/Khan quality,
4. keep audits, tests, and docs explicit about what still remains incomplete.

## Current baseline from the latest audit

- 50 demo items total (`math=24`, `reading_writing=26`)
- 19 ontology skills tracked: 14 covered, 5 partial, 0 missing
- No singleton-skill lanes remain
- 3 hand-authored Math items now use `grid_in`
- Module simulation is now section-separated, but it is still only a 4-item block
- `/api/session/review` is still exposed but underused

## What this slice should improve

### Format realism
- Expand the math grid-in / student-produced-response slice beyond the current 3 items so the format is no longer a token presence.
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
- Full-length SAT module sizing (real modules have 27–33 items per section)
- Broad generator-native support for every SAT interaction type
- Production-depth coverage across every skill bucket
- Adaptive module routing (real digital SAT picks module 2 difficulty based on module 1 performance)

## Canonical references inside this repo

- `content/README.md` — generation contract + guardrails
- `docs/sat-coverage-audit.md` — narrative audit and current risk summary
- `docs/audits/project-helix-sat-coverage.md` — generated audit snapshot
- `packages/assessment/src/project-helix-sat-audit.mjs` — audit logic
