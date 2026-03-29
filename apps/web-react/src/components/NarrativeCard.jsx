import { useState } from 'react'

export default function NarrativeCard({ narrative }) {
  const [open, setOpen] = useState(false)

  if (!narrative) return null

  const text = typeof narrative === 'string' ? narrative : narrative.text || narrative.summary || ''
  if (!text) return null

  return (
    <div className="border border-neutral-200 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3.5 flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-neutral-600">
          Why this is next
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
        <div className="px-5 pb-4 border-t border-neutral-100">
          <p className="text-sm text-neutral-500 leading-relaxed pt-3">{text}</p>
        </div>
      )}
    </div>
  )
}
