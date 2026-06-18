const STEP_STATUS = {
  ready: { label: 'Ready', cls: 'text-[#2563eb]' },
  next: { label: 'Next', cls: 'text-[#2563eb]' },
  wrap_up: { label: 'Wrap up', cls: 'text-neutral-500' },
  prepared: { label: 'Prepared', cls: 'text-neutral-400' },
  locked: { label: 'Locked', cls: 'text-neutral-300' },
}

export default function GuidedDailyPath({ path, onStart }) {
  if (!path || !path.headline) return null

  const steps = Array.isArray(path.steps) ? path.steps : []
  const primary = path.primaryAction || null

  return (
    <div className="border border-neutral-200 rounded-lg p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Today&rsquo;s path</p>
          <h2 className="text-lg font-semibold text-[#111]">{path.headline}</h2>
          {path.prompt && <p className="text-sm text-neutral-500 leading-relaxed mt-1">{path.prompt}</p>}
        </div>
        {path.totalMinutes ? (
          <span className="shrink-0 text-xs text-neutral-400">~{path.totalMinutes} min</span>
        ) : null}
      </div>

      {steps.length > 0 && (
        <ol className="mt-4 space-y-2.5">
          {steps.map((step, idx) => {
            const status = STEP_STATUS[step.status] || STEP_STATUS.prepared
            const muted = step.status === 'locked'
            return (
              <li key={step.key || idx} className="flex items-start gap-3">
                <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border border-neutral-200 text-[11px] text-neutral-400 mt-0.5">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`text-sm font-medium ${muted ? 'text-neutral-400' : 'text-[#111]'}`}>{step.label}</p>
                    <span className={`shrink-0 text-[11px] font-medium ${status.cls}`}>{status.label}</span>
                  </div>
                  {step.summary && <p className="text-xs text-neutral-500 leading-relaxed mt-0.5">{step.summary}</p>}
                  {step.minutes ? <p className="text-[11px] text-neutral-400 mt-0.5">~{step.minutes} min</p> : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {primary && (
        <button
          onClick={() => onStart(primary)}
          className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[#2563eb] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8] sm:w-auto"
        >
          Start today&rsquo;s path
        </button>
      )}
    </div>
  )
}
