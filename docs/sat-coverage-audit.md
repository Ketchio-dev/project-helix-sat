# SAT coverage audit (2026-03-27)

## Verdict

Project Helix SAT **credibly covers both SAT Reading/Writing and Math as a prototype vertical slice**, and the Reading/Writing blueprint is now materially stronger, but **the overall SAT blueprint is still incomplete at production depth**.

## Evidence gathered

### Demo item bank
- 47 demo items total
- 26 Reading/Writing items, 21 Math items
- All 8 top-level SAT domains represented
  - Reading/Writing: craft and structure (7), information and ideas (8), expression of ideas (5), standard English conventions (6)
  - Math: algebra (7), advanced math (6), problem solving and data analysis (4), geometry and trigonometry (4)
- 47/47 items have canonical rationales and hint ladders
- 22 distinct skill buckets are represented across the item bank
- Reading/Writing punctuation is now explicitly covered, and organization is no longer a partial skill in the audit

### App flow
- Learner dashboard loads profile, plan, review recommendations, and latest session summaries
- Timed set flow starts, records answers, finishes, and persists a timed summary to the dashboard
- Module simulation flow balances sections 2 Reading/Writing + 2 Math, finishes successfully, and persists section breakdowns to dashboard/history
- Session history records both timed-set and module-simulation outcomes

## Major risks

1. **All 47 items use the same `single_select` format.**
   - This is enough for a prototype, but not enough to claim robust SAT Math coverage because there are no student-produced-response / grid-in style items and no richer interaction patterns.
2. **Skill depth is shallow.**
   - Several math skills still have only 1-3 items, which is enough to prove wiring but not enough for stable adaptivity, retake resistance, or strong diagnostic confidence.
3. **Test-core realism is still thin.**
   - Module simulation remains only 4 mixed-section items, so exam realism is still meaningfully below a real SAT module.
4. **Some shipped endpoints are still underused.**
   - `/api/session/review` is exposed by the API but still lacks UI and API-test usage.

## Recommended next fixes

1. Deepen thin math skills first:
   - Linear equations and inequalities
   - Circles / area-volume-lines
   - Right-triangle trigonometry
2. Add missing high-signal SAT formats:
   - Math student-produced response/grid-in items
   - More varied Reading/Writing passage structures
3. Raise minimum depth on thin skills to at least 4 items per skill before making stronger coverage claims.
4. Wire and regression-test `/api/session/review` if per-session postmortems are part of the intended learner flow.

## Bottom line

Today the product demonstrates a believable **two-section SAT prototype** with improved Reading/Writing blueprint coverage and real learner-flow coverage in both sections. It is strong enough for a stronger demo/audit pass, but not yet strong enough for a full-fidelity SAT coverage claim.
