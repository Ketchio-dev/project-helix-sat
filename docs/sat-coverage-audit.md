# SAT coverage audit (2026-03-26)

## Verdict

Project Helix SAT **credibly covers both SAT Reading/Writing and Math as a prototype vertical slice**, but **does not yet credibly cover the full SAT blueprint at production depth**.

## Evidence gathered

### Demo item bank
- 44 demo items total
- 23 Reading/Writing items, 21 Math items
- All 8 top-level SAT domains represented
  - Reading/Writing: craft and structure (7), information and ideas (8), expression of ideas (4), standard English conventions (4)
  - Math: algebra (7), advanced math (6), problem solving and data analysis (4), geometry and trigonometry (4)
- 44/44 items have canonical rationales and hint ladders
- 21 distinct skill buckets are represented across the item bank

### App flow
- Learner dashboard loads profile, plan, review recommendations, and latest session summaries
- Timed set flow starts, records answers, finishes, and persists a timed summary to the dashboard
- Module simulation flow balances sections 2 Reading/Writing + 2 Math, finishes successfully, and persists section breakdowns to dashboard/history
- Session history records both timed-set and module-simulation outcomes

## Major risks

1. **All 44 items use the same `single_select` format.**
   - This is enough for a prototype, but not enough to claim robust SAT Math coverage because there are no student-produced-response / grid-in style items and no richer interaction patterns.
2. **Skill depth is shallow.**
   - Many skills have only 1-2 items, which is enough to prove wiring but not enough for stable adaptivity, retake resistance, or strong diagnostic confidence.
3. **Blueprint traceability is loose.**
   - Item skill IDs and ontology skill names do not always line up one-to-one, making coverage claims harder to audit automatically.
4. **Repo messaging is stale in places.**
   - The current README still describes an 11-item library, which understates the current 44-item demo bank and weakens audit clarity.

## Recommended next fixes

1. Add missing high-signal SAT formats first:
   - Math student-produced response/grid-in items
   - More varied Reading/Writing passage structures
2. Raise minimum depth on thin skills to at least 4 items per skill before making stronger coverage claims.
3. Normalize ontology skill names and demo item skill IDs so CI can produce a trustworthy coverage matrix automatically.
4. Refresh top-level product docs/README counts so the repo narrative matches the shipped demo bank and test surface.

## Bottom line

Today the product demonstrates a believable **two-section SAT prototype** with real learner flow coverage in both Reading/Writing and Math. It is strong enough for a demo/audit pass, but not yet strong enough for a full-fidelity SAT coverage claim.
