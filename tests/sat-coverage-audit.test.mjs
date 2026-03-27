import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDemoData } from '../services/api/src/demo-data.mjs';
import { createAppServer } from '../services/api/server.mjs';

const authHeaders = {
  'Content-Type': 'application/json',
  'X-Demo-User-Id': 'demo-student',
};

const expectedDomainsBySection = {
  reading_writing: [
    'craft_and_structure',
    'information_and_ideas',
    'expression_of_ideas',
    'standard_english_conventions',
  ],
  math: [
    'algebra',
    'problem_solving_and_data_analysis',
    'geometry_and_trigonometry',
    'advanced_math',
  ],
};

const demoItemMap = new Map(
  Object.values(createDemoData().items).map((item) => [item.itemId, item]),
);

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function pickExamResponse(item) {
  const source = demoItemMap.get(item.itemId) ?? item;
  if (source.item_format === 'grid_in' || source.responseValidation?.kind === 'grid_in') {
    return source.responseValidation?.acceptedResponses?.[0] ?? source.answerKey;
  }
  return source.answerKey ?? item.choices[0]?.key;
}

async function withServer(run, options = {}) {
  const server = createAppServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('coverage audit: demo item bank spans both SAT sections and all top-level domains', () => {
  const data = createDemoData();
  const items = Object.values(data.items);
  const rationales = Object.values(data.rationales);

  assert.equal(items.length, 50);
  assert.equal(rationales.length, 50);

  const sections = countBy(items, (item) => item.section);
  assert.deepEqual(Object.keys(sections).sort(), ['math', 'reading_writing']);
  assert.equal(sections.reading_writing, 26);
  assert.equal(sections.math, 24);
  assert.ok(Math.abs(sections.reading_writing - sections.math) <= 4);

  for (const [section, expectedDomains] of Object.entries(expectedDomainsBySection)) {
    const sectionItems = items.filter((item) => item.section === section);
    const sectionDomains = [...new Set(sectionItems.map((item) => item.domain))].sort();
    assert.deepEqual(sectionDomains, [...expectedDomains].sort(), `${section} should cover all top-level domains`);
    assert.ok(sectionItems.length >= 20 || section === 'math', `${section} should have a meaningful item sample`);
  }

  assert.ok(items.every((item) => item.itemId && item.skill && item.domain && item.section));
  assert.ok(items.every((item) => (
    item.item_format === 'grid_in'
      ? Array.isArray(item.choices) && item.choices.length === 0
      : Array.isArray(item.choices) && item.choices.length === 4
  )));
  assert.ok(items.every((item) => typeof item.answerKey === 'string' && item.answerKey.length >= 1));
  assert.ok(rationales.every((rationale) => Array.isArray(rationale.hint_ladder) && rationale.hint_ladder.length >= 3));
  const mathGridInItems = items.filter((item) => item.item_format === 'grid_in' && item.section === 'math');
  assert.equal(mathGridInItems.length, 3);
  assert.ok(items.some((item) => item.skill === 'rw_punctuation'));
  assert.ok(items.filter((item) => item.skill === 'math_linear_equations').length >= 2);
  assert.ok(items.filter((item) => item.skill === 'math_circles').length >= 2);
  assert.ok(items.filter((item) => item.skill === 'math_trigonometry').length >= 2);
});

test('coverage audit: learner app flow exposes both sections through timed and module sessions', async () => {
  await withServer(async (baseUrl) => {
    const initialDashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: authHeaders,
    }).then((res) => res.json());

    assert.equal(initialDashboard.profile.name, 'Mina Park');
    assert.ok(initialDashboard.plan.blocks.length >= 1);
    assert.ok(Array.isArray(initialDashboard.review.recommendations));

    const timedSet = await fetch(`${baseUrl}/api/timed-set/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({}),
    }).then((res) => res.json());

    assert.equal(timedSet.items.length, 3);
    assert.equal(timedSet.session.type, 'timed_set');

    for (const item of timedSet.items) {
      const timedResult = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          itemId: item.itemId,
          [item.item_format === 'grid_in' ? 'freeResponse' : 'selectedAnswer']: pickExamResponse(item),
          sessionId: timedSet.session.id,
          mode: 'exam',
          confidenceLevel: 3,
          responseTimeMs: 60000,
        }),
      }).then((res) => res.json());

      assert.equal(timedResult.sessionType, 'timed_set');
    }

    const finishedTimedSet = await fetch(`${baseUrl}/api/timed-set/finish`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ sessionId: timedSet.session.id }),
    }).then((res) => res.json());

    assert.equal(finishedTimedSet.timedSummary.completed, true);
    assert.equal(finishedTimedSet.timedSummary.sessionId, timedSet.session.id);

    const moduleSimulation = await fetch(`${baseUrl}/api/module/start`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ section: 'math' }),
    }).then((res) => res.json());

    const moduleSections = countBy(moduleSimulation.items, (item) => item.section);
    assert.equal(moduleSimulation.items.length, 4);
    assert.deepEqual(moduleSections, { math: 4 });
    assert.ok(new Set(moduleSimulation.items.map((item) => item.skill)).size >= 3);
    assert.ok(new Set(moduleSimulation.items.map((item) => item.domain)).size >= 3);

    let finalModuleAttempt = null;
    for (const item of moduleSimulation.items) {
      finalModuleAttempt = await fetch(`${baseUrl}/api/attempt/submit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          itemId: item.itemId,
          [item.item_format === 'grid_in' ? 'freeResponse' : 'selectedAnswer']: pickExamResponse(item),
          sessionId: moduleSimulation.session.id,
          mode: 'exam',
          confidenceLevel: 3,
          responseTimeMs: 90000,
        }),
      }).then((res) => res.json());
    }

    assert.ok(finalModuleAttempt?.moduleSummary);
    assert.equal(finalModuleAttempt.moduleSummary.completed, true);
    assert.equal(finalModuleAttempt.moduleSummary.sectionBreakdown.length, 1);
    assert.deepEqual(finalModuleAttempt.moduleSummary.sectionBreakdown.map((entry) => entry.section ?? entry.key), ['math']);

    const finishedModule = await fetch(`${baseUrl}/api/module/finish`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ sessionId: moduleSimulation.session.id }),
    }).then((res) => res.json());

    assert.equal(finishedModule.moduleSummary.completed, true);

    const dashboard = await fetch(`${baseUrl}/api/dashboard/learner`, {
      headers: authHeaders,
    }).then((res) => res.json());

    assert.equal(dashboard.latestTimedSetSummary.sessionId, timedSet.session.id);
    assert.equal(dashboard.latestTimedSetSummary.completed, true);
    assert.equal(dashboard.latestModuleSummary.sessionId, moduleSimulation.session.id);
    assert.equal(dashboard.latestModuleSummary.completed, true);
    assert.deepEqual(
      dashboard.latestModuleSummary.sectionBreakdown.map((entry) => entry.section ?? entry.key).sort(),
      ['math'],
    );

    const history = await fetch(`${baseUrl}/api/sessions/history`, {
      headers: authHeaders,
    }).then((res) => res.json());

    const completedTypes = new Set(history.sessions.map((session) => session.type));
    assert.ok(completedTypes.has('timed_set'));
    assert.ok(completedTypes.has('module_simulation'));
  });
});
