import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Practice from './pages/Practice'
import TopBar from './components/TopBar'

function ProtectedRoute({ children }) {
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const authLoading = useStore((s) => s.authLoading)

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm text-neutral-400">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default function App() {
  const checkAuth = useStore((s) => s.checkAuth)
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const authLoading = useStore((s) => s.authLoading)
  const location = useLocation()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const showTopBar = isAuthenticated && !authLoading && location.pathname !== '/login'

  return (
    <div className="min-h-screen bg-white">
      {showTopBar && <TopBar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/practice"
          element={
            <ProtectedRoute>
              <Practice />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
