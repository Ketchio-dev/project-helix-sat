export default function ActionCard({ action, onStart }) {
  if (!action) return null

  const title = action.title || 'Start practicing'
  const description = action.reason || ''
  const ctaLabel = action.ctaLabel || 'Begin'
  const minutes = action.estimatedMinutes || null

  const handleClick = () => {
    onStart(action)
  }

  return (
    <div className="border border-neutral-200 rounded-lg p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">
            Recommended next
          </p>
          <h2 className="text-lg font-semibold text-[#111] mb-1.5">{title}</h2>
          {description && (
            <p className="text-sm text-neutral-500 leading-relaxed">{description}</p>
          )}
          {minutes && (
            <p className="text-xs text-neutral-400 mt-2">~{minutes} min</p>
          )}
        </div>
        <button
          onClick={handleClick}
          className="shrink-0 text-sm font-medium text-white bg-[#2563eb] rounded-md px-5 py-2.5 hover:bg-[#1d4ed8] transition-colors"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
