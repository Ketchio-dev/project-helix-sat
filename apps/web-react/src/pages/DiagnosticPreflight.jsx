import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'

const PROMISES = [
  '~13 questions across Reading & Writing and Math',
  'No score is shown mid-test — stay in the flow',
  'You finish with a score band, your top traps, and a first plan',
]

export default function DiagnosticPreflight() {
  const startSession = useStore((s) => s.startSession)
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)

  const handleBegin = async () => {
    setStarting(true)
    const ok = await startSession('diagnostic')
    if (ok) {
      navigate('/practice')
    } else {
      setStarting(false)
    }
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-16">
      <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-3">Diagnostic</p>
      <h1 className="text-2xl font-semibold text-[#111] tracking-tight mb-3">
        ~12 minutes to your first score-moving plan
      </h1>
      <p className="text-sm text-neutral-600 leading-relaxed mb-6">
        A short set across both sections. Helix uses it to estimate your score band, find your most
        expensive recurring mistakes, and build the first session that actually moves your score.
      </p>

      <ul className="space-y-2.5 mb-8">
        {PROMISES.map((text) => (
          <li key={text} className="flex items-start gap-2.5 text-sm text-neutral-600">
            <svg
              className="w-4 h-4 text-[#2563eb] shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {text}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          onClick={handleBegin}
          disabled={starting}
          className="inline-flex items-center justify-center rounded-md bg-[#2563eb] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {starting ? 'Starting...' : 'Start diagnostic'}
        </button>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center justify-center rounded-md border border-neutral-200 px-5 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-[#111]"
        >
          Not now
        </button>
      </div>
    </main>
  )
}
