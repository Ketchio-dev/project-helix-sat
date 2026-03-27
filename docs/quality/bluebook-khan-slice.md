# Bluebook / Khan quality-upgrade slice

This note defines the **first quality-upgrade slice** for Project Helix SAT content work. It is intentionally narrower than a full SAT fidelity spec: the goal is to improve the weakest content realism and coverage gaps without overclaiming parity with the official exam.

## What this slice is trying to improve

1. Make the generator prompt behave more like a digital-SAT item-writing brief than a generic quiz generator.
2. Keep audits honest about current coverage holes.
3. Improve the weakest current content lanes first instead of adding random new volume.
4. Preserve `npm run check` and the existing learner flows while quality improves.

## What this slice is not promising yet

- Full official-exam replication
- Grid-in / student-produced-response math items
- Full-module or full-test blueprint fidelity
- Large-scale content depth across every skill

## Working guardrails

### Reading and Writing
- Passages should feel like short digital-SAT texts: compact, information-dense, and answerable from the passage alone.
- Questions should target the current ontology skills rather than drifting into generic reading comprehension.
- Wrong answers should be tempting for distinct reasons, not because they are vague or sloppy.
- Difficulty should come from reasoning precision, nuance, and evidence selection rather than trivia or obscure background knowledge.

### Math
- Setups should stay concise and SAT-like; extra story text should not create fake difficulty.
- Wrong answers should come from realistic work students might actually show: sign slips, partial completion, wrong formula choice, unit confusion, graph misread, or constraint neglect.
- Format realism should be described honestly: the current bank is still multiple choice only.
- The first math upgrades should strengthen weak coverage before broadening already healthy algebra or advanced-math lanes.

### Cross-cutting quality rules
- Every item must remain unambiguously answerable.
- Rationales, misconception tags, and hint ladders are first-class assets, not optional metadata.
- New documentation should match the actual audited bank, not an aspirational future state.
- If docs and audits disagree, regenerate the audit and update the docs before merging.

## First priorities from the current audit

### Highest-priority Reading/Writing gaps
- Missing punctuation coverage
- Thin organization coverage

### Highest-priority Math gaps
- `math_linear_equations`
- `math_circles`
- `math_trigonometry`

### Realism gaps to keep visible
- All items are still `single_select`
- Module simulation is still much smaller than a real exam module
- `/api/session/review` is exposed but not yet part of a strong end-to-end learner path

## Review checklist for this slice

Before merging a content-quality change, confirm all of the following:

- The change improves an audited weak spot or documents a real current limitation.
- The repo does not newly overclaim SAT fidelity.
- `content/README.md`, `docs/sat-coverage-audit.md`, and any top-level summary still agree.
- `npm run audit:helix` still tells the same story as the docs.
- `npm run check` stays green.

## Canonical references inside this repo

- `content/README.md` — generator usage + guardrails
- `docs/sat-coverage-audit.md` — narrative audit and weak-coverage summary
- `docs/audits/project-helix-sat-coverage.md` — generated audit snapshot
- `scripts/generate-content.mjs` — prompt and validation logic
