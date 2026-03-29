import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'

export default function Login() {
  const login = useStore((s) => s.login)
  const register = useStore((s) => s.register)
  const authError = useStore((s) => s.authError)
  const navigate = useNavigate()

  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    let success
    if (mode === 'login') {
      success = await login(email, password)
    } else {
      success = await register(name, email, password)
    }
    setLoading(false)
    if (success) navigate('/')
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#111] text-white flex-col justify-center px-16">
        <h1 className="text-3xl font-semibold tracking-tight mb-3">SAT Prep</h1>
        <p className="text-neutral-400 text-sm leading-relaxed mb-10">
          Adaptive practice that meets you where you are.
        </p>
        <ul className="space-y-4 text-sm text-neutral-300">
          <li className="flex items-start gap-3">
            <span className="text-neutral-500 mt-0.5">01</span>
            <span>Diagnostic assessment to find your starting point</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-neutral-500 mt-0.5">02</span>
            <span>AI-guided practice sessions that adapt in real time</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-neutral-500 mt-0.5">03</span>
            <span>Targeted review of the concepts that matter most</span>
          </li>
        </ul>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <h1 className="text-2xl font-semibold tracking-tight text-[#111] mb-1">SAT Prep</h1>
            <p className="text-sm text-neutral-500">Adaptive practice that meets you where you are.</p>
          </div>

          {/* Tab toggle */}
          <div className="flex gap-4 mb-8 border-b border-neutral-200">
            <button
              onClick={() => setMode('login')}
              className={`pb-2 text-sm font-medium transition-colors ${
                mode === 'login'
                  ? 'text-[#111] border-b-2 border-[#111]'
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode('register')}
              className={`pb-2 text-sm font-medium transition-colors ${
                mode === 'register'
                  ? 'text-[#111] border-b-2 border-[#111]'
                  : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              Create account
            </button>
          </div>

          {authError && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition"
                  placeholder="Your name"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent transition"
                placeholder="At least 8 characters"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 text-sm font-medium text-white bg-[#2563eb] rounded-md hover:bg-[#1d4ed8] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
