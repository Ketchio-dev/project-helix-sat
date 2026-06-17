import { useState } from 'react'

function toPercent(value) {
  return `${Math.round((value ?? 0) * 100)}%`
}

export default function DiagnosticRevealCard({ reveal, onStart }) {
  const [showEvidence, setShowEvidence] = useState(false)

  if (!reveal || !reveal.scoreBand) return null

  const band = reveal.scoreBand
  const leaks = Array.isArray(reveal.topScoreLeaks) ? reveal.topScoreLeaks : []
  const evidence = Array.isArray(reveal.evidenceBullets) ? reveal.evidenceBullets : []
  const action = reveal.firstRecommendedAction || null

  return (
    <div className="border border-neutral-200 rounded-lg p-6">
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">
        Your diagnostic result
      </p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="border border-neutral-200 rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-neutral-400 mb-0.5">Score range</p>
          <p className="text-base font-semibold text-[#111]">{band.low}&ndash;{band.high}</p>
        </div>
        <div className="border border-neutral-200 rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-neutral-400 mb-0.5">Signal</p>
          <p className="text-base font-semibold text-[#111] capitalize">{reveal.confidenceLabel || 'early estimate'}</p>
        </div>
        <div className="border border-neutral-200 rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-neutral-400 mb-0.5">Trend</p>
          <p className="text-base font-semibold text-[#111]">{toPercent(reveal.momentum)}</p>
        </div>
      </div>

      {reveal.whyThisPlan && (
        <p className="text-sm text-[#111] leading-relaxed mb-1.5">{reveal.whyThisPlan}</p>
      )}
      {reveal.confidenceExplanation && (
        <p className="text-xs text-neutral-500 mb-4">{reveal.confidenceExplanation}</p>
      )}

      {leaks.length > 0 && (
        <div className="space-y-2 mb-4">
          {leaks.map((leak) => (
            <div key={leak.tag} className="border border-neutral-200 rounded-lg px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-[#111]">{leak.label}</p>
                <span className="text-[11px] text-neutral-400 shrink-0">Signal {leak.score}</span>
              </div>
              <p className="text-sm text-neutral-500 mt-0.5 leading-relaxed">{leak.summary}</p>
            </div>
          ))}
        </div>
      )}

      {evidence.length > 0 && (
        <div className="mb-5">
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            className="text-xs font-medium text-neutral-500 hover:text-[#111] transition-colors"
          >
            {showEvidence ? 'Hide reasoning' : 'Why Helix believes this'}
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

      {action && (
        <div className="border-t border-neutral-100 pt-4">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1.5">Start here</p>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#111]">{action.title}</p>
              {action.reason && (
                <p className="text-sm text-neutral-500 leading-relaxed mt-0.5">{action.reason}</p>
              )}
            </div>
            <button
              onClick={() => onStart(action)}
              className="shrink-0 text-sm font-medium text-white bg-[#2563eb] rounded-md px-5 py-2.5 hover:bg-[#1d4ed8] transition-colors"
            >
              {action.ctaLabel || 'Start'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
