import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../store'

export default function TopBar() {
  const user = useStore((s) => s.user)
  const logout = useStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <header className="border-b border-neutral-200">
      <div className="max-w-3xl mx-auto px-6 h-12 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="text-sm font-semibold tracking-tight text-[#111] hover:text-neutral-600 transition-colors"
        >
          SAT Prep
        </button>

        <div className="flex items-center gap-4">
          {location.pathname === '/practice' && (
            <button
              onClick={() => navigate('/')}
              className="text-xs text-neutral-500 hover:text-[#111] transition-colors"
            >
              Exit
            </button>
          )}
          {user && (
            <span className="text-xs text-neutral-400">
              {user.name || user.email}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-neutral-400 hover:text-[#111] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
