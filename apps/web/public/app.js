import { normalizeTeacherAssignments, normalizeTeacherBrief } from './teacher-view-model.js';

const state = {
  userId: null,
  userRole: null,
  linkedLearners: [],
  selectedLearnerId: null,
  goalProfile: null,
  nextBestAction: null,
  diagnosticReveal: null,
  dashboardExpanded: false,
  showDiagnosticPreflight: false,
  dismissDiagnosticPreflight: false,
  currentItem: null,
  currentSessionId: null,
  currentSessionType: null,
  currentSessionProgress: null,
  reflectionPrompt: '',
  latestQuickWinSummary: null,
  latestTimedSetSummary: null,
  latestModuleSummary: null,
  activeSessionEnvelope: null,
  sessionTimerHandle: null,
};

const $ = (selector) => document.querySelector(selector);

function isStudentSurface() {
  return state.userRole === 'student' || state.userRole === 'admin';
}

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
    state.latestQuickWinSummary = null;
    state.showDiagnosticPreflight = false;
    state.dismissDiagnosticPreflight = false;
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

function detailsBlock(summaryText, children = [], open = false) {
  const details = node('details');
  details.open = open;
  details.append(node('summary', { text: summaryText }));
  for (const child of children) {
    if (child) details.append(child);
  }
  return details;
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
  if (value === 'quick_win') return 'Quick win';
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

function renderProjection(projection, evidence = null) {
  const container = $('#projection');
  clear(container);
  const source = evidence?.band ? {
    predicted_total_low: evidence.band.low,
    predicted_total_high: evidence.band.high,
    rw_low: evidence.band.rwLow,
    rw_high: evidence.band.rwHigh,
    math_low: evidence.band.mathLow,
    math_high: evidence.band.mathHigh,
    readiness_indicator: evidence.readiness,
    confidence: evidence.confidence,
    momentum_score: evidence.momentum,
  } : projection;
  container.append(
    kvRows([
      ['Score range', `${source.predicted_total_low} - ${source.predicted_total_high}`],
      ['Reading & Writing', `${source.rw_low} - ${source.rw_high}`],
      ['Math', `${source.math_low} - ${source.math_high}`],
      ['Ready now', source.readiness_indicator],
      ['Certainty', `${Math.round(source.confidence * 100)}%`],
      ['Trend', `${Math.round((source.momentum_score ?? 0) * 100)}%`],
    ]),
  );
  const reasons = evidence?.whyChanged ?? [];
  if (reasons.length) {
    const list = node('ul', { className: 'list compact' });
    for (const reason of reasons) {
      list.append(node('li', { text: reason }));
    }
    container.append(node('p', { className: 'muted', text: 'Why this range' }));
    container.append(list);
  }
}

function renderPlan(plan) {
  const container = $('#plan');
  clear(container);
  const blocks = Array.isArray(plan?.blocks) ? plan.blocks : [];
  const fallbackTrigger = plan?.fallback_plan?.trigger ?? plan?.fallbackPlan?.trigger ?? null;
  const stopCondition = plan?.stop_condition ?? plan?.stopCondition ?? null;

  container.append(node('p', { text: plan?.rationale_summary ?? plan?.rationaleSummary ?? 'Your plan stays short because Helix is starting with the fastest score gain.' }));

  const list = node('ul', { className: 'list' });
  for (const block of blocks) {
    const item = node('li');
    item.append(node('strong', { text: `${block.block_type} — ${block.minutes} min` }));
    item.append(document.createElement('br'));
    item.append(document.createTextNode(block.objective));
    item.append(document.createElement('br'));
    item.append(node('span', { className: 'muted', text: `Expected benefit: ${block.expected_benefit}` }));
    list.append(item);
  }
  if (blocks.length) {
    container.append(list);
  } else {
    container.append(node('p', { className: 'muted', text: 'Complete a diagnostic block so Helix can build your first detailed plan.' }));
  }
  if (fallbackTrigger) {
    container.append(node('p', { className: 'muted', text: `Why this fallback: ${fallbackTrigger}` }));
  }
  if (stopCondition) {
    container.append(node('p', { className: 'muted', text: `When to stop: ${stopCondition}` }));
  }
}

function renderPlanExplanation(explanation) {
  const container = $('#planExplanation');
  clear(container);
  const rawReasons = Array.isArray(explanation?.reasons) ? explanation.reasons : [];
  const reasons = rawReasons.filter((reason) => reason?.title || reason?.reason);
  const hasContent = Boolean(explanation?.headline || explanation?.topTrap?.label || reasons.length);
  if (!hasContent) {
    container.append(node('p', { className: 'muted', text: 'Plan explanation unavailable.' }));
    return;
  }

  if (explanation.headline) {
    container.append(node('p', { text: explanation.headline }));
  }
  if (explanation.topTrap?.label) {
    container.append(node('p', { className: 'notice', text: `Biggest repeat mistake: ${explanation.topTrap.label}` }));
  }
  const list = node('ul', { className: 'list compact' });
  for (const reason of reasons) {
    list.append(node('li', { text: `${reason.title}: ${reason.reason}` }));
  }
  if (reasons.length) {
    container.append(list);
  }
}

function renderCurriculumPath(path) {
  const container = $('#curriculumPath');
  if (!container) return;
  clear(container);

  if (!path?.anchorSkill) {
    container.append(node('p', { className: 'muted', text: 'Complete a diagnostic to unlock your first weekly map.' }));
    return;
  }

  container.append(node('p', {
    className: 'notice',
    text: `Main focus: ${path.anchorSkill?.label ?? '—'} · backup focus: ${path.supportSkill?.label ?? '—'} · keep warm: ${path.maintenanceSkill?.label ?? '—'}`,
  }));

  if (Array.isArray(path.dailyFocuses) && path.dailyFocuses.length) {
    container.append(node('p', { className: 'muted', text: 'Today, tomorrow, then this week' }));
    const quickList = node('ul', { className: 'list compact' });
    for (const focus of path.dailyFocuses.slice(0, 3)) {
      quickList.append(node('li', { text: `${focus.date}: ${focus.label} — ${focus.objective}` }));
    }
    container.append(quickList);
  }

  const highlights = node('div', { className: 'grid two compact-grid' });
  const cards = [
    ['Main focus', path.anchorSkill],
    ['Backup focus', path.supportSkill],
    ['Keep warm', path.maintenanceSkill],
  ];

  for (const [title, skill] of cards) {
    const card = node('article', { className: 'review-item' });
    card.append(node('strong', { text: title }));
    if (!skill) {
      card.append(node('p', { className: 'muted', text: 'Not set yet.' }));
    } else {
      card.append(node('p', { text: `${skill.label} · ${skill.stage.replaceAll('_', ' ')}` }));
      card.append(node('p', { className: 'muted', text: skill.objectives?.[0] ?? 'No objective yet.' }));
      card.append(node('span', { className: 'muted', text: `Mastery ${Math.round((skill.mastery ?? 0) * 100)}% · timed ${Math.round((skill.timedMastery ?? 0) * 100)}%` }));
    }
    highlights.append(card);
  }
  const detailChildren = [highlights];

  if (path.nextUnlock) {
    detailChildren.push(node('p', { className: 'notice', text: `Next unlock: ${path.nextUnlock.label} — ${path.nextUnlock.reason}` }));
  }

  if (path.recoveryPath) {
    const recovery = node('div', { className: 'stack' });
    recovery.append(node('p', { className: 'muted', text: 'If you slip' }));
    recovery.append(node('p', { text: path.recoveryPath.trigger }));
    recovery.append(node('p', { className: 'muted', text: path.recoveryPath.adjustment }));
    detailChildren.push(recovery);
  }

  if (Array.isArray(path.revisitCadence) && path.revisitCadence.length) {
    detailChildren.push(node('p', { className: 'muted', text: 'Come back to this' }));
    const revisitList = node('ul', { className: 'list compact' });
    for (const revisit of path.revisitCadence.slice(0, 4)) {
      revisitList.append(node('li', { text: `${revisit.label} in ${revisit.dueInDays} day${revisit.dueInDays === 1 ? '' : 's'} — ${revisit.reason}` }));
    }
    detailChildren.push(revisitList);
  }

  container.append(detailsBlock('See the full week plan', detailChildren));
}

function renderProgramPath(programPath) {
  const container = $('#programPath');
  if (!container) return;
  clear(container);

  if (!programPath) {
    container.append(node('p', { className: 'muted', text: 'Program path unavailable.' }));
    return;
  }

  container.append(node('p', {
    className: 'notice',
    text: `This month: ${programPath.sessionsPerWeek} core session${programPath.sessionsPerWeek === 1 ? '' : 's'}/week · current ${programPath.currentBand.low}–${programPath.currentBand.high} · target ${programPath.targetScore} by ${programPath.targetDate}`,
  }));

  const phaseList = node('div', { className: 'stack' });
  for (const phase of programPath.phases.slice(0, 4)) {
    const card = node('article', { className: 'review-item' });
    const activeLabel = phase.key === programPath.activePhaseKey ? ' (active now)' : '';
    card.append(node('strong', { text: `${phase.title}${activeLabel}` }));
    card.append(node('p', { className: 'muted', text: `${phase.startsOn} → ${phase.endsOn} · ${phase.weeks} week${phase.weeks === 1 ? '' : 's'}` }));
    card.append(node('p', { text: phase.objective }));
    card.append(node('p', { className: 'muted', text: `Focus: ${phase.focus}` }));
    card.append(node('p', { className: 'muted', text: `Progress: ${phase.completedSessions}/${phase.expectedSessions} core sessions · ${Math.round((phase.progress ?? 0) * 100)}% · ${phase.status}` }));
    card.append(node('p', { className: 'muted', text: `Exit signal: ${phase.exitCriteria}` }));
    phaseList.append(card);
  }
  const detailChildren = [phaseList];

  if (Array.isArray(programPath.roadmapBlocks) && programPath.roadmapBlocks.length) {
    detailChildren.push(node('p', { className: 'muted', text: 'Longer runway' }));
    const roadmapList = node('ul', { className: 'list compact' });
    for (const block of programPath.roadmapBlocks.slice(0, 6)) {
      roadmapList.append(node('li', {
        text: `${block.title} (${block.startsOn} → ${block.endsOn}) — ${block.focus} · ${block.status} · ${block.successSignal}`,
      }));
    }
    detailChildren.push(roadmapList);
  }

  if (Array.isArray(programPath.milestones) && programPath.milestones.length) {
    detailChildren.push(node('p', { className: 'muted', text: 'Milestones' }));
    const milestoneList = node('ul', { className: 'list compact' });
    for (const milestone of programPath.milestones) {
      milestoneList.append(node('li', { text: `${milestone.dueOn}: ${milestone.title} — ${milestone.successSignal}` }));
    }
    detailChildren.push(milestoneList);
  }

  container.append(detailsBlock('See the full month plan', detailChildren));
}

function focusGoalSetup() {
  const section = $('#goalSetupSection');
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#goalTargetScore')?.focus();
}

function getDiagnosticPreflightPlan() {
  const weakArea = state.goalProfile?.selfReportedWeakArea?.trim();
  const targetScore = state.goalProfile?.targetScore;
  const dailyMinutes = state.goalProfile?.dailyMinutes;
  const targetDate = state.goalProfile?.targetTestDate;
  const bullets = [
    'Takes about 10–12 minutes across Reading & Writing and Math.',
    'Helix is checking whether your first score gains should come from concept repair, pacing, or recurring trap cleanup.',
    'You finish with a score band, confidence read, top score leaks, and one first repair block.',
  ];
  if (weakArea) {
    bullets.splice(2, 0, `Your self-reported weak spot (“${weakArea}”) is used as a light tie-breaker, not as the whole diagnosis.`);
  }
  return {
    title: '13 questions to build your first score-moving plan',
    promise: targetScore
      ? `Helix is trying to find the fastest route from your current baseline to ${targetScore}.`
      : 'Helix is trying to find the fastest route from your current baseline to your target.',
    meta: [
      targetDate ? `Test date ${targetDate}` : null,
      dailyMinutes ? `${dailyMinutes} min/day plan` : null,
    ].filter(Boolean),
    bullets,
  };
}

function renderDiagnosticPreflight() {
  const section = $('#diagnosticPreflightSection');
  const container = $('#diagnosticPreflight');
  if (!section || !container) return;

  const shouldShow = isStudentSurface()
    && state.goalProfile?.isComplete
    && !state.currentSessionId
    && !state.dismissDiagnosticPreflight
    && (state.showDiagnosticPreflight || state.nextBestAction?.kind === 'start_diagnostic');

  if (!shouldShow) {
    section.style.display = 'none';
    clear(container);
    return;
  }

  const plan = getDiagnosticPreflightPlan();
  section.style.display = 'block';
  clear(container);
  container.append(node('p', { className: 'notice', text: plan.title }));
  container.append(node('p', { text: 'Helix is finding the fastest route to your first score gain. You’ll finish with one clear next move.' }));
  container.append(node('p', { className: 'muted', text: plan.promise }));
  if (plan.meta.length) {
    container.append(node('p', { className: 'muted', text: plan.meta.join(' · ') }));
  }
  const list = node('ul', { className: 'list compact' });
  for (const bullet of plan.bullets) {
    list.append(node('li', { text: bullet }));
  }
  container.append(list);
}

function openDiagnosticPreflight() {
  state.dismissDiagnosticPreflight = false;
  state.showDiagnosticPreflight = true;
  renderDiagnosticPreflight();
  $('#diagnosticPreflightSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#startDiagnosticFromPreflight')?.focus();
}

function dismissDiagnosticPreflight() {
  state.dismissDiagnosticPreflight = true;
  state.showDiagnosticPreflight = false;
  renderDiagnosticPreflight();
}

function getDiagnosticProgressNarrative(progress) {
  const answered = progress?.answered ?? 0;
  const total = progress?.total ?? 13;
  if (answered <= 1) {
    return 'Helix is sampling both sections to find your real starting band.';
  }
  if (answered <= Math.floor(total * 0.35)) {
    return 'Helix is reading whether evidence, grammar, or algebra setup leaks your first points.';
  }
  if (answered <= Math.floor(total * 0.7)) {
    return 'Helix is separating foundation gaps from pressure mistakes so your first plan is actually worth doing.';
  }
  return 'Helix is locking your confidence band, top score leaks, and the first session that should move your score fastest.';
}

function syncManualStartControls(action = state.nextBestAction) {
  const controls = $('#manualStartControls');
  if (!controls) return;
  if (!isStudentSurface()) {
    controls.style.display = 'none';
    return;
  }

  const shouldHideForFocus = Boolean(action);
  controls.style.display = shouldHideForFocus ? 'none' : 'flex';
}

function syncDashboardDetails() {
  const detailSections = [...document.querySelectorAll('[data-student-dashboard-detail]')];
  const toggleSection = $('#dashboardToggleSection');
  const toggleButton = $('#toggleDashboardDetails');
  const toggleCopy = $('#dashboardToggleCopy');
  const supportViewSection = $('#supportViewSection');
  const teacherAssignmentsSection = $('#teacherAssignmentsSection');
  const isLearner = isStudentSurface();

  for (const section of detailSections) {
    section.style.display = !isLearner || state.dashboardExpanded ? '' : 'none';
  }

  if (toggleSection) {
    toggleSection.style.display = isLearner && state.goalProfile?.isComplete && !state.currentSessionId ? 'block' : 'none';
  }
  if (toggleButton) {
    toggleButton.textContent = state.dashboardExpanded ? 'Hide full study dashboard' : 'Show full study dashboard';
  }
  if (toggleCopy) {
    toggleCopy.textContent = state.dashboardExpanded
      ? 'You are seeing the full dashboard. Hide it again when you want one clear next move.'
      : 'Keep one clear next move on top. Open the full study dashboard only when you want more detail.';
  }

  if (supportViewSection) {
    supportViewSection.style.display = state.userRole === 'teacher' || state.userRole === 'parent' ? '' : 'none';
  }
  if (teacherAssignmentsSection) {
    teacherAssignmentsSection.style.display = state.userRole === 'teacher' ? '' : 'none';
  }
}

function studentActionCopy(action) {
  if (!action) return null;

  const title = action.title ?? 'Your next move';
  const reason = action.reason ?? 'Helix picked one next step to keep your progress moving.';
  const ctaLabel = action.ctaLabel ?? 'Start';

  switch (action.kind) {
    case 'complete_goal_setup':
      return {
        title: 'Set your target first',
        reason: 'Pick your score goal, test date, and daily time so Helix can build the right first step.',
        ctaLabel: 'Set my goal',
      };
    case 'start_diagnostic':
      return {
        title: 'Find your starting point',
        reason: 'Take one short 12-minute check so Helix can stop being generic and show your first real score-moving step.',
        ctaLabel: 'Start your 12-minute check',
      };
    case 'start_quick_win':
      return {
        title,
        reason,
        ctaLabel: action.ctaLabel ?? 'Take the 2-minute win',
      };
    case 'resume_active_session':
      return {
        title: 'Finish what you started',
        reason,
        ctaLabel: 'Resume this session',
      };
    case 'start_retry_loop':
      return {
        title,
        reason,
        ctaLabel: action.ctaLabel ?? 'Fix this now',
      };
    case 'start_timed_set':
      return {
        title,
        reason,
        ctaLabel: action.ctaLabel ?? 'Start timed practice',
      };
    case 'start_module':
      return {
        title,
        reason,
        ctaLabel: action.ctaLabel ?? 'Start practice block',
      };
    case 'review_mistakes':
      return {
        title,
        reason,
        ctaLabel: 'Open my fixes',
      };
    default:
      return { title, reason, ctaLabel };
  }
}

function buildAlternativeActions(action) {
  if (!action || !isStudentSurface() || !state.goalProfile?.isComplete) {
    return [];
  }

  if (['complete_goal_setup', 'start_diagnostic', 'start_quick_win', 'resume_active_session'].includes(action.kind)) {
    return [];
  }

  const actions = [];
  if (action.kind !== 'start_retry_loop') {
    actions.push({
      label: 'Repair loop',
      handler: () => startRetryLoop(),
    });
  }
  if (action.kind !== 'start_timed_set') {
    actions.push({
      label: 'Timed set',
      handler: () => startTimedSetSession(),
    });
  }
  if (!(action.kind === 'start_module' && action.section === 'reading_writing')) {
    actions.push({
      label: 'RW module',
      handler: () => startModuleSession('reading_writing'),
    });
  }
  if (!(action.kind === 'start_module' && action.section === 'math')) {
    actions.push({
      label: 'Math module',
      handler: () => startModuleSession('math'),
    });
  }
  return actions.slice(0, 3);
}

async function performNextBestAction(action) {
  if (!action) return;

  switch (action.kind) {
    case 'complete_goal_setup':
      focusGoalSetup();
      return;
    case 'start_diagnostic':
      openDiagnosticPreflight();
      return;
    case 'start_quick_win':
      await startQuickWinSession();
      return;
    case 'resume_active_session':
      $('#itemArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    case 'start_retry_loop':
      await startRetryLoop(action.itemId ?? null);
      return;
    case 'review_mistakes':
      $('#reviewRecommendations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    case 'start_timed_set':
      await startTimedSetSession();
      return;
    case 'start_module':
      if (action.section) $('#moduleSection').value = action.section;
      await startModuleSession(action.section ?? null);
      return;
    default:
      return;
  }
}

async function startRetryLoop(itemId = null) {
  try {
    const result = await json('/api/review/retry/start', {
      method: 'POST',
      body: JSON.stringify(itemId ? { itemId } : {}),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    state.currentSessionProgress = result.sessionProgress ?? null;
    state.activeSessionEnvelope = {
      session: result.session,
      sessionProgress: result.sessionProgress ?? null,
      currentItem: result.currentItem ?? null,
    };
    $('#modeSelect').value = 'review';
    clearSessionNotice();
    renderNextBestAction(null);
    renderItem(result.currentItem);
    renderSessionProgress(result.sessionProgress);
    $('#itemArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    $('#attemptResult').textContent = error.message;
  }
}

async function startQuickWinSession() {
  try {
    const result = await json('/api/quick-win/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    state.currentSessionProgress = result.sessionProgress ?? null;
    state.activeSessionEnvelope = {
      session: result.session,
      sessionProgress: result.sessionProgress ?? null,
      currentItem: result.currentItem ?? null,
    };
    $('#modeSelect').value = 'learn';
    clearSessionNotice();
    renderNextBestAction(null);
    renderItem(result.currentItem);
    renderSessionProgress(result.sessionProgress);
    $('#itemArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    $('#attemptResult').textContent = error.message;
  }
}

function renderGoalProfile(goalProfile) {
  state.goalProfile = goalProfile ?? null;
  const section = $('#goalSetupSection');
  const result = $('#goalSetupResult');
  if (!section) return;

  if (!isStudentSurface() || !goalProfile || goalProfile.isComplete) {
    section.style.display = 'none';
    if (result) {
      result.textContent = goalProfile?.isComplete
        ? 'Goal profile saved. Helix can now shape your plan around your score target and schedule.'
        : 'Finish your goal setup to unlock your first personalized plan.';
    }
    syncDashboardDetails();
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
  syncDashboardDetails();
}

function renderNextBestAction(action) {
  state.nextBestAction = action ?? null;
  if (action?.kind !== 'start_diagnostic') {
    state.dismissDiagnosticPreflight = false;
  }
  const section = $('#nextBestActionSection');
  const container = $('#nextBestAction');
  const alternatives = $('#nextBestActionAlternatives');
  const footnote = $('#nextBestActionFootnote');
  if (!section || !container) return;

  if (!isStudentSurface() || !action) {
    section.style.display = 'none';
    clear(container);
    clear(alternatives);
    if (footnote) footnote.textContent = '';
    syncManualStartControls(null);
    renderDiagnosticPreflight();
    syncDashboardDetails();
    return;
  }

  section.style.display = 'block';
  clear(container);
  clear(alternatives);
  const copy = studentActionCopy(action);
  container.append(node('h3', { text: copy.title }));
  container.append(node('p', { text: copy.reason }));
  const meta = [];
  if (action.estimatedMinutes) meta.push(`~${action.estimatedMinutes} min`);
  if (action.section) meta.push(formatSectionName(action.section));
  if (action.sessionType) meta.push(toDisplaySessionType(action.sessionType));
  if (meta.length) {
    container.append(node('p', { className: 'muted', text: meta.join(' · ') }));
  }
  const button = node('button', { text: copy.ctaLabel });
  button.addEventListener('click', () => performNextBestAction(action));
  container.append(button);

  const secondaryActions = buildAlternativeActions(action);
  if (secondaryActions.length) {
    const row = node('div', { className: 'row gap' });
    for (const secondaryAction of secondaryActions) {
      const secondaryButton = node('button', { className: 'secondary', text: secondaryAction.label });
      secondaryButton.addEventListener('click', secondaryAction.handler);
      row.append(secondaryButton);
    }
    alternatives.append(detailsBlock('More ways to work', [row]));
    if (footnote) {
      footnote.textContent = 'One main action at a time. Other options stay tucked away.';
    }
  } else if (footnote) {
    footnote.textContent = action.kind === 'complete_goal_setup'
      ? 'Finish goal setup first, then Helix will unlock the right first block automatically.'
      : action.kind === 'resume_active_session'
        ? 'Finish the open session first so your score signal stays clean.'
        : 'This is the only action Helix wants you to think about right now.';
  }

  syncManualStartControls(action);
  renderDiagnosticPreflight();
  syncDashboardDetails();
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
    text: `Score range now: ${reveal.scoreBand.low}–${reveal.scoreBand.high} · ${reveal.confidenceLabel ?? 'early read'} (${Math.round((reveal.confidence ?? 0) * 100)}%) · trend ${Math.round((reveal.momentum ?? 0) * 100)}%`,
  }));

  if (reveal.whyThisPlan) {
    container.append(node('p', { text: reveal.whyThisPlan }));
  }

  if (Array.isArray(reveal.evidenceBullets) && reveal.evidenceBullets.length) {
    const evidenceList = node('ul', { className: 'list compact' });
    for (const bullet of reveal.evidenceBullets) {
      evidenceList.append(node('li', { text: bullet }));
    }
    container.append(detailsBlock('Why Helix believes this', [evidenceList]));
  }

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
    const nextMove = studentActionCopy(reveal.firstRecommendedAction);
    const ctaWrap = node('div', { className: 'stack' });
    ctaWrap.append(node('strong', { text: 'Start here next' }));
    ctaWrap.append(node('p', { text: nextMove.reason }));
    const button = node('button', { text: nextMove.ctaLabel });
    button.addEventListener('click', () => performNextBestAction(reveal.firstRecommendedAction));
    ctaWrap.append(button);
    container.append(ctaWrap);
  }
}

function renderErrorDna(errorDnaSummary) {
  const container = $('#errorDna');
  clear(container);
  const entries = Array.isArray(errorDnaSummary)
    ? errorDnaSummary.filter((entry) => entry?.label || entry?.summary || entry?.score)
    : Object.entries(errorDnaSummary ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag, score]) => ({
          label: tag.replaceAll('_', ' '),
          summary: `${tag.replaceAll('_', ' ')} is still appearing in recent work.`,
          score,
        }));

  if (!entries.length) {
    container.append(node('p', { className: 'muted', text: 'No dominant error signals yet.' }));
    return;
  }

  for (const entry of entries) {
    const card = node('article', { className: 'review-item' });
    card.append(node('strong', { text: entry.label }));
    card.append(node('p', { text: entry.summary }));
    card.append(node('span', { className: 'muted', text: `Signal strength: ${entry.score}` }));
    container.append(card);
  }
}

function renderWhatChanged(summary) {
  const container = $('#whatChanged');
  clear(container);
  const rawBullets = Array.isArray(summary?.bullets) ? summary.bullets : [];
  const bullets = rawBullets.filter(Boolean);
  if (!summary?.headline && !bullets.length) {
    container.append(node('p', { className: 'muted', text: 'Change tracking will appear after your first completed session.' }));
    return;
  }
  if (summary.headline) {
    container.append(node('p', { text: summary.headline }));
  }
  const list = node('ul', { className: 'list compact' });
  for (const bullet of bullets) {
    list.append(node('li', { text: bullet }));
  }
  if (bullets.length) {
    container.append(list);
  }
}

function renderWeeklyDigest(digest) {
  const container = $('#weeklyDigest');
  clear(container);
  const strengths = (Array.isArray(digest?.strengths) ? digest.strengths : []).filter(Boolean);
  const risks = (Array.isArray(digest?.risks) ? digest.risks : []).filter(Boolean);
  const focus = (Array.isArray(digest?.recommended_focus) ? digest.recommended_focus : []).filter(Boolean);
  const hasContent = Boolean(digest?.period_start || digest?.period_end || strengths.length || risks.length || focus.length);
  if (!hasContent) {
    container.append(node('p', { className: 'muted', text: 'Weekly evidence will appear after Helix has a little more completed work to summarize.' }));
    return;
  }

  container.append(node('p', {
    className: 'notice',
    text: `${digest.period_start ?? 'This week'} → ${digest.period_end ?? 'in progress'} · momentum ${digest.projected_momentum ?? 'flat'}`,
  }));

  const sections = [
    ['Strengths', strengths],
    ['Risks', risks],
    ['Next focus', focus],
  ];

  for (const [label, rows] of sections) {
    container.append(node('p', { className: 'muted', text: label }));
    const list = node('ul', { className: 'list compact' });
    for (const row of rows ?? []) {
      list.append(node('li', { text: row }));
    }
    container.append(list);
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

function renderQuickWinSummary(summary) {
  const section = $('#quickWinSection');
  const container = $('#quickWinSummary');
  if (!container || !section) return;
  clear(container);

  const normalized = summary?.quickWinSummary ?? summary ?? null;
  state.latestQuickWinSummary = normalized;

  if (!isStudentSurface() || !normalized) {
    section.style.display = 'none';
    container.append(node('p', { className: 'muted', text: 'No quick-win result yet.' }));
    return;
  }

  section.style.display = 'block';

  const card = node('article', { className: 'timed-summary-item' });
  card.append(node('h3', { text: normalized.headline ?? 'Quick win' }));
  card.append(node('div', { className: 'session-status-row' }, [
    node('span', { className: 'pill success', text: `${normalized.correct ?? 0}/${normalized.total ?? 0} correct` }),
    node('span', { className: 'pill', text: normalized.focusSkill ? formatSkillLabel(normalized.focusSkill) : 'Quick win' }),
    node('span', { className: 'pill', text: normalized.completed ? 'Completed' : 'In progress' }),
  ]));
  card.append(kvRows([
    ['Accuracy', formatPercent(normalized.accuracy)],
    ['Answered', `${normalized.answered ?? 0}/${normalized.total ?? 0}`],
    ['Started', formatDateTime(normalized.startedAt)],
  ]));
  if (normalized.comebackPrompt) {
    card.append(node('p', { className: 'notice', text: normalized.comebackPrompt }));
  }
  if (normalized.nextAction) {
    card.append(node('p', { className: 'muted', text: `Next: ${normalized.nextAction}` }));
  }

  container.append(card);
}

function renderStudyModes(modes = []) {
  const section = $('#studyModesSection');
  const container = $('#studyModes');
  if (!section || !container) return;
  clear(container);

  if (!isStudentSurface() || !Array.isArray(modes) || !modes.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const grid = node('div', { className: 'grid three compact-grid' });

  for (const mode of modes) {
    const card = node('article', { className: 'review-item' });
    card.append(node('strong', { text: mode.label ?? 'Study mode' }));
    card.append(node('p', { className: 'muted', text: `${mode.minutes ?? '—'} min` }));
    card.append(node('p', { text: mode.summary ?? 'A prepared block is ready.' }));
    const copy = studentActionCopy(mode.action ?? null);
    if (copy?.reason) {
      card.append(node('p', { className: 'muted', text: copy.reason }));
    }
    if (mode.action) {
      const button = node('button', { className: 'secondary', text: copy?.ctaLabel ?? 'Start' });
      button.addEventListener('click', () => performNextBestAction(mode.action));
      card.append(button);
    }
    grid.append(card);
  }

  container.append(grid);
}

function renderReturnPath(preview, comebackState) {
  const section = $('#returnPathSection');
  const container = $('#returnPath');
  if (!section || !container) return;
  clear(container);

  const shouldShow = isStudentSurface() && (preview || comebackState?.isReturning);
  if (!shouldShow) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  if (comebackState?.isReturning) {
    container.append(node('p', { className: 'notice', text: comebackState.headline ?? 'Welcome back' }));
    if (comebackState.prompt) {
      container.append(node('p', { text: comebackState.prompt }));
    }
  }

  if (!preview) {
    container.append(node('p', { className: 'muted', text: 'Tomorrow’s first block appears here once Helix has enough evidence to line it up.' }));
    return;
  }

  container.append(node('h3', { text: preview.headline ?? 'Tomorrow’s first block' }));
  container.append(node('p', { text: preview.reason ?? 'Helix already prepared the next block.' }));
  if (preview.plannedMinutes) {
    container.append(node('p', { className: 'muted', text: `Planned time: ${preview.plannedMinutes} min` }));
  }
  const copy = studentActionCopy(preview.action ?? null);
  if (preview.action && copy) {
    const button = node('button', { className: 'secondary', text: copy.ctaLabel });
    button.addEventListener('click', () => performNextBestAction(preview.action));
    container.append(button);
  }
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
  const remediationCards = review.remediationCards ?? [];
  if (remediationCards.length) {
    const firstCard = remediationCards[0];
    const focusCard = node('article', { className: 'review-item' });
    focusCard.append(node('strong', { text: 'Do this first' }));
    focusCard.append(node('p', { text: `${firstCard.skill}: ${firstCard.misconception}` }));
    focusCard.append(node('p', { className: 'muted', text: firstCard.correctionRule }));
    const primaryRetryButton = node('button', { text: 'Try this again' });
    primaryRetryButton.addEventListener('click', async () => startRetryLoop(firstCard.retryAction?.itemId ?? firstCard.itemId));
    focusCard.append(primaryRetryButton);
    list.append(focusCard);
  }

  for (const cardData of remediationCards) {
    const card = node('article', { className: 'review-item' });
    card.append(node('strong', { text: `${formatSectionName(cardData.section)} · ${cardData.skill}` }));
    card.append(node('p', { text: `What went wrong: ${cardData.misconception}` }));
    card.append(node('p', { className: 'muted', text: `Fix rule: ${cardData.correctionRule}` }));
    card.append(node('p', {
      className: 'muted',
      text: `Confidence: ${cardData.confidenceBefore ?? '—'} -> ${cardData.confidenceAfter ?? '—'} · revisit ${cardData.nextScheduledRevisit ?? 'soon'}`,
    }));
    if (cardData.revisitStatus?.status) {
      card.append(node('p', {
        className: 'notice',
        text: `Loop status: ${cardData.revisitStatus.status.replaceAll('_', ' ')}${cardData.revisitStatus.dueAt ? ` · due ${cardData.revisitStatus.dueAt}` : ''}`,
      }));
    }
    const retryButton = node('button', {
      text: 'Try this again',
    });
    retryButton.addEventListener('click', async () => startRetryLoop(cardData.retryAction?.itemId ?? cardData.itemId));
    card.append(retryButton);
    const detailChildren = [node('p', { className: 'muted', text: `What to notice: ${cardData.decisiveClue}` })];
    if (cardData.teachCard) {
      detailChildren.push(node('p', { className: 'notice', text: `${cardData.teachCard.title}: ${cardData.teachCard.summary}` }));
      if (Array.isArray(cardData.teachCard.objectives) && cardData.teachCard.objectives.length) {
        const objectiveList = node('ul', { className: 'list compact' });
        for (const objective of cardData.teachCard.objectives.slice(0, 2)) {
          objectiveList.append(node('li', { text: objective }));
        }
        detailChildren.push(objectiveList);
      }
    }
    if (cardData.workedExample?.prompt) {
      detailChildren.push(node('p', { className: 'review-rationale', text: `See one example: ${cardData.workedExample.prompt}` }));
      if (Array.isArray(cardData.workedExample.walkthrough) && cardData.workedExample.walkthrough.length) {
        const walkthrough = node('ol', { className: 'list compact' });
        for (const step of cardData.workedExample.walkthrough.slice(0, 3)) {
          walkthrough.append(node('li', { text: step }));
        }
        detailChildren.push(walkthrough);
      }
    }
    if (cardData.retryItem?.prompt) {
      detailChildren.push(node('p', { className: 'review-rationale', text: `Try again: ${cardData.retryItem.prompt}` }));
    }
    if (cardData.transferItem?.prompt) {
      detailChildren.push(node('p', { className: 'muted', text: `Try a close variant: ${cardData.transferItem.prompt}` }));
    }
    if (cardData.transferAction?.itemId) {
      const transferButton = node('button', {
        className: 'secondary',
        text: 'Try a close variant',
      });
      transferButton.addEventListener('click', async () => startRetryLoop(cardData.transferAction.itemId));
      detailChildren.push(transferButton);
    }
    card.append(detailsBlock('See the fix', detailChildren));
    list.append(card);
  }

  if (!remediationCards.length) {
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
  }

  if (!remediationCards.length && !(review.recommendations ?? []).length) {
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
  if (state.currentSessionType === 'diagnostic') {
    $('#diagnosticStatus').textContent = `Diagnostic progress: ${progress.answered}/${progress.total} answered. ${getDiagnosticProgressNarrative(progress)}`;
    return;
  }
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
  state.latestQuickWinSummary = null;
  state.dashboardExpanded = false;
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

    const [dashboard, weeklyDigest, sessionHistory, parentSummary, teacherBrief, teacherAssignments, activeSession, goalProfile, nextBestAction, diagnosticReveal, planExplanation, projectionEvidence, whatChanged] = await Promise.all([
      json(withLearnerContext('/api/dashboard/learner')),
      json(withLearnerContext('/api/reports/weekly')).catch(() => null),
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
      json(withLearnerContext('/api/plan/explanation')).catch(() => null),
      json(withLearnerContext('/api/projection/evidence')).catch(() => null),
      json(withLearnerContext('/api/progress/what-changed')).catch(() => null),
    ]);

    renderGoalProfile(goalProfile);
    renderNextBestAction(nextBestAction);
    renderDiagnosticReveal(diagnosticReveal);
    renderProfile(dashboard.profile);
    renderProjection(dashboard.projection, projectionEvidence ?? dashboard.projectionEvidence);
    renderPlan(dashboard.plan);
    renderPlanExplanation(planExplanation ?? dashboard.planExplanation);
    renderProgramPath(dashboard.programPath);
    renderCurriculumPath(dashboard.curriculumPath);
    renderErrorDna(dashboard.errorDnaSummary);
    renderWhatChanged(whatChanged ?? dashboard.whatChanged);
    renderWeeklyDigest(weeklyDigest ?? dashboard.weeklyDigest ?? null);
    renderReview(dashboard.review);
    renderSessionHistory(sessionHistory);
    renderStudyModes(dashboard.studyModes ?? []);
    renderReturnPath(dashboard.tomorrowPreview ?? null, dashboard.comebackState ?? null);
    renderQuickWinSummary(dashboard.latestQuickWinSummary);
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
    syncDashboardDetails();
  } catch (error) {
    $('#diagnosticStatus').textContent = error.message;
  }
}

$('#refreshDashboard').addEventListener('click', async () => {
  await loadDashboard();
  await loadReviewRecommendations();
});

$('#toggleDashboardDetails')?.addEventListener('click', () => {
  state.dashboardExpanded = !state.dashboardExpanded;
  syncDashboardDetails();
});

async function startDiagnosticSession() {
  try {
    state.dashboardExpanded = false;
    state.showDiagnosticPreflight = false;
    state.dismissDiagnosticPreflight = false;
    const result = await json('/api/diagnostic/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    state.currentSessionProgress = result.sessionProgress ?? null;
    clearSessionNotice();
    renderDiagnosticReveal(null);
    renderNextBestAction(null);
    renderDiagnosticPreflight();
    state.activeSessionEnvelope = { session: result.session, sessionProgress: result.sessionProgress ?? null };
    renderItem(result.currentItem);
    renderSessionProgress(result.sessionProgress);
  } catch (error) {
    $('#diagnosticStatus').textContent = error.message;
  }
}

async function startTimedSetSession() {
  try {
    state.dashboardExpanded = false;
    state.showDiagnosticPreflight = false;
    state.dismissDiagnosticPreflight = false;
    const result = await json('/api/timed-set/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    state.currentSessionProgress = result.sessionProgress ?? null;
    clearSessionNotice();
    renderDiagnosticReveal(null);
    renderNextBestAction(null);
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
}

async function startModuleSession(sectionOverride = null) {
  try {
    state.dashboardExpanded = false;
    state.showDiagnosticPreflight = false;
    state.dismissDiagnosticPreflight = false;
    const section = sectionOverride ?? $('#moduleSection')?.value ?? 'reading_writing';
    const realismProfileSelection = $('#moduleRealismProfile')?.value ?? 'standard';
    const realismProfile = realismProfileSelection === 'extended' ? 'extended' : 'standard';
    const result = await json('/api/module/start', {
      method: 'POST',
      body: JSON.stringify({ section, realismProfile }),
    });
    state.currentSessionId = result.session.id;
    state.currentSessionType = result.session.type;
    state.currentSessionProgress = result.sessionProgress ?? null;
    clearSessionNotice();
    renderDiagnosticReveal(null);
    renderNextBestAction(null);
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
}

$('#startDiagnostic').addEventListener('click', openDiagnosticPreflight);
$('#startTimedSet').addEventListener('click', startTimedSetSession);
$('#startModule').addEventListener('click', () => startModuleSession());
$('#startDiagnosticFromPreflight')?.addEventListener('click', startDiagnosticSession);
$('#dismissDiagnosticPreflight')?.addEventListener('click', dismissDiagnosticPreflight);

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
    if (result.quickWinSummary) renderQuickWinSummary(result.quickWinSummary);
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
        const completedReviewLoop = state.currentSessionType === 'review';
        const completedQuickWin = state.currentSessionType === 'quick_win';
        if (isExamSessionType(state.currentSessionType)) {
          state.currentItem = null;
          state.sessionCompleted = true;
          renderSessionNotice('Session complete — click Finish to review results.', 'info');
        }
        renderItem(null);
        if (completedReviewLoop) {
          renderSessionNotice('Retry loop complete — Helix updated the next revisit for this trap.', 'info');
          await loadDashboard();
          await loadReviewRecommendations();
        } else if (completedQuickWin) {
          const headline = result.quickWinSummary?.headline ?? 'Quick win complete — Helix banked your first confidence rep.';
          renderSessionNotice(headline, 'info');
          await loadDashboard();
          await loadReviewRecommendations();
        } else if (!isExamSessionType(state.currentSessionType)) {
          renderSessionNotice('Session complete — Helix refreshed your dashboard with the new signal.', 'info');
          await loadDashboard();
          await loadReviewRecommendations();
        }
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
