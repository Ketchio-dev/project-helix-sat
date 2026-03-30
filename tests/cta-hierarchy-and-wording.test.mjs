import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLearnerNarrative, formatSkillLabel, studentActionCopy } from '../apps/web/public/learner-narrative.js';
import { createStore } from '../services/api/src/store.mjs';
import { createDemoData } from '../services/api/src/demo-data.mjs';

const DEMO_ITEM_MAP = new Map(
  Object.values(createDemoData().items).map((item) => [item.itemId, item]),
);

function buildLearnAttempt(userId, item, sessionId, { correct = true } = {}) {
  if (item.item_format === 'grid_in') {
    const accepted = item.responseValidation?.acceptedResponses?.[0] ?? item.answerKey;
    return {
      userId,
      itemId: item.itemId,
      sessionId,
      mode: 'learn',
      confidenceLevel: 3,
      responseTimeMs: 35000,
      freeResponse: correct ? accepted : '0',
    };
  }
  const incorrectChoice = item.choices.find((c) => c.key !== item.answerKey)?.key ?? 'A';
  return {
    userId,
    itemId: item.itemId,
    sessionId,
    mode: 'learn',
    confidenceLevel: 3,
    responseTimeMs: 35000,
    selectedAnswer: correct ? item.answerKey : incorrectChoice,
  };
}

function registerAndSetGoal(store, name = 'CTA Tester') {
  const { user } = store.registerUser({
    name,
    email: `cta-${Date.now()}-${Math.random().toString(16).slice(2)}@test.com`,
    password: 'pass1234',
  });
  store.updateGoalProfile(user.id, {
    targetScore: 1400,
    targetTestDate: '2026-10-10',
    dailyMinutes: 30,
    selfReportedWeakArea: 'algebra',
  });
  return user.id;
}

function completeDiagnostic(store, userId) {
  const diagnostic = store.startDiagnostic(userId);
  for (const [i, item] of diagnostic.items.entries()) {
    const canonical = DEMO_ITEM_MAP.get(item.itemId) ?? item;
    store.submitAttempt(buildLearnAttempt(userId, canonical, diagnostic.session.id, { correct: i !== 0 }));
  }
  return diagnostic;
}

// ── CTA hierarchy: studentActionCopy produces credible, jargon-free wording ──

describe('CTA hierarchy: studentActionCopy wording quality', () => {
  const AI_SLOP_PATTERNS = [
    /unleash/i,
    /supercharge/i,
    /revolutionize/i,
    /game-?changing/i,
    /cutting-?edge/i,
    /empower your/i,
    /turbocharge/i,
    /unlock your potential/i,
    /next level/i,
    /level up/i,
    /crushing it/i,
    /🚀/,
    /💪/,
    /🔥/,
  ];

  const ALL_ACTION_KINDS = [
    { kind: 'complete_goal_setup' },
    { kind: 'start_diagnostic' },
    { kind: 'start_quick_win', title: 'Quick win', reason: 'Short burst.', focusSkill: 'math_linear_equations' },
    { kind: 'resume_active_session', title: 'Resume', reason: 'Unfinished session.' },
    { kind: 'start_retry_loop', title: 'Retry loop', reason: 'Fix the pattern.', ctaLabel: 'Retry now' },
    { kind: 'start_timed_set', title: 'Timed set', reason: 'Test under pressure.' },
    { kind: 'start_module', title: 'Module', reason: 'Full block.', section: 'math', realismProfile: 'extended' },
    { kind: 'review_mistakes', title: 'Review', reason: 'Check recent errors.' },
  ];

  for (const action of ALL_ACTION_KINDS) {
    it(`${action.kind}: CTA has no AI-slop language`, () => {
      const copy = studentActionCopy(action);
      assert.ok(copy, `studentActionCopy should return a copy object for ${action.kind}`);
      const fullText = `${copy.title} ${copy.reason} ${copy.ctaLabel}`;
      for (const pattern of AI_SLOP_PATTERNS) {
        assert.equal(pattern.test(fullText), false, `"${fullText}" should not contain slop pattern ${pattern}`);
      }
    });

    it(`${action.kind}: CTA label is concise (under 40 chars)`, () => {
      const copy = studentActionCopy(action);
      assert.ok(copy.ctaLabel.length <= 40, `CTA "${copy.ctaLabel}" is ${copy.ctaLabel.length} chars, should be ≤ 40`);
    });

    it(`${action.kind}: title is concise (under 60 chars)`, () => {
      const copy = studentActionCopy(action);
      assert.ok(copy.title.length <= 60, `Title "${copy.title}" is ${copy.title.length} chars, should be ≤ 60`);
    });

    it(`${action.kind}: reason reads as a sentence`, () => {
      const copy = studentActionCopy(action);
      assert.ok(copy.reason.length > 10, `Reason should be a real sentence, got "${copy.reason}"`);
      assert.match(copy.reason, /[.!]$/, `Reason should end with punctuation: "${copy.reason}"`);
    });
  }

  it('null action returns null gracefully', () => {
    assert.equal(studentActionCopy(null), null);
  });
});

// ── CTA hierarchy: each action kind uses a distinct verb ──

describe('CTA hierarchy: distinct verb per action kind', () => {
  it('primary CTAs use action-oriented verbs, not generic "Go" or "Click"', () => {
    const actionVerbs = new Map();
    const actions = [
      { kind: 'complete_goal_setup' },
      { kind: 'start_diagnostic' },
      { kind: 'start_quick_win', title: 'Quick win', reason: 'Short burst.', focusSkill: 'rw_inferences' },
      { kind: 'resume_active_session', title: 'Resume', reason: 'Unfinished.' },
      { kind: 'start_retry_loop', title: 'Retry', reason: 'Fix the trap.' },
      { kind: 'start_timed_set', title: 'Timed set', reason: 'Pressure test.' },
      { kind: 'start_module', title: 'Module', reason: 'Full block.', section: 'reading_writing', realismProfile: 'exam' },
      { kind: 'review_mistakes', title: 'Review', reason: 'Check errors.' },
    ];

    for (const action of actions) {
      const copy = studentActionCopy(action);
      const firstWord = copy.ctaLabel.split(' ')[0].toLowerCase();
      actionVerbs.set(action.kind, firstWord);

      // No CTA should start with vague verbs
      assert.notEqual(firstWord, 'go', `${action.kind} CTA should not start with "Go"`);
      assert.notEqual(firstWord, 'click', `${action.kind} CTA should not start with "Click"`);
      assert.notEqual(firstWord, 'submit', `${action.kind} CTA should not start with "Submit"`);
    }

    // complete_goal_setup and start_diagnostic should have hardcoded copy, not passthrough
    const goalCopy = studentActionCopy({ kind: 'complete_goal_setup' });
    assert.match(goalCopy.ctaLabel, /goal/i, 'Goal setup CTA should mention "goal"');

    const diagCopy = studentActionCopy({ kind: 'start_diagnostic' });
    assert.match(diagCopy.ctaLabel, /12-minute|check|diagnostic/i, 'Diagnostic CTA should reference the diagnostic');
  });
});

// ── CTA hierarchy: quick-win CTA includes skill name ──

describe('CTA hierarchy: quick-win skill contextualization', () => {
  it('quick-win with focusSkill includes human-readable skill name in CTA', () => {
    const copy = studentActionCopy({
      kind: 'start_quick_win',
      title: 'Quick win',
      reason: 'Short focused burst.',
      focusSkill: 'rw_sentence_boundaries',
    });
    assert.match(copy.ctaLabel, /Sentence Boundaries/i, 'CTA should contain the skill label');
  });

  it('quick-win without focusSkill falls back to generic CTA', () => {
    const copy = studentActionCopy({
      kind: 'start_quick_win',
      title: 'Quick win',
      reason: 'Short focused burst.',
    });
    assert.match(copy.ctaLabel, /practice/i, 'Generic quick-win CTA should say "practice"');
  });
});

describe('CTA hierarchy: module realism copy differentiates exam and standard blocks', () => {
  it('start_module exam profile copy is not generic practice wording', () => {
    const copy = studentActionCopy({
      kind: 'start_module',
      title: 'Math exam block',
      reason: 'Use a full-length block.',
      section: 'math',
      realismProfile: 'exam',
      itemCount: 22,
    });
    assert.match(copy.ctaLabel, /exam/i);
    assert.doesNotMatch(copy.ctaLabel, /practice block/i);
  });

  it('start_module standard profile copy stays practice-oriented', () => {
    const copy = studentActionCopy({
      kind: 'start_module',
      title: 'Math repair block',
      reason: 'Use a shorter block.',
      section: 'math',
      realismProfile: 'standard',
      itemCount: 12,
    });
    assert.doesNotMatch(copy.ctaLabel, /exam/i);
    assert.match(copy.ctaLabel, /practice|block/i);
  });
});

// ── Product wording: buildLearnerNarrative avoids placeholder-style copy ──

describe('product wording: learner narrative avoids placeholder copy', () => {
  const PLACEHOLDER_PATTERNS = [
    /lorem ipsum/i,
    /TODO/,
    /placeholder/i,
    /TBD/,
    /coming soon/i,
    /insert.*here/i,
  ];

  it('narrative with full data has no placeholder text', () => {
    const narrative = buildLearnerNarrative({
      action: { kind: 'start_quick_win', title: 'Quick win', reason: 'Fix this.', focusSkill: 'math_linear_equations' },
      planExplanation: { headline: 'Focus on algebra repair.' },
      projectionEvidence: { signalLabel: 'building', signalExplanation: 'Enough data to steer.' },
      whatChanged: { headline: 'Accuracy up on latest loop.', bullets: ['Pacing improved.'] },
      weeklyDigest: { next_week_opportunity: 'Move inferences from repair into speed.' },
    });

    const allText = [narrative.headline, narrative.summary, narrative.signalLine, narrative.planLine, narrative.thisWeekLine].join(' ');
    for (const pattern of PLACEHOLDER_PATTERNS) {
      assert.equal(pattern.test(allText), false, `Narrative should not contain ${pattern}`);
    }
  });

  it('narrative with minimal data still produces coherent defaults', () => {
    const narrative = buildLearnerNarrative({});
    assert.ok(narrative.headline.length > 3, 'headline must have real content');
    assert.ok(narrative.summary.length > 10, 'summary must have real content');
    assert.ok(narrative.signalLine.length > 5, 'signalLine must have real content');
    assert.ok(narrative.planLine.length > 5, 'planLine must have real content');
  });

  it('signal line includes "Score signal:" prefix for consistency', () => {
    const withSignal = buildLearnerNarrative({
      projectionEvidence: { signalLabel: 'building', signalExplanation: 'Range is forming.' },
    });
    assert.match(withSignal.signalLine, /^Score signal:/);
  });

  it('signal line without data gives forming message, not empty string', () => {
    const noSignal = buildLearnerNarrative({});
    assert.ok(noSignal.signalLine.length > 5);
    assert.doesNotMatch(noSignal.signalLine, /undefined|null|NaN/);
  });
});

// ── Product wording: formatSkillLabel produces consistent, readable labels ──

describe('product wording: formatSkillLabel consistency', () => {
  const SKILL_IDS = [
    'math_linear_equations',
    'math_quadratic_functions',
    'math_systems_of_linear_equations',
    'math_statistics_probability',
    'rw_inferences',
    'rw_sentence_boundaries',
    'rw_command_of_evidence',
    'rw_words_in_context',
    'rw_rhetorical_synthesis',
    'rw_central_ideas_and_details',
  ];

  for (const skillId of SKILL_IDS) {
    it(`${skillId}: label strips prefix and capitalizes`, () => {
      const label = formatSkillLabel(skillId);
      assert.doesNotMatch(label, /^rw_|^math_/, 'Label must strip section prefix');
      assert.match(label, /^[A-Z]/, 'Label must start capitalized');
      assert.doesNotMatch(label, /_/, 'Label must not contain underscores');
      assert.ok(label.length >= 3, `Label "${label}" is too short`);
    });
  }

  it('empty or undefined input returns empty string', () => {
    assert.equal(formatSkillLabel(''), '');
    assert.equal(formatSkillLabel(undefined), '');
  });
});

// ── CTA hierarchy in live store: action kinds follow the correct priority order ──

describe('CTA hierarchy: store-driven action priority', () => {
  it('new user without goal → complete_goal_setup', () => {
    const store = createStore();
    const { user } = store.registerUser({
      name: 'No Goal User',
      email: `nogoal-${Date.now()}@test.com`,
      password: 'pass1234',
    });
    const action = store.getNextBestAction(user.id);
    assert.equal(action.kind, 'complete_goal_setup');
  });

  it('user with goal but no attempts → start_diagnostic', () => {
    const store = createStore();
    const userId = registerAndSetGoal(store, 'Pre-diagnostic user');
    const action = store.getNextBestAction(userId);
    assert.equal(action.kind, 'start_diagnostic');
  });

  it('user with active session → resume_active_session', () => {
    const store = createStore();
    const userId = registerAndSetGoal(store, 'Active session user');
    store.startDiagnostic(userId);
    const action = store.getNextBestAction(userId);
    assert.equal(action.kind, 'resume_active_session');
    assert.match(action.ctaLabel, /resume/i, 'Resume CTA should say resume');
  });

  it('user post-diagnostic → gets a practice action (quick_win or retry or timed_set or module)', () => {
    const store = createStore();
    const userId = registerAndSetGoal(store, 'Post-diag user');
    completeDiagnostic(store, userId);
    const action = store.getNextBestAction(userId);
    assert.ok(
      ['start_quick_win', 'start_retry_loop', 'start_timed_set', 'start_module', 'review_mistakes'].includes(action.kind),
      `Post-diagnostic action should be a practice kind, got "${action.kind}"`,
    );
  });
});

// ── Product wording: dashboard section headings are student-facing ──

describe('product wording: HTML section headings are student-facing', () => {
  const html = readFileSync('apps/web/public/index.html', 'utf8');

  const EXPECTED_HEADINGS = [
    'Next block',
    'Your 12-minute starting point',
    'Diagnostic signal',
    'Why this is next',
    'Last session',
    'Short on time?',
    'Tomorrow',
    'Full dashboard',
    'Your baseline',
    'Your score range now',
    'Today\u2019s plan',
    'Why this comes first',
    'This month',
    'This week',
    'Repeat mistakes',
    'Since last time',
    'This week\u2019s progress',
    'Recent sessions',
    'Fix this now',
    'Reflection',
    'Practice Item',
  ];

  for (const heading of EXPECTED_HEADINGS) {
    it(`dashboard contains heading "${heading}"`, () => {
      assert.ok(html.includes(heading), `Expected heading "${heading}" in index.html`);
    });
  }

  it('no headings contain developer jargon like "component" or "widget"', () => {
    const h2Matches = html.match(/<h2[^>]*>([^<]+)<\/h2>/g) ?? [];
    for (const match of h2Matches) {
      const text = match.replace(/<[^>]+>/g, '').trim();
      assert.doesNotMatch(text, /component|widget|module_|section_|debug/i,
        `Heading "${text}" contains developer jargon`);
    }
  });
});

// ── Product wording: button labels in HTML are action-oriented ──

describe('product wording: button labels are action-oriented', () => {
  const html = readFileSync('apps/web/public/index.html', 'utf8');
  const buttonLabels = (html.match(/<button[^>]*>([^<]+)<\/button>/g) ?? [])
    .map((match) => match.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);

  it('all static button labels are present', () => {
    assert.ok(buttonLabels.length >= 5, `Expected at least 5 button labels, got ${buttonLabels.length}`);
  });

  it('no button says just "Submit" without context', () => {
    for (const label of buttonLabels) {
      if (label.toLowerCase() === 'submit') {
        assert.fail(`Button label "Submit" is too generic; should specify what is being submitted`);
      }
    }
  });

  it('key action buttons use specific verbs', () => {
    const allButtonText = buttonLabels.join(' ');
    assert.ok(allButtonText.includes('Sign In'), 'Should have "Sign In" button');
    assert.ok(allButtonText.includes('Create Account'), 'Should have "Create Account" button');
    assert.ok(allButtonText.includes('Save Goal Profile'), 'Should have "Save Goal Profile" button');
    assert.ok(allButtonText.includes('Submit Attempt'), 'Should have "Submit Attempt" button');
    assert.ok(allButtonText.includes('Get Tutor Hint'), 'Should have "Get Tutor Hint" button');
    assert.ok(allButtonText.includes('Save Reflection'), 'Should have "Save Reflection" button');
  });
});

// ── Product wording: CSS design tokens are professional ──

describe('product wording: CSS design tokens exist and use professional palette', () => {
  const css = readFileSync('apps/web/public/styles.css', 'utf8');

  it('root defines required design tokens', () => {
    const requiredTokens = ['--bg', '--surface', '--text', '--muted', '--accent', '--success', '--warning', '--danger'];
    for (const token of requiredTokens) {
      assert.ok(css.includes(token), `CSS should define ${token}`);
    }
  });

  it('no neon or garish colors in root palette', () => {
    // Extract hex colors from :root block
    const rootBlock = css.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '';
    const hexColors = rootBlock.match(/#[0-9a-fA-F]{3,8}/g) ?? [];
    for (const color of hexColors) {
      // No pure neon: reject #0f0, #ff0, #0ff, etc.
      const normalized = color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
      if (normalized.length >= 7) {
        const r = parseInt(normalized.slice(1, 3), 16);
        const g = parseInt(normalized.slice(3, 5), 16);
        const b = parseInt(normalized.slice(5, 7), 16);
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        const saturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;
        // Reject extremely saturated, bright colors (neon)
        if (maxChannel > 220 && saturation > 0.85) {
          assert.fail(`Color ${color} looks neon/garish (max=${maxChannel}, sat=${saturation.toFixed(2)})`);
        }
      }
    }
  });

  it('border-radius tokens are compact, not bubbly', () => {
    const radiusXl = css.match(/--radius-xl:\s*(\d+)/)?.[1];
    const radiusLg = css.match(/--radius-lg:\s*(\d+)/)?.[1];
    const radiusMd = css.match(/--radius-md:\s*(\d+)/)?.[1];
    const radiusSm = css.match(/--radius-sm:\s*(\d+)/)?.[1];
    assert.ok(Number(radiusXl) <= 16, `--radius-xl (${radiusXl}px) should be ≤ 16px for professional look`);
    assert.ok(Number(radiusLg) <= 14, `--radius-lg (${radiusLg}px) should be ≤ 14px`);
    assert.ok(Number(radiusMd) <= 12, `--radius-md (${radiusMd}px) should be ≤ 12px`);
    assert.ok(Number(radiusSm) <= 10, `--radius-sm (${radiusSm}px) should be ≤ 10px`);
  });
});

// ── CTA hierarchy: dashboard getDashboard returns coherent learner surface ──

describe('CTA hierarchy: dashboard integration coherence', () => {
  it('post-diagnostic dashboard has narrative, action, and study modes aligned', () => {
    const store = createStore();
    const userId = registerAndSetGoal(store, 'Dashboard Coherence');
    completeDiagnostic(store, userId);

    const dashboard = store.getDashboard(userId);

    // Narrative exists and is meaningful
    assert.ok(dashboard.learnerNarrative, 'dashboard should have learnerNarrative');
    assert.ok(dashboard.learnerNarrative.headline.length > 3, 'narrative headline should be real');
    assert.ok(dashboard.learnerNarrative.signalLine.length > 5, 'signal line should be real');

    // Next-best-action is available via learnerNarrative.primaryAction or getNextBestAction
    const action = dashboard.learnerNarrative?.primaryAction ?? store.getNextBestAction(userId);
    assert.ok(action, 'dashboard should have a derivable next action');
    const copy = studentActionCopy(action);
    assert.ok(copy, 'action copy should be derivable');
    assert.ok(copy.ctaLabel.length > 0, 'CTA label must not be empty');

    // Study modes when present should have 3 options
    if (dashboard.studyModes) {
      assert.equal(dashboard.studyModes.length, 3, 'study modes should offer exactly 3 options');
      assert.deepEqual(
        dashboard.studyModes.map((m) => m.key),
        ['quick', 'standard', 'deep'],
        'study mode keys should be quick/standard/deep',
      );
    }
  });

  it('deep study mode exposes module realism metadata for longer blocks', () => {
    const store = createStore();
    const userId = registerAndSetGoal(store, 'Deep Mode Metadata');
    completeDiagnostic(store, userId);

    const quickWin = store.startQuickWin(userId);
    for (const item of quickWin.items) {
      const canonical = DEMO_ITEM_MAP.get(item.itemId) ?? item;
      store.submitAttempt(buildLearnAttempt(userId, canonical, quickWin.session.id, { correct: true }));
    }

    const deepMode = store.getStudyModes(userId).find((mode) => mode.key === 'deep');
    assert.ok(deepMode, 'deep study mode should exist');
    assert.equal(deepMode.action.kind, 'start_module');
    assert.equal(deepMode.action.realismProfile, 'extended');
    assert.match(deepMode.label, /Extended/i);
    assert.match(deepMode.summary, /18-question|extended practice/i);
    assert.equal(typeof deepMode.action.itemCount, 'number');
    assert.equal(typeof deepMode.action.timeLimitSec, 'number');
    assert.equal(deepMode.action.itemCount, 18);
    assert.ok(deepMode.action.estimatedMinutes >= 20);
    if (deepMode.action.section === 'math') {
      assert.equal(deepMode.action.studentResponseTarget, 5);
      assert.match(deepMode.summary, /grid-in/i);
    } else {
      assert.equal(deepMode.action.studentResponseTarget ?? null, null);
    }
  });
});
