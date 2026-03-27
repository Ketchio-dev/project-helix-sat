import { normalizeTeacherAssignments, normalizeTeacherBrief } from './teacher-view-model.js';

const state = {
  userId: null,
  userRole: null,
  linkedLearners: [],
  selectedLearnerId: null,
  goalProfile: null,
  nextBestAction: null,
  diagnosticReveal: null,
  currentItem: null,
  currentSessionId: null,
  currentSessionType: null,
  currentSessionProgress: null,
  reflectionPrompt: '',
  latestTimedSetSummary: null,
  latestModuleSummary: null,
  activeSessionEnvelope: null,
  sessionTimerHandle: null,
};

const $ = (selector) => document.querySelector(selector);

function currentLearnerQuery() {
  if (!state.selectedLearnerId || ['student', 'admin'].includes(state.userRole)) {
    return '';
  }
  return `learnerId=${encodeURIComponent(state.selectedLearnerId)}`;
}

function withLearnerContext(url) {
  const query = currentLearnerQuery();
  if (!query) return url;
  return url.includes('?') ? `${url}&${query}` : `${url}?${query}`;
}

const json = async (url, options) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  const response = await fetch(url, { credentials: 'same-origin', headers, ...options });
  if (response.status === 401) {
    state.userId = null;
    state.userRole = null;
    state.linkedLearners = [];
    state.selectedLearnerId = null;
    state.goalProfile = null;
    state.nextBestAction = null;
    state.diagnosticReveal = null;
    showLogin();
    const payload = await response.json().catch(() => ({ error: 'Unauthorized' }));
    const error = new Error(payload.error || 'Unauthorized');
    error.status = 401;
    error.payload = payload;
    throw error;
  }
  if (response.status === 204) return null;
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
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
    wrapper.append(node('span', { text: value === null || value === undefined || value === '' ? '—' : String(value) }));
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

function formatCountdown(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Math.max(0, Number(value));
  if (Number.isNaN(numeric)) return String(value);
  const minutes = Math.floor(numeric / 60);
  const seconds = numeric % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function toDisplaySessionType(value) {
  if (!value) return 'session';
  if (value === 'timed_set') return 'Timed set';
  if (value === 'module' || value === 'module_simulation') return 'Module simulation';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSectionName(section) {
  if (!section) return '';
  if (section === 'reading_writing') return 'Reading & Writing';
  if (section === 'math') return 'Math';
  return section.charAt(0).toUpperCase() + section.slice(1).replace(/_/g, ' ');
}

function isExamSessionType(value) {
  return value === 'timed_set' || value === 'module' || value === 'module_simulation';
}

function isStudentProducedResponseItem(item) {
  return ['grid_in', 'student_produced_response', 'student-produced-response'].includes(item?.item_format);
}

function renderSessionNotice(message, tone = 'info') {
  const element = $('#sessionNotice');
  if (!message) {
    element.textContent = '';
    element.className = 'session-notice hidden';
    return;
  }
  element.textContent = message;
  element.className = `session-notice ${tone}`;
}

function clearSessionNotice() {
  renderSessionNotice('', 'info');
}

function clearSessionTimer() {
  if (state.sessionTimerHandle) {
    clearInterval(state.sessionTimerHandle);
    state.sessionTimerHandle = null;
  }
  const element = $('#sessionTimer');
  element.textContent = '';
  element.className = 'session-timer hidden';
  syncExamInteractionState(false);
}

function renderSessionTimer({ label, remainingTimeSec, expired = false }) {
  const element = $('#sessionTimer');
  if (remainingTimeSec === null || remainingTimeSec === undefined || !state.currentSessionType || !isExamSessionType(state.currentSessionType)) {
    clearSessionTimer();
    return;
  }
  element.textContent = expired
    ? `${label} expired — finish now to review results.`
    : `${label} countdown: ${formatCountdown(remainingTimeSec)} remaining`;
  element.className = `session-timer ${expired ? 'expired' : remainingTimeSec <= 30 ? 'warning' : ''}`.trim();
  syncExamInteractionState(expired);
}

function syncExamInteractionState(expired) {
  const attemptSubmit = $('#attemptForm button[type="submit"]');
  const hintButton = $('#getHint');
  const shouldLock = Boolean(expired && isExamSessionType(state.currentSessionType));

  for (const input of document.querySelectorAll('input[name="selectedAnswer"]')) {
    input.disabled = shouldLock;
  }

  const freeResponseInput = document.querySelector('input[name="freeResponse"]');
  if (freeResponseInput) {
    freeResponseInput.disabled = shouldLock;
  }

  if (attemptSubmit) {
    attemptSubmit.disabled = shouldLock;
  }

  if (hintButton) {
    hintButton.disabled = shouldLock;
  }
}

function getCurrentCountdownState() {
  if (!isExamSessionType(state.currentSessionType)) return null;
  const summary = getCurrentExamSummary();
  const session = state.activeSessionEnvelope?.session ?? null;
  const timing = state.activeSessionEnvelope?.timing ?? null;
  const startedAt = summary?.startedAt ?? summary?.started_at ?? session?.started_at ?? session?.startedAt ?? null;
  const timeLimitSec = summary?.timeLimitSec
    ?? summary?.time_limit_sec
    ?? timing?.timeLimitSec
    ?? timing?.time_limit_sec
    ?? session?.time_limit_sec
    ?? session?.timeLimitSec
    ?? null;

  if (!startedAt || timeLimitSec === null || timeLimitSec === undefined) {
    return null;
  }

  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return null;

  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  const remainingTimeSec = Math.max(0, Number(timeLimitSec) - elapsedSec);
  return {
    startedAt,
    timeLimitSec: Number(timeLimitSec),
    elapsedSec,
    remainingTimeSec,
    expired: elapsedSec >= Number(timeLimitSec),
  };
}

function getCurrentExamSummary() {
  if (state.currentSessionType === 'module_simulation') return state.latestModuleSummary;
  if (state.currentSessionType === 'timed_set') return state.latestTimedSetSummary;
  return null;
}

function startSessionTimer() {
  clearSessionTimer();
  if (!isExamSessionType(state.currentSessionType)) return;
  const activeSection = state.activeSessionEnvelope?.session?.section;
  const sectionSuffix = activeSection ? ` (${formatSectionName(activeSection)})` : '';
  const label = toDisplaySessionType(state.currentSessionType) + sectionSuffix;
  const update = () => {
    const countdown = getCurrentCountdownState();
    if (!countdown) {
      clearSessionTimer();
      return;
    }
    renderSessionTimer({ label, remainingTimeSec: countdown.remainingTimeSec, expired: countdown.expired });
    if (state.currentSessionProgress && !state.currentSessionProgress.isComplete) {
      const activeSummary = getCurrentExamSummary();
      const paceText = activeSummary?.recommendedPaceSec ?? activeSummary?.recommended_pace_sec;
      $('#diagnosticStatus').textContent = countdown.expired
        ? `${label} expired: ${state.currentSessionProgress.answered}/${state.currentSessionProgress.total} answered. Finish now to review results.`
        : `${label} progress: ${state.currentSessionProgress.answered}/${state.currentSessionProgress.total} answered · ${formatCountdown(countdown.remainingTimeSec)} remaining · target pace ${paceText ?? 70}s/item`;
    }
  };

  update();
  state.sessionTimerHandle = setInterval(update, 1000);
}

function syncSessionControls() {
  const finishTimedSetButton = $('#finishTimedSet');
  const finishModuleButton = $('#finishModule');
  const modeSelect = $('#modeSelect');
  const isTimedSet = state.currentSessionType === 'timed_set';
  const isModule = state.currentSessionType === 'module_simulation';
  const isExamSession = isExamSessionType(state.currentSessionType);

  finishTimedSetButton.classList.toggle('hidden', !isTimedSet);
  finishModuleButton.classList.toggle('hidden', !isModule);
  if (isExamSession) {
    modeSelect.value = 'exam';
    modeSelect.disabled = true;
  } else {
    modeSelect.disabled = false;
    clearSessionTimer();
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

function focusGoalSetup() {
  const section = $('#goalSetupSection');
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#goalTargetScore')?.focus();
}

async function performNextBestAction(action) {
  if (!action) return;

  switch (action.kind) {
    case 'complete_goal_setup':
      focusGoalSetup();
      return;
    case 'start_diagnostic':
      $('#startDiagnostic')?.click();
      return;
    case 'resume_active_session':
      $('#itemArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    case 'review_mistakes':
      $('#reviewRecommendations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    case 'start_timed_set':
      $('#startTimedSet')?.click();
      return;
    case 'start_module':
      if (action.section) {
        $('#moduleSection').value = action.section;
      }
      $('#startModule')?.click();
      return;
    default:
      return;
  }
}

function renderGoalProfile(goalProfile) {
  state.goalProfile = goalProfile ?? null;
  const section = $('#goalSetupSection');
  const result = $('#goalSetupResult');
  if (!section) return;

  const isStudentSurface = state.userRole === 'student' || state.userRole === 'admin';
  if (!isStudentSurface || !goalProfile || goalProfile.isComplete) {
    section.style.display = 'none';
    if (result) {
      result.textContent = goalProfile?.isComplete
        ? 'Goal profile saved. Helix can now shape your plan around your score target and schedule.'
        : 'Finish your goal setup to unlock your first personalized plan.';
    }
    return;
  }

  section.style.display = 'block';
  $('#goalTargetScore').value = goalProfile.targetScore ?? 1400;
  $('#goalTargetDate').value = goalProfile.targetTestDate ?? '';
  $('#goalDailyMinutes').value = goalProfile.dailyMinutes ?? 30;
  $('#goalWeakArea').value = goalProfile.selfReportedWeakArea ?? '';
  if (result) {
    result.textContent = 'Complete this once so Helix can tune your first score-moving plan.';
  }
}

function renderNextBestAction(action) {
  state.nextBestAction = action ?? null;
  const section = $('#nextBestActionSection');
  const container = $('#nextBestAction');
  if (!section || !container) return;

  const isStudentSurface = state.userRole === 'student' || state.userRole === 'admin';
  if (!isStudentSurface || !action) {
    section.style.display = 'none';
    clear(container);
    return;
  }

  section.style.display = 'block';
  clear(container);
  container.append(node('h3', { text: action.title }));
  container.append(node('p', { text: action.reason }));
  const meta = [];
  if (action.estimatedMinutes) meta.push(`~${action.estimatedMinutes} min`);
  if (action.section) meta.push(formatSectionName(action.section));
  if (action.sessionType) meta.push(toDisplaySessionType(action.sessionType));
  if (meta.length) {
    container.append(node('p', { className: 'muted', text: meta.join(' · ') }));
  }
  const button = node('button', { text: action.ctaLabel });
  button.addEventListener('click', () => performNextBestAction(action));
  container.append(button);
}

function renderDiagnosticReveal(reveal) {
  state.diagnosticReveal = reveal ?? null;
  const section = $('#diagnosticRevealSection');
  const container = $('#diagnosticReveal');
  if (!section || !container) return;

  if (!reveal) {
    section.style.display = 'none';
    clear(container);
    return;
  }

  section.style.display = 'block';
  clear(container);
  container.append(node('p', {
    className: 'notice',
    text: `Current score band: ${reveal.scoreBand.low}–${reveal.scoreBand.high} · confidence ${Math.round((reveal.confidence ?? 0) * 100)}% · momentum ${Math.round((reveal.momentum ?? 0) * 100)}%`,
  }));

  const leakList = node('div', { className: 'stack' });
  for (const leak of reveal.topScoreLeaks ?? []) {
    const card = node('article', { className: 'review-item' });
    card.append(node('strong', { text: leak.label }));
    card.append(node('p', { text: leak.summary }));
    card.append(node('span', { className: 'muted', text: `Signal strength: ${leak.score}` }));
    leakList.append(card);
  }

  if (!(reveal.topScoreLeaks ?? []).length) {
    leakList.append(node('p', { className: 'muted', text: 'Helix needs a little more evidence before it can name your top score leaks.' }));
  }

  container.append(leakList);
  if (reveal.firstRecommendedAction) {
    const ctaWrap = node('div', { className: 'stack' });
    ctaWrap.append(node('strong', { text: 'Start here next' }));
    ctaWrap.append(node('p', { text: reveal.firstRecommendedAction.reason }));
    const button = node('button', { text: reveal.firstRecommendedAction.ctaLabel });
    button.addEventListener('click', () => performNextBestAction(reveal.firstRecommendedAction));
    ctaWrap.append(button);
    container.append(ctaWrap);
  }
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
    const title = toDisplaySessionType(session.type ?? session.sessionType ?? 'session');
    const sectionLabel = session.section ? ` (${formatSectionName(session.section)})` : '';
    const status = session.status ?? (session.endedAt || session.ended_at ? 'completed' : 'in progress');
    card.append(node('strong', { text: `${title}${sectionLabel} — ${status}` }));

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

    const isComplete = status === 'complete' || status === 'completed';
    if (isComplete && session.sessionId) {
      const reviewBtn = node('button', { className: 'secondary review-session-btn', text: 'Review Session' });
      reviewBtn.addEventListener('click', () => loadSessionReview(session.sessionId));
      card.append(reviewBtn);
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
  startSessionTimer();
}

function normalizeBreakdownEntries(value) {
  if (!value) return [];

  const fromObjectEntry = (label, detail) => {
    if (detail === null || detail === undefined) {
      return { label, details: [] };
    }

    if (typeof detail !== 'object') {
      return { label, details: [['Value', detail]] };
    }

    return {
      label,
      details: [
        ['Accuracy', formatPercent(detail.accuracy ?? detail.accuracyRate)],
        ['Correct', detail.correct ?? detail.correctCount],
        ['Answered', detail.answered ?? detail.attemptCount],
        ['Total', detail.total ?? detail.totalItems ?? detail.itemCount],
        ['Average time', formatMs(detail.averageResponseTimeMs ?? detail.average_response_time_ms)],
        ['Pace', detail.paceStatus ?? detail.pace_status],
        ['Readiness', detail.readinessIndicator ?? detail.readiness_signal ?? detail.readinessSignal ?? detail.readiness],
      ].filter(([, itemValue]) => itemValue !== null && itemValue !== undefined && itemValue !== ''),
    };
  };

  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const label = entry.label ?? entry.key ?? entry.domain ?? entry.section ?? entry.skill ?? `Breakdown ${index + 1}`;
        return fromObjectEntry(label, entry);
      }
      return fromObjectEntry(`Breakdown ${index + 1}`, entry);
    });
  }

  if (typeof value === 'object') {
    return Object.entries(value).map(([label, detail]) => fromObjectEntry(label, detail));
  }

  return [];
}

function renderBreakdownGroup(container, label, breakdown) {
  const entries = normalizeBreakdownEntries(breakdown);
  if (!entries.length) return;

  container.append(node('p', { className: 'muted', text: label }));
  const list = node('div', { className: 'summary-breakdown-grid' });

  for (const entry of entries) {
    const card = node('article', { className: 'summary-breakdown-item' });
    card.append(node('strong', { text: entry.label }));
    if (!entry.details.length) {
      card.append(node('p', { className: 'muted', text: 'No details yet.' }));
    } else {
      card.append(kvRows(entry.details));
    }
    list.append(card);
  }

  container.append(list);
}

function renderModuleSummary(summary) {
  const container = $('#moduleSummary');
  clear(container);

  const normalized = summary?.moduleSummary ?? summary ?? null;
  state.latestModuleSummary = normalized;

  if (!normalized) {
    container.append(node('p', { className: 'muted', text: 'No module summary yet.' }));
    return;
  }

  const paceStatus = normalized.paceStatus ?? normalized.pace_status ?? 'on_target';
  const paceLabelMap = {
    not_started: 'Not started',
    on_pace: 'On pace',
    on_target: 'On target',
    behind_pace: 'Behind pace',
    behind: 'Behind',
    over_time: 'Over time',
    ahead: 'Ahead',
  };
  const statusClass = paceStatus === 'on_pace' || paceStatus === 'on_target'
    ? 'pill success'
    : paceStatus === 'not_started'
      ? 'pill'
      : 'pill warning';

  const card = node('article', { className: 'timed-summary-item module-summary-item' });
  card.append(node('h3', { text: `${toDisplaySessionType(normalized.sessionType ?? normalized.type ?? 'module_simulation')} results` }));

  const pillRow = node('div', { className: 'session-status-row' }, [
    node('span', { className: 'pill', text: `${normalized.answered ?? 0}/${normalized.total ?? 0} answered` }),
    node('span', { className: statusClass, text: paceLabelMap[paceStatus] ?? paceStatus }),
    node('span', { className: 'pill', text: normalized.examMode || normalized.exam_mode ? 'Exam mode' : 'Reviewable' }),
  ]);

  const readiness = normalized.readinessIndicator ?? normalized.readiness_indicator ?? normalized.readinessSignal ?? normalized.readiness_signal ?? normalized.readiness;
  if (readiness) {
    pillRow.append(node('span', { className: 'pill', text: readiness }));
  }
  card.append(pillRow);

  card.append(kvRows([
    ['Accuracy', formatPercent(normalized.accuracy)],
    ['Correct', normalized.correct ?? '—'],
    ['Average time', formatMs(normalized.averageResponseTimeMs ?? normalized.average_response_time_ms)],
    ['Time limit', formatSeconds(normalized.timeLimitSec ?? normalized.time_limit_sec)],
    ['Recommended pace', formatSeconds(normalized.recommendedPaceSec ?? normalized.recommended_pace_sec)],
    ['Remaining', formatSeconds(normalized.remainingTimeSec ?? normalized.remaining_time_sec ?? normalized.remaining)],
  ]));

  const section = normalized.section ?? normalized.moduleSection;
  const focusDomain = normalized.focusDomain ?? normalized.focus_domain ?? normalized.domain;
  if (section || focusDomain) {
    card.append(node('p', {
      className: 'notice',
      text: `Blueprint: ${section ?? '—'}${focusDomain ? ` · ${focusDomain}` : ''}`,
    }));
  }

  renderBreakdownGroup(card, 'Section breakdown', normalized.sectionBreakdown ?? normalized.section_breakdown);
  renderBreakdownGroup(card, 'Domain breakdown', normalized.domainBreakdown ?? normalized.domain_breakdown ?? normalized.breakdown);

  const nextAction = normalized.nextAction ?? normalized.next_action;
  if (nextAction) {
    card.append(node('p', { className: 'notice', text: `Next action: ${nextAction}` }));
  }

  container.append(card);
  startSessionTimer();
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
  if (item) state.itemRenderedAt = Date.now();
  const container = $('#itemArea');
  clear(container);

  if (!item) {
    container.append(node('p', { className: 'muted', text: 'Start a diagnostic, timed set, or module simulation to load a practice item.' }));
    $('#attemptForm').classList.add('hidden');
    syncSessionControls();
    return;
  }

  container.append(node('p', { className: 'muted', text: `${item.section} / ${item.domain} / ${item.skill}` }));
  container.append(node('h3', { text: item.prompt }));
  if (item.passage) {
    container.append(node('p', { text: item.passage }));
  }

  if (isStudentProducedResponseItem(item)) {
    const responseValidation = item.responseValidation ?? {};
    const input = node('input', {
      type: 'text',
      name: 'freeResponse',
      id: 'freeResponseInput',
      placeholder: responseValidation.placeholder ?? 'Enter your response',
    });
    container.append(node('label', { className: 'spr-response-label', htmlFor: 'freeResponseInput', text: 'Student-produced response' }));
    container.append(input);
    if (responseValidation.instructions) {
      container.append(node('p', { className: 'muted', text: responseValidation.instructions }));
    }
  } else {
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
  }
  $('#attemptForm').classList.remove('hidden');
  syncSessionControls();
}

function extractSessionEnvelope(payload) {
  if (!payload) return null;

  const envelope = payload.activeSession ?? payload.resumeSession ?? payload.sessionState ?? payload;
  const session = envelope?.session ?? payload.session ?? null;

  if (!session?.id) {
    return null;
  }

  return {
    session,
    timing: envelope.timing ?? payload.timing ?? null,
    currentItem: envelope.currentItem ?? payload.currentItem ?? null,
    sessionProgress: envelope.sessionProgress ?? payload.sessionProgress ?? null,
    timedSummary: envelope.timedSummary ?? payload.timedSummary ?? null,
    moduleSummary: envelope.moduleSummary ?? payload.moduleSummary ?? null,
    noticeMessage: payload.resumeMessage ?? payload.conflictMessage ?? payload.message ?? payload.error ?? null,
    noticeTone: payload.conflictMessage || payload.reason === 'exam_session_in_progress' ? 'warning' : 'info',
  };
}

function applySessionEnvelope(envelope, { fallbackNotice = null, tone = null } = {}) {
  if (!envelope?.session?.id) {
    return false;
  }

  state.activeSessionEnvelope = envelope;
  state.currentSessionId = envelope.session.id;
  state.currentSessionType = envelope.session.type;
  state.currentSessionProgress = envelope.sessionProgress ?? null;

  if (envelope.timedSummary) {
    renderTimedSetSummary(envelope.timedSummary);
  }
  if (envelope.moduleSummary) {
    renderModuleSummary(envelope.moduleSummary);
  }

  renderItem(envelope.currentItem ?? null);

  if (envelope.sessionProgress) {
    renderSessionProgress(envelope.sessionProgress);
  } else {
    $('#diagnosticStatus').textContent = `${toDisplaySessionType(envelope.session.type)} restored.`;
  }

  renderSessionNotice(
    fallbackNotice ?? envelope.noticeMessage ?? `${toDisplaySessionType(envelope.session.type)} restored.`,
    tone ?? envelope.noticeTone ?? 'info',
  );
  syncSessionControls();
  startSessionTimer();
  return true;
}

async function loadActiveSession() {
  for (const path of ['/api/session/active', '/api/sessions/active']) {
    try {
      return await json(withLearnerContext(path));
    } catch (error) {
      if (error.status === 404) continue;
      throw error;
    }
  }
  return null;
}

function handleSessionConflict(error, fallbackMessage) {
  const envelope = extractSessionEnvelope(error?.payload);
  if (applySessionEnvelope(envelope, { fallbackNotice: fallbackMessage ?? error.message, tone: 'warning' })) {
    return true;
  }

  renderSessionNotice(fallbackMessage ?? error.message, 'warning');
  $('#diagnosticStatus').textContent = fallbackMessage ?? error.message;
  return false;
}

function renderSessionProgress(progress) {
  if (!progress) return;
  state.currentSessionProgress = progress;
  const activeSection = state.activeSessionEnvelope?.session?.section;
  const sectionSuffix = activeSection ? ` (${formatSectionName(activeSection)})` : '';
  const sessionLabel = toDisplaySessionType(state.currentSessionType) + sectionSuffix;
  const activeSummary = getCurrentExamSummary();
  if (progress.isComplete) {
    $('#diagnosticStatus').textContent = `${sessionLabel} complete: ${progress.answered}/${progress.total} items answered.`;
    $('#attemptForm').classList.add('hidden');
    return;
  }
  const countdown = getCurrentCountdownState();
  if (countdown?.expired) {
    $('#diagnosticStatus').textContent = `${sessionLabel} expired: ${progress.answered}/${progress.total} answered. Finish now to review results and preserve the summary.`;
    return;
  }
  const paceText = activeSummary?.recommendedPaceSec ?? activeSummary?.recommended_pace_sec;
  $('#diagnosticStatus').textContent = isExamSessionType(state.currentSessionType)
    ? `${sessionLabel} progress: ${progress.answered}/${progress.total} answered · ${countdown ? `${formatCountdown(countdown.remainingTimeSec)} remaining · ` : ''}target pace ${paceText ?? 70}s/item`
    : `${sessionLabel} progress: ${progress.answered}/${progress.total} answered.`;
}

async function loadReviewRecommendations() {
  const review = await json(withLearnerContext('/api/review/recommendations'));
  renderReview(review);
}

async function loadSessionReview(sessionId) {
  try {
    const review = await json(`/api/session/review?sessionId=${encodeURIComponent(sessionId)}`);
    renderSessionReview(review);
  } catch (error) {
    const container = $('#sessionReviewDetail');
    if (container) {
      clear(container);
      container.append(node('p', { className: 'muted', text: `Could not load review: ${error.message}` }));
    }
  }
}

function renderSessionReview(review) {
  const container = $('#sessionReviewDetail');
  if (!container) return;
  clear(container);
  const section = $('#sessionReviewSection');
  if (section) section.style.display = 'block';

  if (!review?.items?.length) {
    container.append(node('p', { className: 'muted', text: 'No item-level review data available.' }));
    return;
  }

  const session = review.session ?? {};
  const progress = review.sessionProgress ?? {};
  const sectionLabel = session.section ? formatSectionName(session.section) : null;
  const typeLabel = toDisplaySessionType(session.type);

  const header = node('div', { className: 'session-review-header' });
  header.append(node('h3', { text: `${typeLabel}${sectionLabel ? ` — ${sectionLabel}` : ''} Review` }));
  header.append(node('p', { className: 'muted', text: `${progress.answered ?? review.items.length}/${progress.total ?? review.items.length} answered · ${review.items.filter((i) => i.isCorrect).length} correct` }));
  container.append(header);

  const list = node('div', { className: 'stack' });
  for (const [index, item] of review.items.entries()) {
    const card = node('article', { className: `review-detail-item ${item.isCorrect ? 'correct' : item.isCorrect === false ? 'incorrect' : 'unanswered'}` });
    const statusIcon = item.isCorrect ? '\u2713' : item.isCorrect === false ? '\u2717' : '\u2014';
    card.append(node('strong', { text: `${statusIcon} Item ${index + 1}` }));

    const details = [];
    if (item.selectedAnswer) details.push(['Your answer', item.selectedAnswer]);
    if (item.correctAnswer) details.push(['Correct answer', item.correctAnswer]);
    if (item.itemFormat) details.push(['Format', item.itemFormat === 'grid_in' ? 'Student-produced response' : 'Multiple choice']);
    if (details.length) card.append(kvRows(details));

    if (!item.isCorrect && item.distractorTag) {
      card.append(node('p', { className: 'notice', text: `Misconception: ${item.distractorTag.replace(/_/g, ' ')}` }));
    }
    if (item.rationale) {
      card.append(node('p', { className: 'muted', text: item.rationale }));
    }
    list.append(card);
  }
  container.append(list);

  if (review.projection) {
    const proj = review.projection;
    container.append(node('p', { className: 'notice', text: `Projected score band: ${proj.predicted_total_low}\u2013${proj.predicted_total_high}` }));
  }
}

function showLogin() {
  const loginSection = document.getElementById('loginSection');
  const appSection = document.getElementById('appSection');
  if (loginSection) loginSection.style.display = 'block';
  if (appSection) appSection.style.display = 'none';
  const loginError = $('#loginError');
  const registerError = $('#registerError');
  if (loginError) loginError.textContent = '';
  if (registerError) registerError.textContent = '';
}

function showApp() {
  const loginSection = document.getElementById('loginSection');
  const appSection = document.getElementById('appSection');
  if (loginSection) loginSection.style.display = 'none';
  if (appSection) appSection.style.display = 'block';
}

function setLinkedLearners(linkedLearners = []) {
  state.linkedLearners = linkedLearners;
  state.selectedLearnerId = linkedLearners[0]?.id ?? null;
}

function handleLogout() {
  fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  }).catch(() => {});
  state.userRole = null;
  state.userId = null;
  state.linkedLearners = [];
  state.selectedLearnerId = null;
  state.goalProfile = null;
  state.nextBestAction = null;
  state.diagnosticReveal = null;
  showLogin();
}

async function bootstrapAuthenticatedApp() {
  const me = await json('/api/me');
  state.userRole = me.role;
  state.userId = me.id;
  setLinkedLearners(me.linkedLearners ?? []);
  const badge = document.getElementById('userRoleBadge');
  if (badge) badge.textContent = me.role;
  showApp();
  await loadDashboard();
}

async function handleLogin(email, password) {
  const loginError = $('#loginError');
  if (loginError) loginError.textContent = '';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    await bootstrapAuthenticatedApp();
  } catch (err) {
    if (loginError) loginError.textContent = err.message;
  }
}

async function handleRegister(name, email, password) {
  const registerError = $('#registerError');
  if (registerError) registerError.textContent = '';
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    await bootstrapAuthenticatedApp();
    focusGoalSetup();
  } catch (err) {
    if (registerError) registerError.textContent = err.message;
  }
}

async function initializeSession() {
  showApp();
  await loadDashboard();
  await loadReviewRecommendations();
}

async function loadDashboard() {
  try {
    const me = await json('/api/me');
    state.userRole = me.role;
    state.userId = me.id;
    setLinkedLearners(me.linkedLearners ?? []);

    if ((state.userRole === 'teacher' || state.userRole === 'parent') && !state.selectedLearnerId) {
      throw new Error('No linked learner available for this account.');
    }

    const [dashboard, sessionHistory, parentSummary, teacherBrief, teacherAssignments, activeSession, goalProfile, nextBestAction, diagnosticReveal] = await Promise.all([
      json(withLearnerContext('/api/dashboard/learner')),
      json(withLearnerContext('/api/sessions/history')).catch(() => null),
      state.userRole === 'parent' ? json(withLearnerContext('/api/parent/summary')).catch(() => null) : Promise.resolve(null),
      state.userRole === 'teacher' ? json(withLearnerContext('/api/teacher/brief')).catch(() => null) : Promise.resolve(null),
      state.userRole === 'teacher' ? json(withLearnerContext('/api/teacher/assignments')).catch(() => null) : Promise.resolve(null),
      (state.userRole === 'student' || state.userRole === 'admin'
        ? loadActiveSession().catch((error) => (error.status === 404 ? null : Promise.reject(error)))
        : Promise.resolve(null)),
      (state.userRole === 'student' || state.userRole === 'admin'
        ? json('/api/goal-profile').catch((error) => ([400, 404].includes(error.status) ? null : Promise.reject(error)))
        : Promise.resolve(null)),
      (state.userRole === 'student' || state.userRole === 'admin'
        ? json('/api/next-best-action').catch((error) => ([400, 404].includes(error.status) ? null : Promise.reject(error)))
        : Promise.resolve(null)),
      (state.userRole === 'student' || state.userRole === 'admin'
        ? json('/api/diagnostic/reveal').catch((error) => ([400, 404].includes(error.status) ? null : Promise.reject(error)))
        : Promise.resolve(null)),
    ]);

    renderGoalProfile(goalProfile);
    renderNextBestAction(nextBestAction);
    renderDiagnosticReveal(diagnosticReveal);
    renderProfile(dashboard.profile);
    renderProjection(dashboard.projection);
    renderPlan(dashboard.plan);
    renderErrorDna(dashboard.errorDna);
    renderReview(dashboard.review);
    renderSessionHistory(sessionHistory);
    renderTimedSetSummary(dashboard.latestTimedSetSummary);
    renderModuleSummary(dashboard.latestModuleSummary);
    renderParentSummary(parentSummary);
    renderTeacherBrief(teacherBrief);
    renderTeacherAssignments(teacherAssignments);
    if (!applySessionEnvelope(extractSessionEnvelope(activeSession))) {
      state.activeSessionEnvelope = null;
      state.currentSessionType = null;
      state.currentSessionId = null;
      state.currentSessionProgress = null;
      clearSessionNotice();
      clearSessionTimer();
      renderItem(null);
      $('#diagnosticStatus').textContent = dashboard.profile.lastSessionSummary || 'No active diagnostic session.';
    }
    syncSessionControls();
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
      body: JSON.stringify({}),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    state.currentSessionProgress = result.sessionProgress ?? null;
    clearSessionNotice();
    renderDiagnosticReveal(null);
    state.activeSessionEnvelope = { session: result.session, sessionProgress: result.sessionProgress ?? null };
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
      body: JSON.stringify({}),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    state.currentSessionProgress = result.sessionProgress ?? null;
    clearSessionNotice();
    renderDiagnosticReveal(null);
    state.activeSessionEnvelope = {
      session: result.session,
      timing: result.timing ?? result.pacing ?? null,
      sessionProgress: result.sessionProgress ?? null,
      currentItem: result.currentItem ?? null,
    };
    renderTimedSetSummary({
      sessionType: result.session.type,
      startedAt: result.session.started_at ?? result.session.startedAt,
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
    handleSessionConflict(error, 'Finish or resume the current exam session before starting another timed set.');
  }
});

$('#startModule').addEventListener('click', async () => {
  try {
    const section = $('#moduleSection')?.value ?? 'reading_writing';
    const result = await json('/api/module/start', {
      method: 'POST',
      body: JSON.stringify({ section }),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    state.currentSessionProgress = result.sessionProgress ?? null;
    clearSessionNotice();
    renderDiagnosticReveal(null);
    state.activeSessionEnvelope = {
      session: result.session,
      timing: result.timing ?? result.pacing ?? null,
      sessionProgress: result.sessionProgress ?? null,
      currentItem: result.currentItem ?? null,
    };
    renderModuleSummary({
      sessionType: result.session.type,
      startedAt: result.session.started_at ?? result.session.startedAt,
      examMode: result.moduleSummary?.examMode ?? result.moduleSummary?.exam_mode ?? result.pacing?.exam_mode ?? true,
      answered: result.sessionProgress?.answered ?? 0,
      total: result.sessionProgress?.total ?? result.items?.length ?? 0,
      accuracy: null,
      correct: 0,
      section: result.moduleSummary?.section ?? result.moduleBlueprint?.section ?? result.session.section,
      focusDomain: result.moduleSummary?.focusDomain ?? result.moduleSummary?.focus_domain ?? result.moduleBlueprint?.focusDomain,
      timeLimitSec: result.moduleSummary?.timeLimitSec ?? result.moduleSummary?.time_limit_sec ?? result.pacing?.time_limit_sec ?? result.session.time_limit_sec,
      recommendedPaceSec: result.moduleSummary?.recommendedPaceSec ?? result.moduleSummary?.recommended_pace_sec ?? result.pacing?.recommended_pace_sec ?? result.session.recommended_pace_sec,
      remainingTimeSec: result.moduleSummary?.remainingTimeSec ?? result.moduleSummary?.remaining_time_sec ?? result.pacing?.time_limit_sec ?? result.session.time_limit_sec,
      paceStatus: result.moduleSummary?.paceStatus ?? result.moduleSummary?.pace_status ?? 'not_started',
      sectionBreakdown: result.moduleSummary?.sectionBreakdown ?? result.moduleSummary?.section_breakdown ?? result.moduleBlueprint?.sectionBreakdown,
      domainBreakdown: result.moduleSummary?.domainBreakdown ?? result.moduleSummary?.domain_breakdown ?? result.moduleBlueprint?.domainBreakdown ?? result.breakdown,
      readinessIndicator: result.moduleSummary?.readinessIndicator ?? result.moduleSummary?.readiness_indicator ?? result.moduleSummary?.readinessSignal ?? result.moduleSummary?.readiness_signal ?? result.readinessIndicator ?? 'Module started',
      nextAction: result.moduleSummary?.nextAction ?? result.moduleSummary?.next_action ?? 'Complete the module in exam mode, then finish to review your pacing and breakdown.',
    });
    renderItem(result.currentItem);
    renderSessionProgress(result.sessionProgress);
  } catch (error) {
    handleSessionConflict(error, 'Finish or resume the current exam session before starting another module simulation.');
  }
});

$('#attemptForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.currentItem) {
    $('#attemptResult').textContent = 'Load an item first.';
    return;
  }

  const payload = {
    itemId: state.currentItem.itemId,
    sessionId: state.currentSessionId,
    confidenceLevel: Number($('#confidenceLevel').value),
    mode: $('#modeSelect').value,
    responseTimeMs: Date.now() - (state.itemRenderedAt || Date.now()),
  };

  if (isStudentProducedResponseItem(state.currentItem)) {
    const freeResponse = document.querySelector('input[name="freeResponse"]')?.value?.trim() ?? '';
    if (!freeResponse) {
      $('#attemptResult').textContent = 'Enter your response first.';
      return;
    }
    payload.freeResponse = freeResponse;
  } else {
    const selected = document.querySelector('input[name="selectedAnswer"]:checked');
    if (!selected) {
      $('#attemptResult').textContent = 'Select an answer first.';
      return;
    }
    payload.selectedAnswer = selected.value;
  }

  try {
    const result = await json('/api/attempt/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (result.correctAnswer !== undefined) {
      $('#attemptResult').textContent = JSON.stringify(result, null, 2);
    } else {
      $('#attemptResult').textContent = `Answer recorded (${result.attemptId}). Review unlocks after the session ends.`;
    }
    state.currentSessionType = result.sessionType ?? state.currentSessionType;
    state.currentSessionProgress = result.sessionProgress ?? state.currentSessionProgress;
    if (result.projection) renderProjection(result.projection);
    if (result.plan) renderPlan(result.plan);
    if (result.errorDna) renderErrorDna(result.errorDna);
    if (result.diagnosticReveal) {
      renderDiagnosticReveal(result.diagnosticReveal);
      renderNextBestAction(result.diagnosticReveal.firstRecommendedAction ?? null);
    }
    if (result.review) renderReview(result.review);
    if (result.summary?.kind === 'timed_set' && result.summary.payload) {
      renderTimedSetSummary(result.summary.payload);
    }
    if (result.summary?.kind === 'module_simulation' && result.summary.payload) {
      renderModuleSummary(result.summary.payload);
    }
    renderSessionProgress(result.sessionProgress);

    if (result.correctAnswer === undefined) {
      const activeSession = await loadActiveSession();
      const envelope = extractSessionEnvelope(activeSession);
      applySessionEnvelope(envelope, { fallbackNotice: 'Answer recorded. Continue the session.' });
    } else {
      state.activeSessionEnvelope = state.currentSessionId
        ? {
            ...(state.activeSessionEnvelope ?? {}),
            session: {
              ...(state.activeSessionEnvelope?.session ?? {}),
              id: state.currentSessionId,
              type: state.currentSessionType,
            },
            sessionProgress: result.sessionProgress ?? state.activeSessionEnvelope?.sessionProgress ?? null,
            currentItem: result.nextItem ?? null,
            timedSummary: result.timedSummary ?? state.activeSessionEnvelope?.timedSummary ?? null,
            moduleSummary: result.moduleSummary ?? state.activeSessionEnvelope?.moduleSummary ?? null,
          }
        : null;
      if (result.nextItem) {
        renderItem(result.nextItem);
      } else {
        if (isExamSessionType(state.currentSessionType)) {
          state.currentItem = null;
          state.sessionCompleted = true;
          renderSessionNotice('Session complete — click Finish to review results.', 'info');
        }
        renderItem(null);
      }
    }
  } catch (error) {
    if (error?.payload?.reason === 'exam_session_expired') {
      const envelope = extractSessionEnvelope(error.payload.session);
      applySessionEnvelope(envelope, { fallbackNotice: 'Time expired. Finish the session to review results.', tone: 'warning' });
      if (error.payload.timedSummary) renderTimedSetSummary(error.payload.timedSummary);
      if (error.payload.moduleSummary) renderModuleSummary(error.payload.moduleSummary);
    }
    $('#attemptResult').textContent = error.message;
  }
});

$('#finishModule').addEventListener('click', async () => {
  if (!state.currentSessionId || state.currentSessionType !== 'module_simulation') return;

  try {
    const result = await json('/api/module/finish', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.currentSessionId,
      }),
    });
    renderModuleSummary(result.moduleSummary ?? result);
    renderSessionProgress(result.sessionProgress);
    $('#attemptResult').textContent = JSON.stringify(result, null, 2);
    state.currentItem = null;
    state.currentSessionId = null;
    state.currentSessionType = null;
    state.currentSessionProgress = null;
    state.activeSessionEnvelope = null;
    clearSessionTimer();
    clearSessionNotice();
    renderItem(null);
    await loadDashboard();
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
    state.currentSessionProgress = null;
    state.activeSessionEnvelope = null;
    clearSessionTimer();
    clearSessionNotice();
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
        learnerId: state.selectedLearnerId,
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

$('#goalSetupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const targetScore = Number($('#goalTargetScore').value);
  const targetTestDate = $('#goalTargetDate').value;
  const dailyMinutes = Number($('#goalDailyMinutes').value);
  const selfReportedWeakArea = $('#goalWeakArea').value.trim();

  if (!targetTestDate) {
    $('#goalSetupResult').textContent = 'Choose your test date before saving.';
    return;
  }

  try {
    const result = await json('/api/goal-profile', {
      method: 'POST',
      body: JSON.stringify({
        targetScore,
        targetTestDate,
        dailyMinutes,
        selfReportedWeakArea: selfReportedWeakArea || undefined,
      }),
    });
    renderGoalProfile(result);
    $('#goalSetupResult').textContent = 'Goal profile saved. Helix just updated your next best move.';
    await loadDashboard();
  } catch (error) {
    $('#goalSetupResult').textContent = error.message;
  }
});

document.getElementById('loginButton').addEventListener('click', () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  handleLogin(email, password);
});

document.getElementById('registerButton').addEventListener('click', () => {
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  handleRegister(name, email, password);
});

document.getElementById('loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('loginButton').click();
});

document.getElementById('registerPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('registerButton').click();
});

document.getElementById('logoutButton').addEventListener('click', handleLogout);

json('/api/me')
  .then((me) => {
    state.userRole = me.role;
    state.userId = me.id;
    setLinkedLearners(me.linkedLearners ?? []);
    if (me.role === 'student') {
      state.selectedLearnerId = me.id;
    }
    const badge = document.getElementById('userRoleBadge');
    if (badge) badge.textContent = me.role;
    showApp();
    return loadDashboard().then(loadReviewRecommendations);
  })
  .catch((error) => {
    if (error.status !== 401) {
      $('#diagnosticStatus').textContent = error.message;
    }
    showLogin();
  });
