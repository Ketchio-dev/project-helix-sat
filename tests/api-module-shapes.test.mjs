import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, withAuthedServer, buildAttemptAnswer, isStudentProducedResponse, expectedMathStudentResponseTarget, toStageAverages, nextUniqueEmail, registerSession } from './api-test-helpers.mjs';

test('store dashboard module actions expose realism metadata that matches module-start shape', () => {
  const store = createStore();
  const { user } = store.registerUser({ name: 'Module Metadata Student', email: nextUniqueEmail('module-metadata-student'), password: 'pass1234' });
  store.updateGoalProfile(user.id, { targetScore: 1450, targetTestDate: '2026-09-12', dailyMinutes: 30, selfReportedWeakArea: 'algebra' });
  const diagnostic = store.startDiagnostic(user.id);
  for (const [index, item] of diagnostic.items.entries()) {
    store.submitAttempt({ userId: user.id, itemId: item.itemId, ...(index === 0 ? { selectedAnswer: 'A' } : buildAttemptAnswer(item.itemId)), sessionId: diagnostic.session.id, mode: 'learn', confidenceLevel: 3, responseTimeMs: 30000 });
  }
  const quickWin = store.startQuickWin(user.id);
  for (const item of quickWin.items) store.submitAttempt({ userId: user.id, itemId: item.itemId, ...buildAttemptAnswer(item.itemId), sessionId: quickWin.session.id, mode: 'learn', confidenceLevel: 4, responseTimeMs: 15000 });

  const dashboard = store.getDashboard(user.id);
  const moduleAction = dashboard.studyModes.find((mode) => mode.action?.kind === 'start_module')?.action ?? null;
  assert.ok(moduleAction);
  assert.ok(['reading_writing', 'math'].includes(moduleAction.section));
  assert.ok(['standard', 'extended', 'exam'].includes(moduleAction.realismProfile));
  assert.equal(moduleAction.structureBreakpoints.at(-1), moduleAction.itemCount);

  const started = store.startModuleSimulation(user.id, { section: moduleAction.section, realismProfile: moduleAction.realismProfile });
  assert.deepEqual(started.timing.structureBreakpoints, moduleAction.structureBreakpoints);
  assert.equal(started.items.length, moduleAction.itemCount);
  const stageAverages = toStageAverages(started.items, started.timing.structureBreakpoints);
  assert.ok(stageAverages.at(-1) >= stageAverages[0]);
  if (moduleAction.section === 'math') assert.equal(moduleAction.studentResponseTarget, expectedMathStudentResponseTarget(moduleAction));
});

for (const [title, request, expected] of [
  ['api can start an extended math module shape through the module-start contract', { section: 'math', realismProfile: 'extended' }, { timeLimitSec: 1900, pace: 95, items: 20, section: 'math', minResponses: 5 }],
  ['api can start an extended reading-writing module shape through the module-start contract', { section: 'reading_writing', realismProfile: 'extended' }, { timeLimitSec: 1680, pace: 84, items: 20, section: 'reading_writing' }],
  ['api can start an exam math module shape through the module-start contract', { section: 'math', realismProfile: 'exam' }, { timeLimitSec: 2100, pace: 95, items: 22, section: 'math', minResponses: 6 }],
  ['api can start an exam reading-writing module shape through the module-start contract', { section: 'reading_writing', realismProfile: 'exam' }, { timeLimitSec: 1920, pace: 71, items: 27, section: 'reading_writing' }],
]) {
  test(title, async () => {
    await withAuthedServer(async (baseUrl, sessions) => {
      const moduleSimulation = await fetch(`${baseUrl}/api/module/start`, { method: 'POST', headers: sessions.student.headers, body: JSON.stringify(request) }).then((res) => res.json());
      assert.equal(moduleSimulation.session.type, 'module_simulation');
      assert.equal(moduleSimulation.session.section, expected.section);
      assert.equal(moduleSimulation.timing.timeLimitSec, expected.timeLimitSec);
      assert.equal(moduleSimulation.timing.recommendedPaceSec, expected.pace);
      assert.equal(moduleSimulation.items.length, expected.items);
      if (expected.section === 'reading_writing') assert.ok(moduleSimulation.items.every((item) => item.section === 'reading_writing'));
      if (expected.minResponses) assert.ok(moduleSimulation.items.filter((item) => isStudentProducedResponse(item)).length >= expected.minResponses);
    });
  });
}
