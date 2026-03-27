# Project Helix SAT coverage audit

## Verdict
- Cross-section coverage: credible_for_mvp
- Blueprint coverage: incomplete

## Content coverage
- Items: 66
- Rationales: 66
- Sections: math=35, reading_writing=31
- Domains: math:advanced_math=8, math:algebra=11, math:geometry_and_trigonometry=11, math:problem_solving_and_data_analysis=5, reading_writing:craft_and_structure=8, reading_writing:expression_of_ideas=9, reading_writing:information_and_ideas=8, reading_writing:standard_english_conventions=6
- Formats: grid_in=7, single_select=59

## Blueprint alignment
- Ontology skills: 19
- Covered: 14
- Partial: 5
- Missing: 0

### Missing skills
- none

### Partial skills
- reading_writing/expression_of_ideas/organization (6 mapped items)
- math/algebra/linear_equations_and_inequalities (5 mapped items)
- math/advanced_math/nonlinear_functions (4 mapped items)
- math/geometry_and_trigonometry/area_volume_and_lines (6 mapped items)
- math/geometry_and_trigonometry/right_triangle_trigonometry (5 mapped items)

### Singleton item skills
- none

## Format realism
- All items single_select: false
- Math grid-in coverage present: true
- Math grid-in count: 7

## App flow evidence
- Router missing core endpoints: none
- UI missing core endpoints: none
- API tests missing core endpoints: none
- Exposed but unused endpoints: none

## Session shapes
- Diagnostic: 13 items (math=8, reading_writing=5)
- Timed set: 3 items, examMode=true, timeLimitSec=210
- Module simulation: 10 items, examMode=true, timeLimitSec=1050, sections=math=10
- Session review gated until completion: true

## Major risks
- 5 blueprint skill(s) still marked partial — full coverage requires more depth before stronger alignment claims.
- Math has only 7 grid-in / student-produced-response items — format realism remains a narrow hand-authored slice.
- Module simulation is 10 math items — real SAT modules are 22–27 items, so the current shape is still much shorter than exam-realistic.

## Next fixes
- Keep deepening partial Reading/Writing blueprint lanes (organization) with stronger hand-authored items or improved generation constraints before claiming broader coverage.
- Continue deepening linear_equations_and_inequalities, nonlinear_functions, area_volume_and_lines, right_triangle_trigonometry in Math with hand-authored depth or materially stronger prompt guidance before claiming full blueprint alignment.
