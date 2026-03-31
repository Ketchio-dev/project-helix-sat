import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'

export default function SessionNotice({ session }) {
  const resumeSession = useStore((s) => s.resumeSession)
  const navigate = useNavigate()

  if (!session) return null

  const inner = session.session || session
  const sessionType = session.sessionType || inner.type || 'practice'
  const progress = session.sessionProgress || session.progress
  const label = sessionType.replace(/[-_]/g, ' ')

  const handleResume = () => {
    resumeSession(session)
    navigate('/practice')
  }

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg px-5 py-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-amber-900">
          You have an active {label} session
        </p>
        {progress && (
          <p className="text-xs text-amber-700 mt-0.5">
            {progress.answered || progress.completed || progress.current || 0} of {progress.total || '?'} questions answered
          </p>
        )}
      </div>
      <button
        onClick={handleResume}
        className="text-xs font-medium text-amber-800 border border-amber-300 rounded-md px-3 py-1.5 hover:bg-amber-100 transition-colors"
      >
        Resume
      </button>
    </div>
  )
}
