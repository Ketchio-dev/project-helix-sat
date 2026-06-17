import { useState } from 'react'

function prettifySkill(skill) {
  if (!skill) return ''
  return skill
    .replace(/^(rw|math)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function prettifySection(section) {
  if (section === 'reading_writing') return 'Reading & Writing'
  if (section === 'math') return 'Math'
  return section || ''
}

export default function RemediationCard({ card, featured = false, onStartRetry }) {
  const [showPack, setShowPack] = useState(featured)
  if (!card) return null

  const teach = card.teachCard || null
  const worked = card.workedExample || null
  const transfer = card.transferItem || null
  const retryAction = card.retryAction || null
  const transferAction = card.transferAction || null
  const signal = card.confidenceSignal || null
  const depthLabel = card.packDepth === 'full' ? 'Full repair' : 'Short repair'

  return (
    <div className={`rounded-lg border p-6 ${featured ? 'border-blue-200 bg-blue-50' : 'border-neutral-200'}`}>
      {featured && (
        <p className="text-xs font-medium text-[#2563eb] uppercase tracking-wide mb-2">Do this first</p>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[#111]">{prettifySkill(card.skill)}</h3>
          <p className="text-xs text-neutral-400 mt-0.5">{prettifySection(card.section)}</p>
        </div>
        <span className="shrink-0 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-500">
          {depthLabel}
        </span>
      </div>

      <p className="text-sm font-medium text-[#111] leading-relaxed mt-4">{card.correctionRule}</p>

      <div className="mt-3 space-y-1.5">
        {card.misconception && (
          <p className="text-sm text-neutral-600">
            <span className="font-medium text-[#111]">The trap:</span> {card.misconception}
          </p>
        )}
        {card.decisiveClue && (
          <p className="text-sm text-neutral-600">
            <span className="font-medium text-[#111]">What to notice:</span> {card.decisiveClue}
          </p>
        )}
      </div>

      {card.retryCue && (
        <p className="mt-3 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800">{card.retryCue}</p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {retryAction?.itemId && (
          <button
            onClick={() => onStartRetry(retryAction.itemId)}
            className="inline-flex items-center justify-center rounded-md bg-[#2563eb] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8]"
          >
            {retryAction.ctaLabel || 'Start retry loop'}
          </button>
        )}
        {transferAction?.itemId && (
          <button
            onClick={() => onStartRetry(transferAction.itemId)}
            className="inline-flex items-center justify-center rounded-md border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-[#111]"
          >
            {transferAction.ctaLabel || 'Try near-transfer'}
          </button>
        )}
      </div>

      {(teach || worked || transfer) && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <button
            onClick={() => setShowPack(!showPack)}
            aria-expanded={showPack}
            className="text-xs font-medium text-neutral-500 hover:text-[#111] transition-colors"
          >
            {showPack ? 'Hide lesson pack' : 'Open lesson pack'}
          </button>

          {showPack && (
            <div className="mt-3 space-y-3">
              {teach && (
                <div className="rounded-lg border border-neutral-200 bg-white p-4">
                  <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1">Teach</p>
                  {teach.title && <p className="text-sm font-medium text-[#111]">{teach.title}</p>}
                  {teach.summary && <p className="text-sm text-neutral-600 leading-relaxed mt-1">{teach.summary}</p>}
                  {teach.ruleOfThumb && (
                    <p className="text-sm text-neutral-600 mt-2">
                      <span className="font-medium text-[#111]">Rule of thumb:</span> {teach.ruleOfThumb}
                    </p>
                  )}
                  {teach.commonTrap && <p className="text-sm text-neutral-500 mt-1">{teach.commonTrap}</p>}
                </div>
              )}

              {worked && (
                <div className="rounded-lg border border-neutral-200 bg-white p-4">
                  <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1">Worked example</p>
                  {worked.prompt && <p className="text-sm font-medium text-[#111]">{worked.prompt}</p>}
                  {worked.passage && <p className="text-sm text-neutral-500 leading-relaxed mt-1">{worked.passage}</p>}
                  {Array.isArray(worked.walkthrough) && worked.walkthrough.length > 0 && (
                    <ol className="mt-2 space-y-1.5 list-decimal pl-5">
                      {worked.walkthrough.map((step, idx) => (
                        <li key={idx} className="text-sm text-neutral-600 leading-relaxed">{step}</li>
                      ))}
                    </ol>
                  )}
                  {worked.takeaway && (
                    <p className="text-sm text-neutral-600 mt-2">
                      <span className="font-medium text-[#111]">Takeaway:</span> {worked.takeaway}
                    </p>
                  )}
                </div>
              )}

              {transfer?.prompt && (
                <div className="rounded-lg border border-neutral-200 bg-white p-4">
                  <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1">Near-transfer</p>
                  <p className="text-sm font-medium text-[#111]">{transfer.prompt}</p>
                  {transfer.transferGoal && <p className="text-sm text-neutral-500 mt-1">{transfer.transferGoal}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(signal?.summary || card.nextScheduledRevisit) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
          {signal?.summary && (
            <span>
              {signal.summary}
              {signal.before != null && signal.after != null ? ` (${signal.before} → ${signal.after})` : ''}
            </span>
          )}
          {card.nextScheduledRevisit && <span>Revisit {card.nextScheduledRevisit}</span>}
        </div>
      )}
    </div>
  )
}
