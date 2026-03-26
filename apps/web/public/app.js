import { normalizeTeacherAssignments, normalizeTeacherBrief } from './teacher-view-model.js';

const state = {
  userId: 'demo-student',
  currentItem: null,
  currentSessionId: null,
  currentSessionType: null,
  reflectionPrompt: '',
  latestTimedSetSummary: null,
};

const $ = (selector) => document.querySelector(selector);

const json = async (url, options) => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-User-Id': state.userId,
    },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
};

function clear(element) {
  element.replaceChildren();
}

function node(tag, { className, text, htmlFor, value, type, name, checked, id, placeholder, rows } = {}, children = []) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  if (htmlFor) element.htmlFor = htmlFor;
  if (value !== undefined) element.value = value;
  if (type) element.type = type;
  if (name) element.name = name;
  if (checked !== undefined) element.checked = checked;
  if (id) element.id = id;
  if (placeholder) element.placeholder = placeholder;
  if (rows !== undefined) element.rows = rows;
  for (const child of children) {
    if (child) element.append(child);
  }
  return element;
}

function kvRows(entries) {
  const wrapper = node('div', { className: 'kv' });
  for (const [label, value] of entries) {
    wrapper.append(node('strong', { text: label }));
    wrapper.append(node('span', { text: String(value) }));
  }
  return wrapper;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(normalized)}%`;
}

function formatMs(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return `${(numeric / 1000).toFixed(1)}s`;
}

function formatSeconds(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return `${numeric}s`;
}

function toDisplaySessionType(value) {
  if (!value) return 'session';
  return value === 'timed_set' ? 'Timed set' : value.charAt(0).toUpperCase() + value.slice(1);
}

function syncSessionControls() {
  const finishButton = $('#finishTimedSet');
  const modeSelect = $('#modeSelect');
  const isTimedSet = state.currentSessionType === 'timed_set';

  finishButton.classList.toggle('hidden', !isTimedSet);
  if (isTimedSet) {
    modeSelect.value = 'exam';
    modeSelect.disabled = true;
  } else {
    modeSelect.disabled = false;
  }
}

function renderProfile(profile) {
  const container = $('#profile');
  clear(container);
  container.append(
    kvRows([
      ['Name', profile.name],
      ['Target score', profile.targetScore],
      ['Test date', profile.targetTestDate],
      ['Daily minutes', profile.dailyMinutes],
      ['Language', profile.preferredExplanationLanguage],
    ]),
  );
}

function renderProjection(projection) {
  const container = $('#projection');
  clear(container);
  container.append(
    kvRows([
      ['Total', `${projection.predicted_total_low} - ${projection.predicted_total_high}`],
      ['Reading & Writing', `${projection.rw_low} - ${projection.rw_high}`],
      ['Math', `${projection.math_low} - ${projection.math_high}`],
      ['Readiness', projection.readiness_indicator],
      ['Confidence', `${Math.round(projection.confidence * 100)}%`],
      ['Momentum', `${Math.round((projection.momentum_score ?? 0) * 100)}%`],
    ]),
  );
}

function renderPlan(plan) {
  const container = $('#plan');
  clear(container);
  container.append(node('p', { text: plan.rationale_summary ?? 'Adaptive plan generated from learner state.' }));

  const list = node('ul', { className: 'list' });
  for (const block of plan.blocks) {
    const item = node('li');
    item.append(node('strong', { text: `${block.block_type} — ${block.minutes} min` }));
    item.append(document.createElement('br'));
    item.append(document.createTextNode(block.objective));
    item.append(document.createElement('br'));
    item.append(node('span', { className: 'muted', text: `Expected benefit: ${block.expected_benefit}` }));
    list.append(item);
  }
  container.append(list);
  container.append(node('p', { className: 'muted', text: `Fallback: ${plan.fallback_plan.trigger}` }));
  container.append(node('p', { className: 'muted', text: `Stop condition: ${plan.stop_condition}` }));
}

function renderErrorDna(errorDna) {
  const container = $('#errorDna');
  clear(container);
  const entries = Object.entries(errorDna)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!entries.length) {
    container.append(node('p', { className: 'muted', text: 'No dominant error signals yet.' }));
    return;
  }

  for (const [tag, score] of entries) {
    container.append(node('span', { className: 'badge', text: `${tag}: ${score}` }));
  }
}

function renderSessionHistory(payload) {
  const container = $('#sessionHistory');
  clear(container);

  const sessions = payload?.sessions ?? payload?.history ?? [];
  if (!sessions.length) {
    container.append(node('p', { className: 'muted', text: 'No completed sessions yet.' }));
    return;
  }

  const stack = node('div', { className: 'stack' });
  for (const session of sessions) {
    const card = node('article', { className: 'history-item' });
    const title = session.type ?? session.sessionType ?? 'session';
    const status = session.status ?? (session.endedAt || session.ended_at ? 'completed' : 'in progress');
    card.append(node('strong', { text: `${title} — ${status}` }));

    const details = [
      ['Started', formatDateTime(session.startedAt ?? session.started_at)],
      ['Ended', formatDateTime(session.endedAt ?? session.ended_at)],
      ['Attempts', session.attemptCount ?? session.answeredCount ?? session.answered ?? '—'],
      ['Accuracy', formatPercent(session.accuracy ?? session.accuracyRate)],
    ];
    card.append(kvRows(details));

    const reflection = session.lastReflection ?? session.reflection ?? session.summary;
    if (reflection) {
      card.append(node('p', { className: 'muted', text: `Reflection: ${typeof reflection === 'string' ? reflection : reflection.response ?? reflection.note ?? JSON.stringify(reflection)}` }));
    }
    stack.append(card);
  }

  container.append(stack);
}

function renderTimedSetSummary(summary) {
  const container = $('#timedSetSummary');
  clear(container);

  const normalized = summary?.timedSummary ?? summary ?? null;
  state.latestTimedSetSummary = normalized;

  if (!normalized) {
    container.append(node('p', { className: 'muted', text: 'No timed-set summary yet.' }));
    return;
  }

  const paceStatus = normalized.paceStatus ?? normalized.pace_status ?? 'on_pace';
  const paceLabelMap = {
    not_started: 'Not started',
    on_pace: 'On pace',
    behind_pace: 'Behind pace',
    over_time: 'Over time',
    ahead: 'Ahead',
    behind: 'Behind',
    on_target: 'On target',
  };
  const statusClass = paceStatus === 'on_pace' || paceStatus === 'on_target'
    ? 'pill success'
    : paceStatus === 'not_started'
      ? 'pill'
      : 'pill warning';

  const card = node('article', { className: 'timed-summary-item' });
  card.append(node('h3', { text: `${toDisplaySessionType(normalized.sessionType ?? normalized.type)} pacing snapshot` }));

  const pillRow = node('div', { className: 'session-status-row' }, [
    node('span', { className: 'pill', text: `${normalized.answered ?? 0}/${normalized.total ?? 0} answered` }),
    node('span', { className: statusClass, text: paceLabelMap[paceStatus] ?? paceStatus }),
    node('span', { className: 'pill', text: normalized.examMode || normalized.exam_mode ? 'Exam mode' : 'Reviewable' }),
  ]);
  card.append(pillRow);

  card.append(kvRows([
    ['Accuracy', formatPercent(normalized.accuracy)],
    ['Correct', normalized.correct ?? '—'],
    ['Average time', formatMs(normalized.averageResponseTimeMs ?? normalized.average_response_time_ms)],
    ['Time limit', formatSeconds(normalized.timeLimitSec ?? normalized.time_limit_sec)],
    ['Recommended pace', formatSeconds(normalized.recommendedPaceSec ?? normalized.recommended_pace_sec)],
    ['Remaining', formatSeconds(normalized.remainingTimeSec ?? normalized.remaining_time_sec ?? normalized.remaining)],
  ]));

  const nextAction = normalized.nextAction ?? normalized.next_action;
  if (nextAction) {
    card.append(node('p', { className: 'notice', text: `Next action: ${nextAction}` }));
  }

  container.append(card);
}

function renderParentSummary(summary) {
  const container = $('#parentSummary');
  clear(container);

  if (!summary) {
    container.append(node('p', { className: 'muted', text: 'Parent snapshot unavailable.' }));
    return;
  }

  const projectedScore = summary.projectedScoreBand
    ?? summary.projected_score_band
    ?? (summary.projection
      ? `${summary.projection.predicted_total_low} - ${summary.projection.predicted_total_high}`
      : '—');
  const learnerName = summary.learnerName ?? summary.learner_name ?? summary.name ?? 'Learner';
  const summaryRows = [
    ['Learner', learnerName],
    ['Projected score', projectedScore],
    ['Consistency', summary.consistency ?? summary.weeklyConsistency ?? summary.attendanceTrend ?? '—'],
    ['Top focus', summary.topFocus ?? summary.focusArea ?? summary.prioritySkill ?? '—'],
  ];
  container.append(kvRows(summaryRows));

  const strengths = summary.strengths ?? summary.highlights ?? [];
  if (strengths.length) {
    const strengthList = node('ul', { className: 'list compact' });
    for (const strength of strengths) {
      strengthList.append(node('li', { text: typeof strength === 'string' ? strength : strength.label ?? strength.skill ?? JSON.stringify(strength) }));
    }
    container.append(node('p', { className: 'muted', text: 'Strengths' }));
    container.append(strengthList);
  }

  const attention = summary.needsAttention ?? summary.needs_attention ?? summary.watchItems ?? [];
  if (attention.length) {
    const attentionList = node('ul', { className: 'list compact' });
    for (const item of attention) {
      attentionList.append(node('li', { text: typeof item === 'string' ? item : item.label ?? item.skill ?? JSON.stringify(item) }));
    }
    container.append(node('p', { className: 'muted', text: 'Needs attention' }));
    container.append(attentionList);
  }

  const parentAction = summary.recommendedParentAction ?? summary.parentAction ?? summary.nextAction;
  if (parentAction) {
    container.append(node('p', { className: 'notice', text: `Parent action: ${parentAction}` }));
  }
}

function renderTeacherBrief(summary) {
  const container = $('#teacherBrief');
  clear(container);

  const normalized = normalizeTeacherBrief(summary);

  if (!normalized) {
    container.append(node('p', { className: 'muted', text: 'Teacher brief unavailable.' }));
    return;
  }

  const rows = [
    ['Learner', normalized.learnerName],
    ['Projected score', normalized.projectedScoreBand],
    ['Readiness', normalized.readiness],
    ['Primary issue', normalized.primaryIssue],
  ];
  container.append(kvRows(rows));

  if (normalized.strengths.length) {
    const list = node('ul', { className: 'list compact' });
    for (const strength of normalized.strengths) {
      list.append(node('li', { text: typeof strength === 'string' ? strength : strength.skill ?? strength.label ?? JSON.stringify(strength) }));
    }
    container.append(node('p', { className: 'muted', text: 'Top strengths' }));
    container.append(list);
  }

  if (normalized.priorities.length) {
    const list = node('ul', { className: 'list compact' });
    for (const priority of normalized.priorities) {
      list.append(node('li', { text: typeof priority === 'string' ? priority : priority.skill ?? priority.label ?? JSON.stringify(priority) }));
    }
    container.append(node('p', { className: 'muted', text: 'Intervention priorities' }));
    container.append(list);
  }

  const warmup = normalized.recommendedWarmup;
  if (warmup) {
    container.append(node('p', { className: 'notice', text: `Warm-up: ${typeof warmup === 'string' ? warmup : warmup.title ?? warmup.objective ?? JSON.stringify(warmup)}` }));
  }

  const homework = normalized.recommendedHomework;
  if (homework) {
    container.append(node('p', { className: 'muted', text: `Homework: ${typeof homework === 'string' ? homework : homework.title ?? homework.objective ?? JSON.stringify(homework)}` }));
  }

  if (normalized.teacherAction) {
    container.append(node('p', { className: 'muted', text: `Teacher action: ${normalized.teacherAction}` }));
  }
}

function fillTeacherAssignmentForm(assignment) {
  if (!assignment) return;
  $('#teacherAssignmentTitle').value = assignment.title ?? assignment.name ?? '';
  $('#teacherAssignmentObjective').value = assignment.objective ?? assignment.prompt ?? '';
  $('#teacherAssignmentMinutes').value = assignment.minutes ?? assignment.durationMinutes ?? 20;
  $('#teacherAssignmentFocusSkill').value = assignment.focusSkill ?? assignment.skill ?? '';
  $('#teacherAssignmentMode').value = assignment.mode ?? 'review';
}

function renderTeacherAssignments(payload) {
  const container = $('#teacherAssignments');
  clear(container);

  const normalized = normalizeTeacherAssignments(payload);
  const { recommended, saved, all: assignments } = normalized;

  if (!assignments.length) {
    container.append(node('p', { className: 'muted', text: 'No teacher assignments available yet.' }));
    return;
  }

  const stack = node('div', { className: 'stack' });
  const renderGroup = (label, group) => {
    if (!group.length) return;
    stack.append(node('p', { className: 'muted', text: label }));
    for (const assignment of group) {
      const card = node('article', { className: 'teacher-assignment-item' });
      card.append(node('strong', { text: assignment.title ?? assignment.name ?? 'Assignment' }));
      if (assignment.objective ?? assignment.prompt) {
        card.append(node('p', { text: assignment.objective ?? assignment.prompt }));
      }
      card.append(node('p', {
        className: 'muted',
        text: `Mode: ${assignment.mode ?? 'review'} · Minutes: ${assignment.minutes ?? assignment.durationMinutes ?? '—'} · Focus: ${assignment.focusSkill ?? assignment.skill ?? '—'}`,
      }));
      if (assignment.rationale ?? assignment.reason) {
        card.append(node('p', { className: 'muted', text: assignment.rationale ?? assignment.reason }));
      }
      stack.append(card);
    }
  };

  renderGroup('Recommended', recommended);
  renderGroup('Saved', saved);

  if (!stack.childElementCount) {
    const card = node('article', { className: 'teacher-assignment-item' });
    card.append(node('strong', { text: assignments[0].title ?? assignments[0].name ?? 'Assignment' }));
    stack.append(card);
  }

  fillTeacherAssignmentForm(assignments[0]);
  container.append(stack);
}

function renderReview(review) {
  const meta = $('#reviewMeta');
  const container = $('#reviewRecommendations');
  clear(container);

  if (!review) {
    meta.textContent = 'No review data yet.';
    $('#reflectionPrompt').textContent = 'Complete a diagnostic or load the dashboard to get a reflection prompt.';
    state.reflectionPrompt = '';
    return;
  }

  meta.textContent = review.dominantError
    ? `Top mistake pattern: ${review.dominantError}`
    : 'Review recommendations are ready.';

  state.reflectionPrompt = review.reflectionPrompt ?? '';
  $('#reflectionPrompt').textContent = state.reflectionPrompt || 'Write one rule you will reuse next time.';

  const list = node('div', { className: 'stack' });
  for (const recommendation of review.recommendations ?? []) {
    const card = node('article', { className: 'review-item' });
    card.append(node('strong', { text: `${recommendation.section} · ${recommendation.skill}` }));
    card.append(node('p', { text: recommendation.prompt }));
    card.append(node('p', { className: 'muted', text: recommendation.reason }));
    if (recommendation.rationalePreview) {
      card.append(node('p', { className: 'review-rationale', text: recommendation.rationalePreview }));
    }
    card.append(node('p', { className: 'muted', text: `Next action: ${recommendation.recommendedAction}` }));
    list.append(card);
  }

  if (!(review.recommendations ?? []).length) {
    list.append(node('p', { className: 'muted', text: 'No review recommendations available yet.' }));
  }

  if (review.lastReflection?.response) {
    list.append(node('p', { className: 'muted', text: `Last reflection: ${review.lastReflection.response}` }));
  }

  container.append(list);
}

function renderItem(item) {
  state.currentItem = item;
  const container = $('#itemArea');
  clear(container);

  if (!item) {
    container.append(node('p', { className: 'muted', text: 'Start a diagnostic to load a practice item.' }));
    $('#attemptForm').classList.add('hidden');
    syncSessionControls();
    return;
  }

  container.append(node('p', { className: 'muted', text: `${item.section} / ${item.domain} / ${item.skill}` }));
  container.append(node('h3', { text: item.prompt }));
  if (item.passage) {
    container.append(node('p', { text: item.passage }));
  }

  const choices = node('div', { className: 'choice-list' });
  for (const choice of item.choices) {
    const input = node('input', {
      type: 'radio',
      name: 'selectedAnswer',
      value: choice.key,
      id: `choice-${choice.key}`,
    });
    const label = node('label', { className: 'choice', htmlFor: `choice-${choice.key}` });
    const textWrapper = node('span');
    textWrapper.append(node('strong', { text: `${choice.key}. ` }));
    textWrapper.append(document.createTextNode(choice.text));
    label.append(input, textWrapper);
    choices.append(label);
  }

  container.append(choices);
  $('#attemptForm').classList.remove('hidden');
  syncSessionControls();
}

function renderSessionProgress(progress) {
  if (!progress) return;
  const sessionLabel = toDisplaySessionType(state.currentSessionType);
  if (progress.isComplete) {
    $('#diagnosticStatus').textContent = `${sessionLabel} complete: ${progress.answered}/${progress.total} items answered.`;
    $('#attemptForm').classList.add('hidden');
    return;
  }
  const paceText = state.latestTimedSetSummary?.recommendedPaceSec ?? state.latestTimedSetSummary?.recommended_pace_sec;
  $('#diagnosticStatus').textContent = state.currentSessionType === 'timed_set'
    ? `${sessionLabel} progress: ${progress.answered}/${progress.total} answered · target pace ${paceText ?? 70}s/item`
    : `${sessionLabel} progress: ${progress.answered}/${progress.total} answered.`;
}

async function loadReviewRecommendations() {
  const review = await json('/api/review/recommendations');
  renderReview(review);
}

async function loadDashboard() {
  try {
    const [dashboard, sessionHistory, parentSummary, teacherBrief, teacherAssignments] = await Promise.all([
      json('/api/dashboard/learner'),
      json('/api/sessions/history').catch(() => null),
      json('/api/parent/summary').catch(() => null),
      json('/api/teacher/brief').catch(() => null),
      json('/api/teacher/assignments').catch(() => null),
    ]);

    renderProfile(dashboard.profile);
    renderProjection(dashboard.projection);
    renderPlan(dashboard.plan);
    renderErrorDna(dashboard.errorDna);
    renderReview(dashboard.review);
    renderSessionHistory(sessionHistory);
    renderTimedSetSummary(dashboard.latestTimedSetSummary);
    renderParentSummary(parentSummary);
    renderTeacherBrief(teacherBrief);
    renderTeacherAssignments(teacherAssignments);
    if (!state.currentSessionId) {
      state.currentSessionType = null;
      renderItem(null);
    }
    syncSessionControls();
    $('#diagnosticStatus').textContent = dashboard.profile.lastSessionSummary || 'No active diagnostic session.';
  } catch (error) {
    $('#diagnosticStatus').textContent = error.message;
  }
}

$('#refreshDashboard').addEventListener('click', async () => {
  await loadDashboard();
  await loadReviewRecommendations();
});

$('#startDiagnostic').addEventListener('click', async () => {
  try {
    const result = await json('/api/diagnostic/start', {
      method: 'POST',
      body: JSON.stringify({ userId: state.userId }),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    renderItem(result.currentItem);
    renderSessionProgress(result.sessionProgress);
  } catch (error) {
    $('#diagnosticStatus').textContent = error.message;
  }
});

$('#startTimedSet').addEventListener('click', async () => {
  try {
    const result = await json('/api/timed-set/start', {
      method: 'POST',
      body: JSON.stringify({ userId: state.userId }),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    renderTimedSetSummary({
      sessionType: result.session.type,
      examMode: result.pacing?.exam_mode ?? result.timing?.examMode ?? true,
      answered: result.sessionProgress?.answered ?? 0,
      total: result.sessionProgress?.total ?? result.items?.length ?? 0,
      accuracy: null,
      correct: 0,
      timeLimitSec: result.pacing?.time_limit_sec ?? result.timing?.timeLimitSec ?? result.session.time_limit_sec,
      recommendedPaceSec: result.pacing?.recommended_pace_sec ?? result.timing?.recommendedPaceSec ?? result.session.recommended_pace_sec,
      remainingTimeSec: result.pacing?.time_limit_sec ?? result.timing?.timeLimitSec ?? result.session.time_limit_sec,
      paceStatus: 'not_started',
      nextAction: 'Work through the set in exam mode, then finish to review your pacing.',
    });
    renderItem(result.currentItem);
    renderSessionProgress(result.sessionProgress);
  } catch (error) {
    $('#diagnosticStatus').textContent = error.message;
  }
});

$('#attemptForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = document.querySelector('input[name="selectedAnswer"]:checked');
  if (!selected || !state.currentItem) {
    $('#attemptResult').textContent = 'Select an answer first.';
    return;
  }

  const payload = {
    userId: state.userId,
    itemId: state.currentItem.itemId,
    sessionId: state.currentSessionId,
    selectedAnswer: selected.value,
    confidenceLevel: Number($('#confidenceLevel').value),
    mode: $('#modeSelect').value,
    responseTimeMs: 48000,
  };

  try {
    const result = await json('/api/attempt/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    $('#attemptResult').textContent = JSON.stringify(result, null, 2);
    state.currentSessionType = result.sessionType ?? state.currentSessionType;
    renderProjection(result.projection);
    renderPlan(result.plan);
    renderErrorDna(result.errorDna);
    renderReview(result.review);
    if (result.timedSummary) {
      renderTimedSetSummary(result.timedSummary);
    }
    renderSessionProgress(result.sessionProgress);
    if (result.nextItem) {
      renderItem(result.nextItem);
    } else {
      if (state.currentSessionType === 'timed_set') {
        state.currentItem = null;
        state.currentSessionId = null;
        state.currentSessionType = null;
      }
      renderItem(null);
    }
  } catch (error) {
    $('#attemptResult').textContent = error.message;
  }
});

$('#finishTimedSet').addEventListener('click', async () => {
  if (!state.currentSessionId || state.currentSessionType !== 'timed_set') return;

  try {
    const result = await json('/api/timed-set/finish', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.currentSessionId,
      }),
    });
    renderTimedSetSummary(result.timedSummary ?? result);
    renderSessionProgress(result.sessionProgress);
    $('#attemptResult').textContent = JSON.stringify(result, null, 2);
    state.currentItem = null;
    state.currentSessionId = null;
    state.currentSessionType = null;
    renderItem(null);
    await loadDashboard();
  } catch (error) {
    $('#attemptResult').textContent = error.message;
  }
});

$('#getHint').addEventListener('click', async () => {
  if (!state.currentItem) return;
  try {
    const result = await json('/api/tutor/hint', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.userId,
        itemId: state.currentItem.itemId,
        sessionId: state.currentSessionId,
        mode: $('#modeSelect').value,
        requestedLevel: 1,
      }),
    });
    $('#hintResult').textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    $('#hintResult').textContent = error.message;
  }
});

$('#reflectionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = $('#reflectionResponse').value.trim();
  if (!response) {
    $('#reflectionResult').textContent = 'Write a reflection before saving.';
    return;
  }

  try {
    const result = await json('/api/reflection/submit', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.userId,
        sessionId: state.currentSessionId,
        prompt: state.reflectionPrompt,
        response,
      }),
    });
    $('#reflectionResult').textContent = JSON.stringify(result, null, 2);
    $('#reflectionResponse').value = '';
    await loadReviewRecommendations();
  } catch (error) {
    $('#reflectionResult').textContent = error.message;
  }
});

$('#teacherAssignmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = $('#teacherAssignmentTitle').value.trim();
  const objective = $('#teacherAssignmentObjective').value.trim();

  if (!title || !objective) {
    $('#teacherAssignmentResult').textContent = 'Add both a title and objective before saving.';
    return;
  }

  try {
    const result = await json('/api/teacher/assignments', {
      method: 'POST',
      body: JSON.stringify({
        title,
        objective,
        minutes: Number($('#teacherAssignmentMinutes').value),
        focusSkill: $('#teacherAssignmentFocusSkill').value.trim(),
        mode: $('#teacherAssignmentMode').value,
      }),
    });
    $('#teacherAssignmentResult').textContent = JSON.stringify(result, null, 2);
    renderTeacherAssignments(result.teacherAssignments ?? result);
    renderTeacherBrief(result.teacherBrief ?? null);
  } catch (error) {
    $('#teacherAssignmentResult').textContent = error.message;
  }
});

loadDashboard().then(loadReviewRecommendations).catch((error) => {
  $('#diagnosticStatus').textContent = error.message;
});
