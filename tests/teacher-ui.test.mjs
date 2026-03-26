import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeacherAssignments, normalizeTeacherBrief } from '../apps/web/public/teacher-view-model.js';

test('normalizeTeacherBrief derives primary issue from intervention priorities', () => {
  const summary = normalizeTeacherBrief({
    learnerName: 'Mina Park',
    projectedScoreBand: '1420-1480',
    readiness: 'building',
    interventionPriorities: ['rw_text_structure_and_purpose', 'rw_words_in_context'],
    topStrengths: ['math_linear_equations'],
    recommendedWarmup: { title: 'Scope repair warm-up' },
    teacherActionNote: 'Open class with one scope repair drill.',
  });

  assert.equal(summary.primaryIssue, 'rw_text_structure_and_purpose');
  assert.deepEqual(summary.priorities, ['rw_text_structure_and_purpose', 'rw_words_in_context']);
});

test('normalizeTeacherAssignments handles GET payload shape', () => {
  const assignments = normalizeTeacherAssignments({
    recommended: [{ id: 'r1', title: 'Repair scope' }],
    saved: [{ id: 's1', title: 'Timed follow-up' }],
  });

  assert.equal(assignments.recommended.length, 1);
  assert.equal(assignments.saved.length, 1);
  assert.equal(assignments.all.length, 2);
});

test('normalizeTeacherAssignments handles POST save payload shape', () => {
  const assignments = normalizeTeacherAssignments({
    saved: true,
    assignment: { id: 's2', title: 'Saved assignment' },
    teacherAssignments: {
      recommended: [{ id: 'r1', title: 'Repair scope' }],
      saved: [{ id: 's2', title: 'Saved assignment' }],
    },
  });

  assert.equal(assignments.recommended[0].id, 'r1');
  assert.equal(assignments.saved[0].id, 's2');
  assert.equal(assignments.all.length, 2);
});
