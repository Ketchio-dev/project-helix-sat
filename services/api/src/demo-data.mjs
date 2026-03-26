export const DEMO_USER_ID = 'demo-student';

export function createDemoData() {
  return {
    users: {
      [DEMO_USER_ID]: {
        id: DEMO_USER_ID,
        name: 'Mina Park',
        email: 'mina@example.com',
        targetScore: 1490,
        targetTestDate: '2026-06-06',
        dailyMinutes: 35,
        preferredExplanationLanguage: 'ko',
      },
    },
    learnerProfiles: {
      [DEMO_USER_ID]: {
        user_id: DEMO_USER_ID,
        target_score: 1490,
        target_test_date: '2026-06-06',
        daily_minutes: 35,
        preferred_explanation_language: 'ko',
      },
    },
    skillStates: {
      [DEMO_USER_ID]: [
        {
          skill_id: 'rw_words_in_context',
          section: 'reading_writing',
          domain: 'craft_and_structure',
          mastery: 0.58,
          timed_mastery: 0.52,
          confidence_calibration: 0.48,
          retention_risk: 0.44,
          careless_risk: 0.25,
          hint_dependency: 0.18,
          trap_susceptibility: 0.31,
          attempts_count: 6,
        },
        {
          skill_id: 'rw_text_structure_and_purpose',
          section: 'reading_writing',
          domain: 'craft_and_structure',
          mastery: 0.62,
          timed_mastery: 0.51,
          confidence_calibration: 0.52,
          retention_risk: 0.33,
          careless_risk: 0.22,
          hint_dependency: 0.16,
          trap_susceptibility: 0.28,
          attempts_count: 5,
        },
        {
          skill_id: 'math_linear_equations',
          section: 'math',
          domain: 'algebra',
          mastery: 0.71,
          timed_mastery: 0.63,
          confidence_calibration: 0.57,
          retention_risk: 0.27,
          careless_risk: 0.19,
          hint_dependency: 0.11,
          trap_susceptibility: 0.22,
          attempts_count: 9,
        },
        {
          skill_id: 'math_statistics_probability',
          section: 'math',
          domain: 'problem_solving_and_data_analysis',
          mastery: 0.66,
          timed_mastery: 0.59,
          confidence_calibration: 0.53,
          retention_risk: 0.29,
          careless_risk: 0.17,
          hint_dependency: 0.08,
          trap_susceptibility: 0.2,
          attempts_count: 7,
        },
      ],
    },
    errorDna: {
      [DEMO_USER_ID]: {
        scope_mismatch: 3,
        high_confidence_misfire: 2,
        sign_error: 1,
      },
    },
    items: {
      rw_words_context_01: {
        itemId: 'rw_words_context_01',
        section: 'reading_writing',
        domain: 'craft_and_structure',
        skill: 'rw_words_in_context',
        estimatedTimeSec: 75,
        prompt: 'Which choice best completes the text with the most precise meaning?',
        passage: 'Researchers described the new coral-growth model as elegant because it captured seasonal variation without relying on dozens of unstable assumptions.',
        choices: [
          { key: 'A', text: 'colorful' },
          { key: 'B', text: 'streamlined' },
          { key: 'C', text: 'fragile' },
          { key: 'D', text: 'mysterious' },
        ],
        answerKey: 'B',
      },
      rw_structure_01: {
        itemId: 'rw_structure_01',
        section: 'reading_writing',
        domain: 'craft_and_structure',
        skill: 'rw_text_structure_and_purpose',
        estimatedTimeSec: 80,
        prompt: 'What is the primary function of the underlined sentence in the text?',
        passage: 'The city first piloted the bus lanes in 2023. Ridership increased within six weeks. The third sentence explains why the pilot succeeded despite early criticism: drivers had reliable travel times during peak congestion. As a result, the policy gained public support.',
        choices: [
          { key: 'A', text: 'It introduces a counterexample to the city policy.' },
          { key: 'B', text: 'It provides the reason a previously mentioned result occurred.' },
          { key: 'C', text: 'It restates the author’s main claim in broader terms.' },
          { key: 'D', text: 'It shifts the passage to an unrelated future proposal.' },
        ],
        answerKey: 'B',
      },
      math_linear_01: {
        itemId: 'math_linear_01',
        section: 'math',
        domain: 'algebra',
        skill: 'math_linear_equations',
        estimatedTimeSec: 70,
        prompt: 'If 3(x - 4) = 18, what is the value of x?',
        passage: '',
        choices: [
          { key: 'A', text: '2' },
          { key: 'B', text: '6' },
          { key: 'C', text: '10' },
          { key: 'D', text: '22' },
        ],
        answerKey: 'C',
      },
      math_stats_01: {
        itemId: 'math_stats_01',
        section: 'math',
        domain: 'problem_solving_and_data_analysis',
        skill: 'math_statistics_probability',
        estimatedTimeSec: 85,
        prompt: 'A survey found that 18 of 30 students preferred weekend practice tests. What percentage is this?',
        passage: '',
        choices: [
          { key: 'A', text: '40%' },
          { key: 'B', text: '50%' },
          { key: 'C', text: '60%' },
          { key: 'D', text: '80%' },
        ],
        answerKey: 'C',
      },
    },
    rationales: {
      rw_words_context_01: {
        canonical_correct_rationale: 'The passage praises a model for doing more with fewer assumptions, so “streamlined” is the precise, text-bound choice.',
        canonical_wrong_rationales: {
          A: '“Colorful” sounds positive but does not match the passage’s logic about efficiency.',
          C: '“Fragile” contradicts the model’s success.',
          D: '“Mysterious” is unsupported by the text.'
        },
        misconceptionByChoice: {
          A: 'vocabulary_overfit',
          C: 'unsupported_inference',
          D: 'scope_mismatch'
        },
        hint_ladder_json: [
          'Start by asking what quality the author is praising.',
          'Look for a choice that means efficient or simplified in this context.',
          'Eliminate choices that are merely positive but not text-bound.',
          'The correct answer points to doing more with fewer assumptions.',
          'Answer: B, because the model is described as efficient and precise, not just generally positive.'
        ],
        misconception_tags: ['vocabulary_overfit', 'scope_mismatch']
      },
      rw_structure_01: {
        canonical_correct_rationale: 'The sentence explains why ridership increased and why the pilot gained support, so it functions as a cause for a prior result.',
        canonical_wrong_rationales: {
          A: 'No counterexample is introduced.',
          C: 'The sentence is narrower than the whole-passage claim.',
          D: 'The passage remains on the same policy discussion.'
        },
        misconceptionByChoice: {
          A: 'tone_purpose_confusion',
          C: 'scope_mismatch',
          D: 'literal_misread'
        },
        hint_ladder_json: [
          'Ask what changed right before this sentence.',
          'The sentence explains a result already mentioned, not the whole passage.',
          'Focus on sentence role: cause, example, contrast, or conclusion?',
          'It gives the reason the pilot succeeded and later gained support.',
          'Answer: B, because the sentence explains why the earlier outcome occurred.'
        ],
        misconception_tags: ['scope_mismatch']
      },
      math_linear_01: {
        canonical_correct_rationale: 'Divide both sides by 3 to get x - 4 = 6, then add 4 to get x = 10.',
        canonical_wrong_rationales: {
          A: 'This comes from subtracting instead of adding after isolating x - 4.',
          B: 'This stops too early after dividing by 3.',
          D: 'This adds 4 before dividing correctly.'
        },
        misconceptionByChoice: {
          A: 'sign_error',
          B: 'variable_isolation_error',
          D: 'overcomplication'
        },
        hint_ladder_json: [
          'Undo operations in reverse order.',
          'First remove the outer multiplication by dividing by 3.',
          'After dividing, you still need to isolate x completely.',
          'You should have x - 4 = 6 before the final step.',
          'Answer: C, because x - 4 = 6 and then x = 10.'
        ],
        misconception_tags: ['sign_error', 'variable_isolation_error']
      },
      math_stats_01: {
        canonical_correct_rationale: '18 out of 30 simplifies to 3 out of 5, which equals 60%.',
        canonical_wrong_rationales: {
          A: '40% would correspond to 12 out of 30.',
          B: '50% would correspond to 15 out of 30.',
          D: '80% would correspond to 24 out of 30.'
        },
        misconceptionByChoice: {
          A: 'arithmetic_slip',
          B: 'wrong_formula_recall',
          D: 'overcomplication'
        },
        hint_ladder_json: [
          'Turn the fraction into something easy to scale to 100.',
          'Simplify 18/30 before converting to a percent.',
          '3/5 is equivalent to how many percent?',
          'Think of 5 equal parts: each part is 20%.',
          'Answer: C, because 18/30 = 3/5 = 60%.'
        ],
        misconception_tags: ['arithmetic_slip']
      },
    },
    sessions: {},
    attempts: [],
    reflections: {
      [DEMO_USER_ID]: [],
    },
    events: [],
  };
}
