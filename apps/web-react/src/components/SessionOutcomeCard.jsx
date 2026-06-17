import { useState } from 'react'

const TYPE_LABELS = {
  quick_win: 'Quick win',
  timed_set: 'Timed set',
  module_simulation: 'Module',
}

function formatCompletedAt(iso) {
  if (!iso) return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function SessionOutcomeCard({ outcome, onStart }) {
  const [showEvidence, setShowEvidence] = useState(false)

  if (!outcome || !outcome.headline) return null

  const metrics = Array.isArray(outcome.metrics) ? outcome.metrics : []
  const evidence = Array.isArray(outcome.evidenceBullets) ? outcome.evidenceBullets : []
  const action = outcome.primaryAction || null
  const completedAt = formatCompletedAt(outcome.completedAt)

  return (
    <div className="border border-neutral-200 rounded-lg p-6">
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Last session</p>
      <h2 className="text-base font-semibold text-[#111] mb-1">{outcome.headline}</h2>
      {outcome.subheadline && (
        <p className="text-sm text-neutral-500 leading-relaxed">{outcome.subheadline}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {outcome.statusPill && (
          <span className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {outcome.statusPill}
          </span>
        )}
        <span className="rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600">
          {TYPE_LABELS[outcome.sessionType] || 'Session'}
        </span>
        {completedAt && <span className="text-xs text-neutral-400">{completedAt}</span>}
      </div>

      {metrics.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mt-4">
          {metrics.map(([label, value], idx) => (
            <div key={idx} className="flex items-baseline justify-between gap-3 border-b border-neutral-100 pb-1.5">
              <dt className="text-sm text-neutral-500">{label}</dt>
              <dd className="text-sm font-medium text-[#111]">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {evidence.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="text-xs font-medium text-neutral-500 hover:text-[#111] transition-colors"
          >
            {showEvidence ? 'Hide detail' : 'Why this matters'}
          </button>
          {showEvidence && (
            <ul className="mt-2 space-y-1.5 list-disc pl-5">
              {evidence.map((bullet, idx) => (
                <li key={idx} className="text-sm text-neutral-500 leading-relaxed">{bullet}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {outcome.nextStep && (
        <p className="text-sm text-neutral-600 mt-4">
          <span className="font-medium text-[#111]">Next step:</span> {outcome.nextStep}
        </p>
      )}

      {action && (
        <div className="border-t border-neutral-100 pt-4 mt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">Do this next</p>
              <p className="text-sm font-medium text-[#111]">{action.title}</p>
              {action.reason && (
                <p className="text-sm text-neutral-500 leading-relaxed mt-0.5">{action.reason}</p>
              )}
            </div>
            <button
              onClick={() => onStart(action)}
              className="shrink-0 text-sm font-medium text-white bg-[#2563eb] rounded-md px-5 py-2.5 hover:bg-[#1d4ed8] transition-colors"
            >
              {action.ctaLabel || 'Continue'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
