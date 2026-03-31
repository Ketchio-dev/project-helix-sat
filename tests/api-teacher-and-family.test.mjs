import test from 'node:test';
import assert from 'node:assert/strict';
import { withAuthedServer } from './api-test-helpers.mjs';

test('api returns a parent-facing learner summary', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/parent/summary?learnerId=demo-student`, { headers: sessions.parent.headers });
    assert.equal(response.status, 200);
    const summary = await response.json();
    assert.equal(typeof summary.learnerName, 'string');
  });
});

test('api returns a teacher-facing learner brief', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/teacher/brief?learnerId=demo-student`, { headers: sessions.teacher.headers });
    assert.equal(response.status, 200);
    const brief = await response.json();
    assert.equal(typeof brief.teacherActionNote, 'string');
  });
});

test('api returns teacher assignment recommendations', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/teacher/assignments?learnerId=demo-student`, { headers: sessions.teacher.headers });
    assert.equal(response.status, 200);
    const assignments = await response.json();
    assert.ok(Array.isArray(assignments.recommended));
    assert.ok(Array.isArray(assignments.saved));
  });
});

test('api saves a teacher assignment draft', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/teacher/assignments`, {
      method: 'POST', headers: sessions.teacher.headers,
      body: JSON.stringify({ learnerId: 'demo-student', title: 'Scope mismatch recovery', objective: 'Reinforce sentence-role reading discipline.', minutes: 20, focusSkill: 'rw_text_structure_and_purpose', mode: 'review' }),
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.saved, true);
  });
});

test('api teacher routes require explicit learner context', async () => {
  await withAuthedServer(async (baseUrl, sessions) => {
    const response = await fetch(`${baseUrl}/api/teacher/brief`, { headers: sessions.teacher.headers });
    assert.equal(response.status, 400);
  });
});
