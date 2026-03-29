import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import SessionNotice from '../components/SessionNotice'
import ActionCard from '../components/ActionCard'
import NarrativeCard from '../components/NarrativeCard'
import GoalSetup from '../components/GoalSetup'

export default function Dashboard() {
  const loadDashboard = useStore((s) => s.loadDashboard)
  const startSession = useStore((s) => s.startSession)
  const dashboardLoading = useStore((s) => s.dashboardLoading)
  const dashboardError = useStore((s) => s.dashboardError)
  const nextBestAction = useStore((s) => s.nextBestAction)
  const learnerNarrative = useStore((s) => s.learnerNarrative)
  const goalProfile = useStore((s) => s.goalProfile)
  const activeSession = useStore((s) => s.activeSession)
  const user = useStore((s) => s.user)
  const navigate = useNavigate()

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const handleStartAction = async (type, params) => {
    const success = await startSession(type, params)
    if (success) navigate('/practice')
  }

  if (dashboardLoading) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="space-y-4">
          <div className="h-5 w-48 bg-neutral-100 rounded animate-pulse" />
          <div className="h-28 bg-neutral-50 rounded-lg border border-neutral-200 animate-pulse" />
          <div className="h-12 bg-neutral-50 rounded-lg border border-neutral-200 animate-pulse" />
        </div>
      </main>
    )
  }

  if (dashboardError) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="border border-red-200 bg-red-50 rounded-lg px-5 py-4">
          <p className="text-sm text-red-700">Failed to load dashboard. Please refresh.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-xl font-semibold text-[#111] tracking-tight">
          {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Your dashboard'}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Pick up where you left off, or start something new.
        </p>
      </div>

      <div className="space-y-4">
        <SessionNotice session={activeSession} />
        <ActionCard action={nextBestAction} onStart={handleStartAction} />
        <NarrativeCard narrative={learnerNarrative} />
        <GoalSetup profile={goalProfile} />
      </div>

      {!nextBestAction && !activeSession && (
        <div className="mt-8 text-center">
          <p className="text-sm text-neutral-500 mb-4">No recommendations yet. Start a diagnostic to get personalized practice.</p>
          <button
            onClick={() => handleStartAction('diagnostic')}
            className="text-sm font-medium text-white bg-[#2563eb] rounded-md px-4 py-2 hover:bg-[#1d4ed8] transition-colors"
          >
            Start diagnostic
          </button>
        </div>
      )}
    </main>
  )
}
