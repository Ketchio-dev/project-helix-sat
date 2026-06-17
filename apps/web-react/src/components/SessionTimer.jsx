import { useState, useEffect, useRef } from 'react'
import {
  WARNING_THRESHOLD_SEC,
  hasExamTiming,
  computeRemainingSec,
  isExpired,
  formatCountdown,
} from '../lib/examTiming'

// Live mirror of the server's exam deadline. Anchors on the absolute expiry
// (so a page refresh resumes at the correct moment, not a fresh full clock) and
// ticks locally once a second. Fires onExpire exactly once when the deadline
// passes so the page can lock the answer controls; the server independently
// rejects any expired submission, so this is presentation only.
export default function SessionTimer({ timing, label = 'Exam', onExpire }) {
  const timed = hasExamTiming(timing)
  const [now, setNow] = useState(() => Date.now())
  const firedExpire = useRef(false)

  useEffect(() => {
    if (!timed) return undefined
    const tick = () => setNow(Date.now())
    tick()
    const handle = setInterval(tick, 1000)
    return () => clearInterval(handle)
  }, [timed, timing])

  const expired = timed && isExpired(timing, now)

  useEffect(() => {
    if (!timed) return
    if (expired && !firedExpire.current) {
      firedExpire.current = true
      onExpire?.()
    } else if (!expired) {
      firedExpire.current = false
    }
  }, [timed, expired, onExpire])

  if (!timed) return null

  const remaining = computeRemainingSec(timing, now)
  const warning = !expired && remaining <= WARNING_THRESHOLD_SEC

  const tone = expired
    ? 'border-red-200 bg-red-50 text-red-700'
    : warning
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-neutral-200 bg-white text-neutral-700'

  return (
    <div
      role="timer"
      aria-label={`${label} time remaining`}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium tabular-nums ${tone}`}
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{expired ? 'Time’s up' : `${formatCountdown(remaining)} left`}</span>
    </div>
  )
}
