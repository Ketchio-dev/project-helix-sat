import { useState } from 'react'
import { useStore } from '../store'

export default function GoalSetup({ profile, containerRef = null }) {
  const saveGoalProfile = useStore((s) => s.saveGoalProfile)
  const [targetScore, setTargetScore] = useState(profile?.targetScore || '')
  const [targetTestDate, setTargetTestDate] = useState(profile?.targetTestDate || '')
  const [dailyMinutes, setDailyMinutes] = useState(profile?.dailyMinutes || '')
  const [weakArea, setWeakArea] = useState(profile?.selfReportedWeakArea || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isComplete = profile?.isComplete ?? Boolean(profile?.completedAt)
  const isIncomplete = !profile || !isComplete

  if (!isIncomplete) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const success = await saveGoalProfile({
      targetScore: Number(targetScore),
      targetTestDate,
      dailyMinutes: Number(dailyMinutes),
      selfReportedWeakArea: weakArea || undefined,
    })
    setSaving(false)
    if (success) setSaved(true)
  }

  if (saved) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg px-5 py-4">
        <p className="text-sm text-green-800">Goals saved. Your practice plan will adjust accordingly.</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      id="goal-setup-card"
      className="border border-neutral-200 rounded-lg p-6"
    >
      <h3 className="text-sm font-semibold text-[#111] mb-1">Set your goals</h3>
      <p className="text-xs text-neutral-500 mb-5">Help us personalize your practice plan.</p>

      <form id="goal-setup-form" onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Target score</label>
          <input
            id="goal-target-score"
            type="number"
            min="400"
            max="1600"
            step="10"
            value={targetScore}
            onChange={(e) => setTargetScore(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
            placeholder="1400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Test date</label>
          <input
            id="goal-target-date"
            type="date"
            value={targetTestDate}
            onChange={(e) => setTargetTestDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Daily minutes</label>
          <input
            id="goal-daily-minutes"
            type="number"
            min="5"
            max="240"
            value={dailyMinutes}
            onChange={(e) => setDailyMinutes(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent"
            placeholder="30"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">Focus area</label>
          <select
            id="goal-weak-area"
            value={weakArea}
            onChange={(e) => setWeakArea(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent bg-white"
          >
            <option value="">Select...</option>
            <option value="math">Math</option>
            <option value="reading">Reading & Writing</option>
            <option value="both">Both equally</option>
          </select>
        </div>
        <div className="col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="text-sm font-medium text-[#2563eb] border border-[#2563eb] rounded-md px-4 py-1.5 hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save goals'}
          </button>
        </div>
      </form>
    </div>
  )
}
