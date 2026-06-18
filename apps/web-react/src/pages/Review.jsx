import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import RemediationCard from '../components/RemediationCard'

export default function Review() {
  const review = useStore((s) => s.review)
  const loadDashboard = useStore((s) => s.loadDashboard)
  const startSession = useStore((s) => s.startSession)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(() => !review)

  useEffect(() => {
    // Always refresh so review reflects the most recent session.
    loadDashboard().finally(() => setLoading(false))
  }, [loadDashboard])

  const handleStartRetry = async (itemId) => {
    if (!itemId) return
    const ok = await startSession('review-retry', { itemId })
    if (ok) navigate('/practice')
  }

  const cards = Array.isArray(review?.remediationCards) ? review.remediationCards : []

  if (loading && !review) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-neutral-400">Loading review...</p>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <button
        onClick={() => navigate('/')}
        className="text-sm text-neutral-400 hover:text-[#111] transition-colors mb-6"
      >
        &larr; Dashboard
      </button>

      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#111] tracking-tight">Review &amp; repair</h1>
        {review?.dominantError && (
          <p className="text-sm text-neutral-500 mt-1">Main pattern: {review.dominantError.replace(/_/g, ' ')}</p>
        )}
      </div>

      {review?.reflectionPrompt && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-4">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1">Reflect</p>
          <p className="text-sm text-neutral-600 leading-relaxed">{review.reflectionPrompt}</p>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-neutral-500">
            No repairs queued yet. Finish a practice session and your mistakes will turn into targeted repairs here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <RemediationCard card={cards[0]} featured onStartRetry={handleStartRetry} />
          {cards.length > 1 && (
            <>
              <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide pt-2">
                Queued repairs ({cards.length - 1})
              </p>
              {cards.slice(1).map((card) => (
                <RemediationCard key={card.itemId} card={card} onStartRetry={handleStartRetry} />
              ))}
            </>
          )}
        </div>
      )}
    </main>
  )
}
