import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { itemStatus, summarizeReview, prettifyDistractorTag } from '../lib/sessionReview'

const SESSION_TYPE_LABELS = {
  diagnostic: 'Diagnostic',
  quick_win: 'Quick win',
  'quick-win': 'Quick win',
  review: 'Review',
  timed_set: 'Timed set',
  'timed-set': 'Timed set',
  module_simulation: 'Module simulation',
  module: 'Module simulation',
}

function prettifySection(section) {
  if (section === 'reading_writing') return 'Reading & Writing'
  if (section === 'math') return 'Math'
  return section || ''
}

function formatLabel(itemFormat) {
  if (!itemFormat) return null
  return itemFormat === 'grid_in' || itemFormat === 'student_produced_response'
    ? 'Student-produced response'
    : 'Multiple choice'
}

const STATUS_STYLES = {
  correct: { card: 'border-green-200 bg-green-50', badge: 'bg-green-100 text-green-700', icon: '✓', label: 'Correct' },
  incorrect: { card: 'border-red-200 bg-red-50', badge: 'bg-red-100 text-red-700', icon: '✗', label: 'Incorrect' },
  unanswered: { card: 'border-neutral-200 bg-neutral-50', badge: 'bg-neutral-100 text-neutral-500', icon: '—', label: 'Unanswered' },
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="text-sm text-neutral-700">{value}</dd>
    </div>
  )
}

function ReviewItem({ item, index }) {
  const status = itemStatus(item)
  const style = STATUS_STYLES[status]
  const format = formatLabel(item.itemFormat)

  return (
    <article className={`rounded-lg border px-4 py-3.5 ${style.card}`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${style.badge}`} aria-hidden="true">
          {style.icon}
        </span>
        <p className="text-sm font-semibold text-[#111]">Item {index + 1}</p>
        <span className="ml-auto text-xs font-medium text-neutral-500">{style.label}</span>
      </div>

      <dl className="space-y-1">
        {item.selectedAnswer != null && item.selectedAnswer !== '' && (
          <DetailRow label="Your answer" value={item.selectedAnswer} />
        )}
        {item.correctAnswer != null && item.correctAnswer !== '' && (
          <DetailRow label="Correct answer" value={item.correctAnswer} />
        )}
        {format && <DetailRow label="Format" value={format} />}
      </dl>

      {status === 'incorrect' && item.distractorTag && (
        <p className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
          Misconception: {prettifyDistractorTag(item.distractorTag)}
        </p>
      )}
      {item.rationale && (
        <p className="mt-2.5 text-sm leading-relaxed text-neutral-600">{item.rationale}</p>
      )}
    </article>
  )
}

export default function SessionReview() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const loadSessionReview = useStore((s) => s.loadSessionReview)
  const navigate = useNavigate()

  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [trackedSessionId, setTrackedSessionId] = useState(sessionId)

  // Reset to the loading state when the target session changes without a
  // remount (adjust-during-render — avoids a setState-in-effect cascade).
  if (sessionId !== trackedSessionId) {
    setTrackedSessionId(sessionId)
    setReview(null)
    setLoading(true)
  }

  useEffect(() => {
    let active = true
    loadSessionReview(sessionId).then((data) => {
      if (!active) return
      setReview(data)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [loadSessionReview, sessionId])

  const items = Array.isArray(review?.items) ? review.items : []
  const session = review?.session ?? {}
  const typeLabel = SESSION_TYPE_LABELS[session.type] || 'Session'
  const sectionLabel = session.section ? prettifySection(session.section) : null
  const { total, answered, correct } = summarizeReview(review)
  const projection = review?.projection

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <button
        onClick={() => navigate('/')}
        className="mb-6 text-sm text-neutral-400 transition-colors hover:text-[#111]"
      >
        &larr; Dashboard
      </button>

      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-[#111]">
          {typeLabel}{sectionLabel ? ` — ${sectionLabel}` : ''} review
        </h1>
        {!loading && items.length > 0 && (
          <p className="mt-1 text-sm text-neutral-500">
            {answered} of {total} answered · {correct} correct
          </p>
        )}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-neutral-400">Loading review...</p>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-neutral-500">
            No item-level review is available for this session yet.
          </p>
          <button
            onClick={() => navigate('/review')}
            className="mt-4 text-sm font-medium text-[#2563eb] hover:underline"
          >
            Go to review &amp; repair
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item, index) => (
              <ReviewItem key={item.itemId || index} item={item} index={index} />
            ))}
          </div>

          {projection && (projection.predicted_total_low != null || projection.predicted_total_high != null) && (
            <p className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
              Projected score band: {projection.predicted_total_low}&ndash;{projection.predicted_total_high}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => navigate('/review')}
              className="inline-flex items-center justify-center rounded-md bg-[#2563eb] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8]"
            >
              Review &amp; repair
            </button>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center justify-center rounded-md border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-[#111]"
            >
              Back to dashboard
            </button>
          </div>
        </>
      )}
    </main>
  )
}
