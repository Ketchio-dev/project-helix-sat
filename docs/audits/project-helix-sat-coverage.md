# Project Helix SAT coverage audit

## Verdict
- Cross-section coverage: credible_for_mvp
- Blueprint coverage: incomplete

## Content coverage
- Items: 50
- Rationales: 50
- Sections: math=24, reading_writing=26
- Domains: math:advanced_math=6, math:algebra=8, math:geometry_and_trigonometry=6, math:problem_solving_and_data_analysis=4, reading_writing:craft_and_structure=7, reading_writing:expression_of_ideas=5, reading_writing:information_and_ideas=8, reading_writing:standard_english_conventions=6
- Formats: single_select=50

## Blueprint alignment
- Ontology skills: 19
- Covered: 14
- Partial: 5
- Missing: 0

### Missing skills
- none

### Partial skills
- reading_writing/expression_of_ideas/organization (3 mapped items)
- math/algebra/linear_equations_and_inequalities (2 mapped items)
- math/advanced_math/nonlinear_functions (2 mapped items)
- math/geometry_and_trigonometry/area_volume_and_lines (4 mapped items)
- math/geometry_and_trigonometry/right_triangle_trigonometry (2 mapped items)

### Singleton item skills
- none

## Format realism
- All items single_select: true
- Math grid-in coverage present: false
- Math grid-in count: 0

## App flow evidence
- Router missing core endpoints: none
- UI missing core endpoints: none
- API tests missing core endpoints: none
- Exposed but unused endpoints: /api/session/review

## Session shapes
- Diagnostic: 3 items (math=1, reading_writing=2)
- Timed set: 3 items, examMode=true, timeLimitSec=210
- Module simulation: 4 items, examMode=true, timeLimitSec=420, sections=math=2, reading_writing=2
- Session review gated until completion: true

## Major risks
- All current items still use the same single_select format, so Bluebook-style format realism remains constrained even after this slice.
- Math still lacks any grid-in / student-produced-response item shape, which keeps SAT format realism intentionally incomplete.
- Module simulation is only 4 mixed-section items, so it does not resemble full SAT module length or section isolation.
- Exposed endpoints without UI/API-test usage: /api/session/review

## Next fixes
- Keep adding explicit punctuation items plus broader organization coverage in Reading/Writing.
- Continue deepening thin math areas, especially linear equations, circles, and trigonometry.
- Teach the app and audit path about grid-in / student-produced-response items before claiming stronger Bluebook format realism.
- Separate module simulations by section and increase item counts toward exam-realistic module shapes.
- Wire and regression-test /api/session/review if per-session postmortems are part of the intended learner flow.

