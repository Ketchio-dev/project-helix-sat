export default function QuestionCard({ item }) {
  if (!item) return null

  const stimulus = item.stimulus || item.passage || item.context || ''
  const stem = item.stem || item.question || item.prompt || ''

  return (
    <div className="space-y-4">
      {stimulus && (
        <div className="border border-neutral-200 rounded-lg p-5 bg-neutral-50">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Passage</p>
          <div
            className="text-sm text-neutral-700 leading-relaxed prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: stimulus }}
          />
        </div>
      )}

      <div className="text-[15px] text-[#111] leading-relaxed">
        <div dangerouslySetInnerHTML={{ __html: stem }} />
      </div>
    </div>
  )
}
