export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return `${Math.round(normalized)}%`;
}

export function formatMs(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return `${(numeric / 1000).toFixed(1)}s`;
}

export function formatSeconds(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return `${numeric}s`;
}

export function formatCountdown(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Math.max(0, Number(value));
  if (Number.isNaN(numeric)) return String(value);
  const minutes = Math.floor(numeric / 60);
  const seconds = numeric % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function toDisplaySessionType(value) {
  if (!value) return 'session';
  if (value === 'quick_win') return 'Quick win';
  if (value === 'timed_set') return 'Timed set';
  if (value === 'module' || value === 'module_simulation') return 'Module simulation';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatSectionName(section) {
  if (!section) return '';
  if (section === 'reading_writing') return 'Reading & Writing';
  if (section === 'math') return 'Math';
  return section.charAt(0).toUpperCase() + section.slice(1).replace(/_/g, ' ');
}

export function buildActionMeta(action = null, { fallbackMinutes = null } = {}) {
  if (!action) return [];
  const meta = [];
  const minutes = action.estimatedMinutes ?? fallbackMinutes;
  if (minutes) meta.push(`~${minutes} min`);
  if (action.section) meta.push(formatSectionName(action.section));
  if (action.kind === 'start_module') {
    meta.push(action.profileLabel ?? 'Module');
  } else if (action.sessionType) {
    meta.push(toDisplaySessionType(action.sessionType));
  }
  if (action.realismProfile) meta.push(formatRealismProfile(action.realismProfile));
  if (action.itemCount) meta.push(`${action.itemCount} questions`);
  if (action.section === 'math' && action.studentResponseTarget) {
    meta.push(`${action.studentResponseTarget} student responses`);
  }
  return meta;
}

export function normalizeLatestSessionOutcome(source) {
  const raw = source?.latestSessionOutcome
    ?? source?.sessionOutcome
    ?? source?.quickWinSummary
    ?? source?.timedSummary
    ?? source?.moduleSummary
    ?? source
    ?? null;

  if (!raw) return null;

  const sessionType = raw.sessionType ?? null;
  const sessionLabel = raw.sessionLabel ?? raw.label ?? (sessionType ? toDisplaySessionType(sessionType) : 'Session');
  const headline = raw.headline ?? `${sessionLabel} outcome`;
  const scoreBand = raw.scoreBand ?? null;
  const endedAt = raw.endedAt ?? raw.completedAt ?? null;
  const startedAt = raw.startedAt ?? null;
  const summary = raw.summary
    ?? raw.message
    ?? raw.comebackPrompt
    ?? raw.nextAction
    ?? raw.whyThisPlan
    ?? null;
  const evidenceBullets = Array.isArray(raw.evidenceBullets)
    ? raw.evidenceBullets
    : Array.isArray(raw.evidence)
      ? raw.evidence
      : [];
  const nextAction = raw.nextAction ?? raw.recommendedAction ?? raw.followUp ?? null;
  const status = raw.status
    ?? (raw.completed || raw.completedAt ? 'completed' : raw.expired ? 'expired' : 'in progress');
  const metrics = [];

  if (scoreBand?.low !== undefined && scoreBand?.high !== undefined) {
    metrics.push(`Score range now: ${scoreBand.low}–${scoreBand.high}`);
  }
  if (raw.accuracy !== undefined && raw.accuracy !== null) {
    metrics.push(`Accuracy: ${formatPercent(raw.accuracy)}`);
  } else if (raw.correct !== undefined && raw.total !== undefined) {
    metrics.push(`Accuracy: ${raw.correct}/${raw.total}`);
  }
  if (raw.timeLimitSec !== undefined && raw.timeLimitSec !== null) {
    metrics.push(`Time limit: ${formatSeconds(raw.timeLimitSec)}`);
  }
  if (raw.recommendedPaceSec !== undefined && raw.recommendedPaceSec !== null) {
    metrics.push(`Recommended pace: ${formatSeconds(raw.recommendedPaceSec)}`);
  }
  if (raw.readinessIndicator || raw.readinessSignal || raw.readiness_signal) {
    metrics.push(String(raw.readinessIndicator ?? raw.readinessSignal ?? raw.readiness_signal));
  }
  if (endedAt) {
    metrics.push(`Ended: ${formatDateTime(endedAt)}`);
  }

  const resolvedEvidence = evidenceBullets.length
    ? evidenceBullets
    : [
        raw.whyThisPlan,
        raw.comebackPrompt,
        raw.readinessIndicator ?? raw.readinessSignal,
        raw.nextAction,
      ].filter(Boolean);

  return {
    ...raw,
    sessionType,
    sessionLabel,
    headline,
    summary,
    scoreBand,
    startedAt,
    endedAt,
    status,
    evidenceBullets: resolvedEvidence,
    metrics,
    nextAction,
    ctaLabel: raw.ctaLabel ?? 'Continue',
  };
}

export function normalizeBreakdownEntries(value) {
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

export function isExamSessionType(value) {
  return value === 'timed_set' || value === 'module' || value === 'module_simulation';
}

export function isStudentProducedResponseItem(item) {
  return ['grid_in', 'student_produced_response', 'student-produced-response'].includes(item?.item_format);
}

function formatRealismProfile(profile = 'standard') {
  if (profile === 'exam') return 'Exam profile';
  if (profile === 'extended') return 'Extended practice';
  return 'Standard practice';
}
