import { useNavigate } from 'react-router-dom'

function prettifySkill(skill) {
  if (!skill) return ''
  return skill.replace(/^(rw|math)_/, '').replace(/_/g, ' ')
}

export default function ReviewEntryCard({ review }) {
  const navigate = useNavigate()
  const cards = Array.isArray(review?.remediationCards) ? review.remediationCards : []
  if (cards.length === 0) return null

  const skill = prettifySkill(cards[0]?.skill)

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#111]">
          {cards.length} repair{cards.length > 1 ? 's' : ''} ready
        </p>
        {skill && <p className="text-xs text-neutral-500 mt-0.5 truncate">Do this first: {skill}</p>}
      </div>
      <button
        onClick={() => navigate('/review')}
        className="shrink-0 text-sm font-medium text-[#2563eb] border border-[#2563eb] rounded-md px-4 py-2 hover:bg-blue-50 transition-colors"
      >
        Review &amp; repair
      </button>
    </div>
  )
}
