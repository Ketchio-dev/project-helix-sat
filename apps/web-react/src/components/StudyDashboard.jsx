import { useState } from 'react'

function toPercent(value) {
  return `${Math.round((value ?? 0) * 100)}%`
}

const READINESS_LABELS = {
  insufficient_evidence: 'Gathering evidence',
  needs_foundation: 'Building foundation',
  building: 'Building',
  approaching_goal: 'Approaching goal',
  test_ready: 'Test ready',
}

const MOMENTUM_LABELS = {
  declining: 'Declining',
  flat: 'Flat',
  improving: 'Improving',
  strong: 'Strong',
}

const FOCUS_LABELS = {
  anchor: 'Anchor',
  support: 'Support',
  maintenance: 'Maintenance',
}

function dayHeader(day) {
  if (day?.dayOffset === 0) return 'Today'
  if (day?.dayOffset === 1) return 'Tomorrow'
  return day?.date || `Day ${(day?.dayOffset ?? 0) + 1}`
}

function Card({ title, children }) {
  return (
    <div className="border border-neutral-200 rounded-lg p-5">
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">{title}</p>
      {children}
    </div>
  )
}

function Collapsible({ label, items }) {
  const [open, setOpen] = useState(false)
  if (!items || items.length === 0) return null
  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="text-xs font-medium text-neutral-500 hover:text-[#111] transition-colors"
      >
        {open ? 'Hide detail' : label}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          {items.map((text, idx) => (
            <li key={idx} className="text-sm text-neutral-500 leading-relaxed">{text}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProjectionCard({ projection }) {
  if (!projection || !projection.band) return null
  const band = projection.band
  const insufficient = projection.status === 'insufficient_evidence'

  return (
    <Card title="Projected score">
      {insufficient ? (
        <p className="text-sm text-neutral-500 leading-relaxed">
          Helix needs a bit more evidence before projecting a score band.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-[#111]">{band.low}&ndash;{band.high}</span>
            {projection.signalLabel && (
              <span className="text-xs font-medium text-neutral-500 capitalize">{projection.signalLabel}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="border border-neutral-200 rounded-lg px-3 py-2">
              <p className="text-[11px] text-neutral-400">Reading &amp; Writing</p>
              <p className="text-sm font-semibold text-[#111]">{band.rwLow}&ndash;{band.rwHigh}</p>
            </div>
            <div className="border border-neutral-200 rounded-lg px-3 py-2">
              <p className="text-[11px] text-neutral-400">Math</p>
              <p className="text-sm font-semibold text-[#111]">{band.mathLow}&ndash;{band.mathHigh}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {projection.readiness && (
              <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
                {READINESS_LABELS[projection.readiness] || projection.readiness}
              </span>
            )}
            <span className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600">
              Momentum {toPercent(projection.momentum)}
            </span>
          </div>
        </>
      )}
      {projection.signalExplanation && (
        <p className="text-xs text-neutral-500 mt-3 leading-relaxed">{projection.signalExplanation}</p>
      )}
      <Collapsible label="Why this changed" items={projection.whyChanged} />
    </Card>
  )
}

function ErrorDnaCard({ entries }) {
  const list = Array.isArray(entries)
    ? entries.filter((entry) => entry && (entry.label || entry.summary)).slice(0, 3)
    : []
  if (list.length === 0) return null

  return (
    <Card title="Recurring traps">
      <div className="space-y-2">
        {list.map((entry) => (
          <div key={entry.tag} className="border border-neutral-200 rounded-lg px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-[#111]">{entry.label}</p>
              <span className="text-[11px] text-neutral-400 shrink-0">Signal {entry.score}</span>
            </div>
            {entry.summary && (
              <p className="text-sm text-neutral-500 mt-0.5 leading-relaxed">{entry.summary}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function WhatChangedCard({ whatChanged }) {
  if (!whatChanged || !whatChanged.headline) return null
  const bullets = Array.isArray(whatChanged.bullets) ? whatChanged.bullets : []

  return (
    <Card title="Since last time">
      <p className="text-sm font-medium text-[#111]">{whatChanged.headline}</p>
      {bullets.length > 0 && (
        <ul className="mt-2 space-y-1.5 list-disc pl-5">
          {bullets.map((text, idx) => (
            <li key={idx} className="text-sm text-neutral-500 leading-relaxed">{text}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function WeeklyDigestCard({ digest }) {
  if (!digest) return null
  const detail = [
    ...(Array.isArray(digest.strengths) ? digest.strengths.map((s) => `Strength: ${s}`) : []),
    ...(Array.isArray(digest.risks) ? digest.risks.map((r) => `Risk: ${r}`) : []),
    ...(Array.isArray(digest.recommendedFocus) ? digest.recommendedFocus.map((f) => `Focus: ${f}`) : []),
  ]

  return (
    <Card title="This week">
      {digest.nextWeekOpportunity && (
        <p className="text-sm text-[#111] leading-relaxed">{digest.nextWeekOpportunity}</p>
      )}
      {digest.projectedMomentum && (
        <span className="inline-block mt-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
          Momentum: {MOMENTUM_LABELS[digest.projectedMomentum] || digest.projectedMomentum}
        </span>
      )}
      <Collapsible label="Strengths &amp; risks" items={detail} />
    </Card>
  )
}

function StreakCard({ streak, comeback }) {
  const returning = Boolean(comeback?.isReturning)
  if (!streak && !returning) return null
  const prompt = returning ? comeback?.prompt : streak?.prompt

  return (
    <Card title={returning ? 'Welcome back' : 'Streak'}>
      {streak && (
        <div className="flex items-center gap-6">
          <div>
            <p className="text-2xl font-semibold text-[#111]">{streak.current}</p>
            <p className="text-[11px] text-neutral-400">current</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-neutral-400">{streak.best}</p>
            <p className="text-[11px] text-neutral-400">best</p>
          </div>
        </div>
      )}
      {returning && comeback?.headline && (
        <p className="text-sm font-medium text-[#111] mt-3">{comeback.headline}</p>
      )}
      {prompt && <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{prompt}</p>}
    </Card>
  )
}

function GuidedWeeklyPathCard({ path }) {
  if (!path || !path.headline) return null
  const days = Array.isArray(path.days) ? path.days : []
  const checkpoints = Array.isArray(path.checkpoints) ? path.checkpoints : []

  return (
    <Card title="This week's plan">
      <p className="text-sm font-medium text-[#111]">{path.headline}</p>
      {path.activePhaseTitle && <p className="text-xs text-neutral-500 mt-0.5">{path.activePhaseTitle}</p>}

      <div className="flex flex-wrap gap-2 mt-2">
        {path.weeklyMinutes ? (
          <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
            ~{path.weeklyMinutes} min/week
          </span>
        ) : null}
        {path.sessionsPerWeek ? (
          <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {path.sessionsPerWeek} sessions
          </span>
        ) : null}
      </div>

      {days.length > 0 && (
        <ul className="mt-3">
          {days.map((day) => (
            <li
              key={day.key}
              className="flex items-baseline justify-between gap-3 border-b border-neutral-100 py-1.5 last:border-b-0"
            >
              <div className="min-w-0">
                <span className="text-sm text-[#111]">{dayHeader(day)}</span>
                {day.label && <span className="text-xs text-neutral-400 ml-2">{day.label}</span>}
              </div>
              <span className="shrink-0 text-[11px] text-neutral-400">
                {(FOCUS_LABELS[day.focusType] || day.focusType) ?? ''} &middot; {day.minutes}m
              </span>
            </li>
          ))}
        </ul>
      )}

      <Collapsible
        label={`Revisit checkpoints (${checkpoints.length})`}
        items={checkpoints.map((c) => `${c.label} — due in ${c.dueInDays}d: ${c.reason}`)}
      />
    </Card>
  )
}

export default function StudyDashboard({
  projectionEvidence,
  errorDnaSummary,
  whatChanged,
  weeklyDigest,
  comebackState,
  completionStreak,
  guidedWeeklyPath,
}) {
  const [open, setOpen] = useState(false)

  const hasProjection = Boolean(projectionEvidence) && projectionEvidence.status !== 'insufficient_evidence'
  const hasErrors = Array.isArray(errorDnaSummary) && errorDnaSummary.length > 0
  const hasStreak = Boolean(completionStreak) && (completionStreak.current > 0 || completionStreak.best > 0)
  const hasWeekly = Boolean(weeklyDigest) && Boolean(
    weeklyDigest.nextWeekOpportunity ||
    weeklyDigest.strengths?.length ||
    weeklyDigest.risks?.length ||
    weeklyDigest.recommendedFocus?.length
  )
  const returning = Boolean(comebackState?.isReturning)
  const hasGuidedWeek = Boolean(guidedWeeklyPath?.headline)

  const hasContent = hasProjection || hasErrors || Boolean(whatChanged) || hasWeekly || hasStreak || returning || hasGuidedWeek
  if (!hasContent) return null

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 px-5 py-3.5 text-left transition-colors hover:border-neutral-300"
      >
        <span className="text-sm font-medium text-neutral-600">
          {open ? 'Hide study dashboard' : 'Show full study dashboard'}
        </span>
        <svg
          className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {hasProjection && <ProjectionCard projection={projectionEvidence} />}
          {hasGuidedWeek && <GuidedWeeklyPathCard path={guidedWeeklyPath} />}
          {whatChanged && <WhatChangedCard whatChanged={whatChanged} />}
          {hasErrors && <ErrorDnaCard entries={errorDnaSummary} />}
          {(hasStreak || returning) && <StreakCard streak={completionStreak} comeback={comebackState} />}
          {hasWeekly && <WeeklyDigestCard digest={weeklyDigest} />}
        </div>
      )}
    </div>
  )
}
