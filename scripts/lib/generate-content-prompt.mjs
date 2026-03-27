const DOMAIN_MAP = {
  math: {
    math_linear_functions: { domain: 'algebra', section: 'math' },
    math_linear_equations: { domain: 'algebra', section: 'math' },
    math_systems_of_linear_equations: { domain: 'algebra', section: 'math' },
    math_polynomial_rational: { domain: 'advanced_math', section: 'math' },
    math_nonlinear_equations: { domain: 'advanced_math', section: 'math' },
    math_quadratic_functions: { domain: 'advanced_math', section: 'math' },
    math_ratios_rates: { domain: 'problem_solving_and_data_analysis', section: 'math' },
    math_statistics_probability: { domain: 'problem_solving_and_data_analysis', section: 'math' },
    math_area_and_perimeter: { domain: 'geometry_and_trigonometry', section: 'math' },
    math_circles: { domain: 'geometry_and_trigonometry', section: 'math' },
    math_trigonometry: { domain: 'geometry_and_trigonometry', section: 'math' },
  },
  reading_writing: {
    rw_words_in_context: { domain: 'craft_and_structure', section: 'reading_writing' },
    rw_text_structure_and_purpose: { domain: 'craft_and_structure', section: 'reading_writing' },
    rw_cross_text_connections: { domain: 'craft_and_structure', section: 'reading_writing' },
    rw_command_of_evidence: { domain: 'information_and_ideas', section: 'reading_writing' },
    rw_inferences: { domain: 'information_and_ideas', section: 'reading_writing' },
    rw_transitions: { domain: 'expression_of_ideas', section: 'reading_writing' },
    rw_rhetorical_synthesis: { domain: 'expression_of_ideas', section: 'reading_writing' },
    rw_central_ideas_and_details: { domain: 'information_and_ideas', section: 'reading_writing' },
    rw_punctuation: { domain: 'standard_english_conventions', section: 'reading_writing' },
    rw_sentence_boundaries: { domain: 'standard_english_conventions', section: 'reading_writing' },
    rw_form_structure_sense: { domain: 'standard_english_conventions', section: 'reading_writing' },
  },
};

const ERROR_DNA_TAGS = {
  cross_domain: [
    'premature_commitment',
    'low_confidence_guessing',
    'high_confidence_misfire',
    'time_pressure_collapse',
    'careless_execution',
    'early_give_up',
  ],
  reading_writing: [
    'literal_misread',
    'unsupported_inference',
    'scope_mismatch',
    'tone_purpose_confusion',
    'vocabulary_overfit',
    'grammar_rule_misapplication',
    'transition_logic_mismatch',
    'synthesis_target_miss',
  ],
  math: [
    'arithmetic_slip',
    'sign_error',
    'variable_isolation_error',
    'unit_conversion_error',
    'graph_misread',
    'constraint_ignore',
    'overcomplication',
    'wrong_formula_recall',
    'spr_format_error',
  ],
};

const SKILL_GUIDANCE = {
  math_linear_equations: 'Focus on isolating a variable after distribution or combining like terms. Strong distractors should come from sign flips, stopping before the final isolation step, or undoing operations in the wrong order.',
  math_systems_of_linear_equations: 'Use two constraints that must both be honored. Distractors should reflect solving for only one variable, mixing coefficients, or ignoring the context quantity the question actually asks for.',
  math_linear_functions: 'Target slope, intercept, rate of change, and interpretation of linear models. Distractors should arise from swapping slope and intercept, reading a point as the intercept, or using rise without dividing by run.',
  math_quadratic_functions: 'Use factoring, roots, vertex, or equivalent form interpretation. Distractors should reflect wrong factor pairs, sign pattern confusion, or reporting only one root when two are required.',
  math_polynomial_rational: 'Target polynomial structure or rational-expression restrictions. Distractors should come from canceling illegally, confusing zeros with undefined values, or using a near-miss factorization.',
  math_nonlinear_equations: 'Require solving quadratics, radicals, or other nonlinear forms with attention to extraneous solutions. Distractors should reflect partial solving, extraneous roots, or matching the wrong algebraic form.',
  math_statistics_probability: 'Use ratios, percentages, distributions, or simple probability in authentic contexts. Distractors should come from percent-base confusion, complement mistakes, or averaging the wrong quantities.',
  math_ratios_rates: 'Use proportional reasoning, unit rates, or multistep rates. Distractors should reflect inverted ratios, time-distance confusion, or failing to scale both quantities consistently.',
  math_area_and_perimeter: 'Require selecting the right geometric measure before computing. Distractors should come from using perimeter for area, omitting a side, or missing a factor such as one-half.',
  math_circles: 'Use radius, diameter, circumference, area, arc length, or sector relationships. Distractors should reflect diameter-radius confusion, full-circle vs. sector confusion, or formula recall errors.',
  math_trigonometry: 'Use right-triangle trig or unit-circle reasoning at SAT depth. Distractors should reflect sin/cos swaps, reciprocal confusion, or choosing a ratio with the correct numbers in the wrong order.',
  rw_words_in_context: 'Test precise meaning in context, not dictionary recall. Distractors should include a word with the right general tone but wrong nuance, a nearby antonym trap, and a scope-mismatch choice that sounds sophisticated.',
  rw_text_structure_and_purpose: 'Ask about sentence or paragraph function in the argument. Distractors should confuse evidence with claim, example with conclusion, or local sentence role with whole-passage purpose.',
  rw_cross_text_connections: 'Use two short texts or viewpoints that require comparison. Distractors should overstate agreement, invent disagreement, or match a true idea to the wrong author/text.',
  rw_command_of_evidence: 'Require linking a claim to the most relevant textual or data-based support. Distractors should use partially related evidence, evidence for a different claim, or an unsupported inference that sounds plausible.',
  rw_inferences: 'Require a restrained conclusion anchored in explicit details. Distractors should be plausible extensions that go beyond the text, reverse a relationship, or choose a partial truth that misses the best inference.',
  rw_transitions: 'Choose the transition that matches the exact logical relationship between clauses or sentences. Distractors should feel fluent in casual prose but mismatch cause/effect, contrast, continuation, or example relationships.',
  rw_rhetorical_synthesis: 'Require selecting information that best serves a stated rhetorical goal. Distractors should include relevant facts that fail the goal, details aimed at a different audience, or choices that are accurate but insufficiently targeted.',
  rw_central_ideas_and_details: 'Test main idea, best summary, or how a detail supports the passage. Distractors should overfocus on a vivid detail, state a true but secondary point, or make the claim too broad or too absolute.',
  rw_punctuation: 'Target punctuation choices that control sentence boundaries or emphasis in standard written English. Distractors should reflect comma splices, missing punctuation, or punctuation that creates the wrong relationship between ideas.',
  rw_sentence_boundaries: 'Target sentence combination and punctuation within Standard English. Distractors should reflect run-ons, comma splices, misplaced conjunctive adverbs, or fragments that sound acceptable aloud.',
  rw_form_structure_sense: 'Target agreement, pronouns, tense, modifiers, and formal written usage. Distractors should be grammar traps that sound natural in conversation but violate a specific convention.',
};

const WEAK_BLUEPRINT_BOOST = {
  rw_transitions: [
    'WEAK-BLUEPRINT BOOST — organization / transitions:',
    '- This skill is flagged as a partial-coverage area in the current blueprint audit.',
    '- Generate items that test precise logical connectors (however, therefore, moreover, nevertheless, for instance) rather than generic fill-in-the-blank.',
    '- Each distractor transition must create a grammatically correct sentence but mismatch the logical relationship (e.g., using a contrast word where continuation is needed).',
    '- Vary the clause-pair relationships across items: cause/effect, contrast, elaboration, example, and sequence.',
    '- At least one item per batch should require distinguishing between two transitions that are near-synonyms in casual speech but differ in register or logical precision.',
  ],
  math_linear_equations: [
    'WEAK-BLUEPRINT BOOST — linear equations and inequalities:',
    '- This skill is flagged as a partial-coverage area in the current blueprint audit.',
    '- Include at least one inequality item per batch when count >= 3, so coverage does not cluster on equations alone.',
    '- Vary equation structures: distribution, combining like terms, fractions/decimals, and absolute value at SAT depth.',
    '- Distractors must arise from distinct procedural errors — do not reuse the same sign-flip mistake across multiple wrong answers.',
    '- Context-based items should use realistic SAT scenarios (cost models, measurement conversions) rather than abstract variable drills.',
  ],
  math_quadratic_functions: [
    'WEAK-BLUEPRINT BOOST — nonlinear functions:',
    '- This skill is flagged as a partial-coverage area in the current blueprint audit.',
    '- Cover vertex form, factored form, and standard form interpretation — do not cluster all items on one representation.',
    '- At least one item should require connecting a graph feature (vertex, intercepts, axis of symmetry) to an algebraic expression.',
    '- Distractors should target sign-pattern confusion in factoring, mixing up vertex coordinates, or confusing minimum/maximum.',
    '- Avoid items that reduce to pure arithmetic after a single substitution — the reasoning should feel genuinely nonlinear.',
  ],
  math_area_and_perimeter: [
    'WEAK-BLUEPRINT BOOST — area, volume, and lines:',
    '- This skill is flagged as a partial-coverage area in the current blueprint audit.',
    '- Include composite-shape or shaded-region items, not just single-formula recall.',
    '- At least one item should require choosing between area and perimeter (or surface area and volume) as the relevant measure.',
    '- Distractors should reflect forgetting a factor of ½, using the wrong dimension, or applying a 2D formula to a 3D context.',
    '- Keep diagrams verbal: describe the shape precisely enough that no figure is needed, matching Bluebook text-only item style.',
  ],
  math_trigonometry: [
    'WEAK-BLUEPRINT BOOST — right-triangle trigonometry:',
    '- This skill is flagged as a partial-coverage area in the current blueprint audit.',
    '- Vary between finding a side, finding an angle, and interpreting a trig ratio in context.',
    '- At least one item should use a real-world context (angle of elevation, ramp slope, shadow length) rather than an abstract triangle.',
    '- Distractors should target sin/cos swaps, opposite/adjacent confusion, and forgetting to apply the inverse trig function.',
    '- Keep numerical values clean enough for mental math or simple calculator work — SAT trig items do not require obscure angle measures.',
  ],
};

const RW_TOPICS = ['natural science', 'social science', 'humanities', 'literature'];
const KHAN_DIFFICULTY_LABELS = {
  easy: 'Foundations',
  medium: 'Medium',
  hard: 'Advanced',
};
const MATH_DISTRACTOR_TYPES = [
  'sign error',
  'partial completion',
  'wrong operation',
  'right method wrong element',
  'off-by-one',
  'formula misapplication',
  'magnitude error',
];
const RW_DISTRACTOR_TYPES = [
  'scope mismatch',
  'unsupported inference',
  'opposite meaning',
  'too extreme',
  'right idea wrong text',
  'partial truth',
  'grammar trap',
];
const RW_PASSAGE_PAIR_SKILLS = new Set(['rw_cross_text_connections']);
const RW_NOTES_OR_DATA_SKILLS = new Set(['rw_command_of_evidence', 'rw_rhetorical_synthesis']);

function getSkillMeta(domain, skill) {
  return DOMAIN_MAP[domain]?.[skill] ?? {
    domain: domain === 'math' ? 'algebra' : 'craft_and_structure',
    section: domain,
  };
}

export function buildPrompt(domain, skill, count, difficulty) {
  const skillMeta = getSkillMeta(domain, skill);
  const difficultyBands = difficulty === 'mixed' ? ['easy', 'medium', 'hard'] : [difficulty];
  const answerKeyOrder = Array.from({ length: count }, (_, index) => ['A', 'B', 'C', 'D'][index % 4]);
  const answerKeyInstruction =
    count === 4
      ? 'Because count=4, use exactly one correct answer in each position A, B, C, and D.'
      : count === 3
      ? `Because count=3, use exactly three of the four answer letters with no repeats; for this batch use ${answerKeyOrder.join(', ')}.`
      : `For this batch, cycle answer keys in order as ${answerKeyOrder.join(', ')}. Keep the overall distribution roughly balanced across A/B/C/D.`;

  const difficultyCalibration = {
    easy: [
      `Learner-facing calibration: ${KHAN_DIFFICULTY_LABELS.easy}.`,
      'One reasoning step.',
      'Vocabulary/concepts are straightforward.',
      'Correct answer is clearly best once the passage or setup is understood.',
      'Distractors are plausible but distinguishable with basic comprehension.',
      'Target time: 30-60 seconds.',
    ],
    medium: [
      `Learner-facing calibration: ${KHAN_DIFFICULTY_LABELS.medium}.`,
      'Two reasoning steps or one step with a subtle distinction.',
      'Requires connecting information across 2+ sentences or algebraic moves.',
      'At least one distractor should catch a student who stops early.',
      'At least one distractor should target a common procedural or interpretive error.',
      'Target time: 60-90 seconds.',
    ],
    hard: [
      `Learner-facing calibration: ${KHAN_DIFFICULTY_LABELS.hard}.`,
      'Three or more reasoning steps or synthesis of multiple pieces of evidence.',
      'At least two distractors should feel genuinely compelling on first read.',
      'Correct answer should require careful elimination of attractive alternatives.',
      'Often involves negation, exception, or LEAST/MOST/BEST qualifiers.',
      'Target time: 90-120 seconds.',
    ],
  };

  const difficultyInstruction =
    difficulty === 'mixed'
      ? [
          'Generate a balanced mixed set using only these bands: easy, medium, hard.',
          'Distribute the batch as evenly as possible across easy, medium, hard.',
          ...difficultyBands.flatMap((band) => [`${band.toUpperCase()}:`, ...difficultyCalibration[band].map((line) => `- ${line}`)]),
        ].join('\n')
      : [`Use only the ${difficulty} band for every item.`, ...difficultyCalibration[difficulty].map((line) => `- ${line}`)].join('\n');

  const formatInstruction =
    domain === 'reading_writing'
      ? [
          'Reading/Writing format realism:',
          '- Model current digital SAT / Bluebook and Khan Academy practice tone: concise, neutral, and assessment-first.',
          '- Official SAT Reading and Writing passages are typically 25-150 words. Stay inside that window.',
          RW_PASSAGE_PAIR_SKILLS.has(skill)
            ? '- This skill should use a passage pair. Present the texts inside the single passage field with explicit labels such as "Text 1:" and "Text 2:".'
            : '- Use a single short passage unless the skill itself requires a comparison or paired-text setup.',
          RW_NOTES_OR_DATA_SKILLS.has(skill)
            ? '- It is acceptable to use concise notes, bullet-like research summaries, or tiny data snippets when they sharpen the rhetorical task.'
            : '- Keep the text continuous and scannable unless a notes/data format is clearly better for the skill.',
          '- Make the item feel native to Bluebook: short stem, compact options, line-reference-friendly prose, and distractors that survive first-pass elimination.',
          '- The student must be able to solve the item from the passage alone without outside knowledge.',
        ].join('\n')
      : [
          'Math format realism:',
          '- Model current digital SAT / Bluebook and Khan Academy practice tone: concise, neutral, and assessment-first.',
          '- Official SAT Math includes both multiple-choice and student-produced-response items.',
          '- This current generator slice outputs multiple-choice only because the JSON contract below requires 4 choices and item_format "single_select".',
          '- Even so, write the stem so the reasoning feels authentic without relying on answer-choice gimmicks; the math should still make sense as a Bluebook-style digital SAT item.',
          '- Prefer concise setups over wordy contexts. Use context only when it sharpens the reasoning.',
        ].join('\n');

  const passageInstruction =
    domain === 'reading_writing'
      ? [
          'Passage requirements:',
          '- EASY / Foundations passages: usually about 25-70 words with a clear single-claim or single-edit target.',
          '- MEDIUM passages: usually about 45-110 words with a claim + evidence or claim + qualification structure.',
          '- HARD / Advanced passages: usually about 70-150 words with nuanced reasoning, a subtle rhetorical move, or two compact viewpoints.',
          `- Topics should span ${RW_TOPICS.join(', ')} across batches over time.`,
          '- Passages must be dense enough that distractors can plausibly point to different words, clauses, or sentences.',
          '- Passage evidence must be sufficient to prove the correct answer without outside knowledge.',
          '- Avoid padded openings, fake-literary fluff, and textbook exposition that feels unlike the digital SAT.',
        ].join('\n')
      : [
          'Math scenario requirements:',
          '- Use authentic SAT-style contexts or abstract setups only when they clarify the math, not when they add fluff.',
          '- Give enough quantitative information for the result to be uniquely determined.',
          '- Avoid trick wording that hides the math; difficulty should come from reasoning, not ambiguity.',
          '- When a context includes units, keep units consistent and let at least one distractor reflect a realistic unit or magnitude mistake.',
          '- Keep the final question tight enough to feel comfortable on a Bluebook screen.',
        ].join('\n');

  const distractorTypes = domain === 'math' ? MATH_DISTRACTOR_TYPES : RW_DISTRACTOR_TYPES;
  const allowedErrorTags = domain === 'math' ? ERROR_DNA_TAGS.math : ERROR_DNA_TAGS.reading_writing;
  const skillSpecificGuidance = SKILL_GUIDANCE[skill] ?? 'Match the distractors to the exact reasoning demand of the skill rather than using generic wrong answers.';
  const weakBlueprintBoost = WEAK_BLUEPRINT_BOOST[skill] ? '\n' + WEAK_BLUEPRINT_BOOST[skill].join('\n') : '';
  const exampleItem =
    domain === 'math'
      ? {
          item: {
            itemId: `${skill}_gen_001`,
            section: 'math',
            domain: skillMeta.domain,
            skill,
            difficulty_band: 'medium',
            item_format: 'single_select',
            stem: 'The equation 2(x - 3) = x + 5 is shown. What is the value of x?',
            passage: '',
            choices: [
              { key: 'A', label: 'A', text: '-1' },
              { key: 'B', label: 'B', text: '5' },
              { key: 'C', label: 'C', text: '8' },
              { key: 'D', label: 'D', text: '11' },
            ],
            answerKey: 'D',
            status: 'production',
            tags: ['algebra', 'variable_isolation', 'linear_equation'],
            estimatedTimeSec: 80,
          },
          rationale: {
            item_id: `${skill}_gen_001`,
            explanation: 'Distribute first: 2x - 6 = x + 5. Subtract x from both sides to get x - 6 = 5, then add 6 to get x = 11, so the correct answer is choice D.',
            canonical_correct_rationale: 'Distribute first: 2x - 6 = x + 5. Subtract x from both sides to get x - 6 = 5, then add 6 to get x = 11. Therefore choice D is correct.',
            canonical_wrong_rationales: {
              A: 'A student may solve x - 6 = 5 and then move the 6 in the wrong direction, producing 5 - 6 = -1.',
              B: 'A student may stop one step early at x - 6 = 5 and report the remaining constant instead of solving for x.',
              C: 'A student may distribute incorrectly as 2x - 3 = x + 5, which leads to x = 8.',
            },
            misconceptionByChoice: {
              A: 'sign_error',
              B: 'variable_isolation_error',
              C: 'arithmetic_slip',
            },
            hint_ladder: [
              'Reread the equation and make sure you are solving for x, not just simplifying one side.',
              'Distribute the 2 across both terms inside the parentheses before doing anything else.',
              'After distribution, collect x-terms on one side and constants on the other.',
              'You should reach x - 6 = 5, then add 6 to finish the solution.',
              'Choice D is correct because 2(x - 3) = x + 5 leads to 2x - 6 = x + 5, then x - 6 = 5, and finally x = 11.',
            ],
            hint_ladder_json: [
              'Reread the equation and make sure you are solving for x, not just simplifying one side.',
              'Distribute the 2 across both terms inside the parentheses before doing anything else.',
              'After distribution, collect x-terms on one side and constants on the other.',
              'You should reach x - 6 = 5, then add 6 to finish the solution.',
              'Choice D is correct because 2(x - 3) = x + 5 leads to 2x - 6 = x + 5, then x - 6 = 5, and finally x = 11.',
            ],
            misconception_tags: ['sign_error', 'variable_isolation_error', 'arithmetic_slip'],
          },
        }
      : {
          item: {
            itemId: `${skill}_gen_001`,
            section: 'reading_writing',
            domain: skillMeta.domain,
            skill,
            difficulty_band: 'hard',
            item_format: 'single_select',
            stem: 'Which choice best states the main idea of the text?',
            passage: 'For decades, museum labels described ancient dyes as rare chiefly because the raw materials were hard to obtain. A recent analysis complicates that explanation: in several port cities, the materials were common, yet workshops still reserved the dyes for ceremonial garments. The researchers argue that rarity often came not from supply alone but from the labor, training, and ritual control required to produce stable colors. Their claim does not deny that some pigments were scarce; instead, it reframes scarcity as a social and technical phenomenon rather than a purely natural one.',
            choices: [
              { key: 'A', label: 'A', text: 'Ancient dye materials were unavailable in most port cities.' },
              { key: 'B', label: 'B', text: 'The passage argues that the perceived rarity of some dyes depended on social and technical limits, not just raw-material supply.' },
              { key: 'C', label: 'C', text: 'Researchers have proved that ancient artisans intentionally wasted dye materials during ceremonies.' },
              { key: 'D', label: 'D', text: 'Museum labels should never discuss the availability of raw materials.' },
            ],
            answerKey: 'B',
            status: 'production',
            tags: ['main_idea', 'nuanced_argument', 'hard'],
            estimatedTimeSec: 105,
          },
          rationale: {
            item_id: `${skill}_gen_001`,
            explanation: 'The passage qualifies the old explanation and argues that rarity often reflected labor, expertise, and ritual control in addition to supply, so B captures the nuanced central claim.',
            canonical_correct_rationale: 'Choice B is best because it preserves the passage’s qualification: supply matters sometimes, but the main point is that social and technical constraints also shaped rarity.',
            canonical_wrong_rationales: {
              A: 'This choice overreads the passage by turning a limited discussion of some contexts into a sweeping claim about most port cities.',
              C: 'This choice invents a motive and action not stated anywhere in the passage, making it an unsupported inference.',
              D: 'This choice converts a nuanced revision of museum labels into an absolute recommendation the author never makes.',
            },
            misconceptionByChoice: {
              A: 'scope_mismatch',
              C: 'unsupported_inference',
              D: 'tone_purpose_confusion',
            },
            hint_ladder: [
              'Reread the question and focus on the passage’s overall claim, not a single supporting detail.',
              'Notice that the author does not reject the old explanation entirely; the passage qualifies it.',
              'Eliminate choices that are too absolute or that introduce ideas the passage never states.',
              'The best answer should mention both the old supply explanation and the newer emphasis on labor or social control.',
              'Choice B is correct because it captures the passage’s nuanced claim that rarity depended on social and technical limits in addition to raw-material supply.',
            ],
            hint_ladder_json: [
              'Reread the question and focus on the passage’s overall claim, not a single supporting detail.',
              'Notice that the author does not reject the old explanation entirely; the passage qualifies it.',
              'Eliminate choices that are too absolute or that introduce ideas the passage never states.',
              'The best answer should mention both the old supply explanation and the newer emphasis on labor or social control.',
              'Choice B is correct because it captures the passage’s nuanced claim that rarity depended on social and technical limits in addition to raw-material supply.',
            ],
            misconception_tags: ['scope_mismatch', 'unsupported_inference', 'tone_purpose_confusion'],
          },
        };

  return `1. Role
You are a psychometrician and SAT item writer with 15 years experience at Educational Testing Service.

2. Task specification
Generate exactly ${count} original SAT practice item(s).
- Section: ${skillMeta.section}
- Domain: ${skillMeta.domain}
- Skill: ${skill}
- Difficulty request: ${difficulty}
- Allowed difficulty bands for this batch: ${difficultyBands.join(', ')}
- Internal difficulty bands map to Khan-style learner-facing labels as follows: easy = Foundations, medium = Medium, hard = Advanced.
- Use unique itemIds in the format ${skill}_gen_001, ${skill}_gen_002, and so on.
- Every item must be production-quality and unambiguously answerable from the provided text or math setup.
- For this generator slice, output must follow the JSON contract below exactly, including 4 choices and item_format "single_select".
- This app currently supports only single_select items, so preserve realism within that product constraint rather than inventing unsupported interaction types.

Difficulty calibration:
${difficultyInstruction}

Official-format grounding:
${formatInstruction}

3. Distractor design requirements
Design each wrong answer to target a specific, common student error. No filler distractors. No joke answers. No choices that are obviously wrong on sight.
- Skill-specific guidance: ${skillSpecificGuidance}${weakBlueprintBoost}
- Allowed distractor taxonomy for this section: ${distractorTypes.join('; ')}.
- Every wrong answer must map to one primary Error DNA tag from this project taxonomy: ${allowedErrorTags.join(', ')}.
- Cross-domain tags are allowed when truly needed: ${ERROR_DNA_TAGS.cross_domain.join(', ')}.
- In canonical_wrong_rationales, explain the exact reasoning error that makes each wrong answer tempting.
- In misconceptionByChoice, store the Error DNA tag for each wrong answer choice only. Do not omit any wrong choice.
- In misconception_tags, list the 2-3 most important Error DNA tags the item is designed to detect.
- No two wrong answers may be eliminable for the same reason. Each distractor must occupy a distinct misconception lane.
- For math, make wrong numerical answers arise from realistic student work, such as sign errors, partial completion, formula misapplication, or magnitude mistakes.
- For reading/writing, make wrong choices text-proximate and tempting, but wrong for a specific reason such as scope mismatch, unsupported inference, opposite meaning, partial truth, or grammar trap.

4. Anti-pattern bans
Do NOT generate items that feel like generic worksheet content.
- No trivia or outside-knowledge dependence.
- No padded scene-setting or fake literary flourish that does not affect the answer.
- No vocabulary-for-vocabulary's-sake wording.
- No obviously wrong distractors or joke choices.
- No "gotcha" wording where the trick is only in the phrasing.
- No teacherly explanation embedded in the stem or options.

5. Passage requirements
${passageInstruction}

6. Quality gates
Before outputting, verify all of the following for every item:
  (a) each distractor targets a named misconception;
  (b) no two choices are eliminable by the same reasoning;
  (c) the correct answer is unambiguously best;
  (d) the passage or setup provides sufficient evidence;
  (e) the difficulty band matches the actual reasoning demand;
  (f) estimatedTimeSec matches the requested difficulty;
  (g) the item feels concise and screen-native for Bluebook;
  (h) if section=reading_writing, the passage stays within 25-150 words;
  (i) if skill=${skill} and it is a paired-text skill, the passage clearly contains two labeled texts or viewpoints;
  (j) if section=math, the problem still works conceptually even if the answer choices are hidden.

7. Answer key distribution
${answerKeyInstruction}
- Never leave the correct answer concentrated in one letter position.
- If you generate mixed difficulty, do not always pair the hardest item with the same answer letter.

8. Output format
Output ONLY a valid JSON array. No markdown, no explanation, no code fences.
- Each array element must be an object with exactly two top-level keys: "item" and "rationale".
- item must include: itemId, section, domain, skill, difficulty_band, item_format, stem, passage, choices, answerKey, status, tags, estimatedTimeSec.
- rationale must include: item_id, explanation, canonical_correct_rationale, canonical_wrong_rationales, misconceptionByChoice, hint_ladder, hint_ladder_json, misconception_tags.
- choices must be an array of exactly 4 objects with keys key, label, text.
- answerKey must be one of A, B, C, D and must point to the actual correct text.
- difficulty_band must stay in the internal schema values easy / medium / hard even though the learner-facing calibration mirrors Foundations / Medium / Advanced.
- item_format must be "single_select" for this current generator slice.
- hint_ladder and hint_ladder_json must each contain exactly 5 steps.
- The first hint step must reorient the student to the question.
- The final hint step must explicitly identify the correct answer and justify it with the key reasoning.
- For math items, passage should usually be an empty string unless a context paragraph is necessary.
- For reading_writing items, passage is required.
- Create original content only. Do not copy the example.

9. High-quality example
${JSON.stringify([exampleItem], null, 2)}

Now generate ${count} item(s) for skill "${skill}" and output the JSON array only.`;
}
