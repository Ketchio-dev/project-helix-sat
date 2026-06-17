// Framework-free exam-countdown math, mirrored from the server's getExamTiming
// contract (services/api/src/store/store-core-utils.mjs). The server is the
// single source of truth: it anchors a timed session on an absolute deadline
// (`expiresAt` = started_at + time_limit) and rejects attempts once expired
// (HTTP 409). The client only mirrors that deadline so a learner sees a live
// MM:SS countdown without polling — anchoring on the absolute `expiresAt` keeps
// the display stable across re-renders and correct after a refresh.

export const WARNING_THRESHOLD_SEC = 30;

// A session is timed only when the server attached a numeric time limit. Driven
// off the payload (not a hardcoded session-type list) so it stays correct as
// exam_mode session types evolve; diagnostics carry no `timing` and never tick.
export function hasExamTiming(timing) {
  return Boolean(timing) && timing.timeLimitSec !== null && timing.timeLimitSec !== undefined;
}

// Resolve the absolute expiry instant (epoch ms) from a server timing payload.
// Prefer the authoritative `expiresAt`; fall back to startedAt + limit, then to
// anchoring the reported remaining time to `nowMs` (defensive only).
export function resolveExpiresAtMs(timing, nowMs) {
  if (!hasExamTiming(timing)) return null;

  if (timing.expiresAt) {
    const ms = new Date(timing.expiresAt).getTime();
    if (!Number.isNaN(ms)) return ms;
  }

  const startedSource = timing.startedAt ?? timing.started_at ?? null;
  if (startedSource) {
    const startedMs = new Date(startedSource).getTime();
    if (!Number.isNaN(startedMs)) return startedMs + timing.timeLimitSec * 1000;
  }

  const remaining = timing.remainingTimeSec ?? timing.timeLimitSec;
  return nowMs + remaining * 1000;
}

// Whole seconds left, clamped at 0. Ceil so the last partial second still reads
// 00:01 (matches the legacy shell's floor-on-elapsed behaviour).
export function computeRemainingSec(timing, nowMs) {
  const expiresAtMs = resolveExpiresAtMs(timing, nowMs);
  if (expiresAtMs === null) return null;
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

export function isExpired(timing, nowMs) {
  const expiresAtMs = resolveExpiresAtMs(timing, nowMs);
  if (expiresAtMs === null) return false;
  return nowMs >= expiresAtMs;
}

export function formatCountdown(totalSec) {
  if (totalSec === null || totalSec === undefined || totalSec === '') return '—';
  const numeric = Math.max(0, Math.floor(Number(totalSec)));
  if (Number.isNaN(numeric)) return '—';
  const minutes = Math.floor(numeric / 60);
  const seconds = numeric % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
