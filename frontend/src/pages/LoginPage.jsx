import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

function Brand() {
  return (
    <a className="brand" href="/" aria-label="InSight home">
      <span className="brand-mark" aria-hidden="true">i</span>
      <span>InSight</span>
    </a>
  )
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await login(email, password)
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">YOUR NEXT OPPORTUNITY STARTS HERE</span>
          <h1>Practice with purpose.</h1>
          <p>Build confidence one interview at a time.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-heading">
            <h2>Welcome back</h2>
            <p>Sign in to continue your preparation.</p>
          </div>
          {location.state?.message && (
            <p className="form-success" role="status">{location.state.message}</p>
          )}
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
            {!isSubmitting && <span aria-hidden="true">→</span>}
          </button>
          <p className="auth-switch">
            New to InSight? <Link to="/register">Create an account</Link>
          </p>
        </form>
        <p className="auth-footnote">A little practice can change everything.</p>
      </section>
      <aside className="auth-aside" aria-label="Interview preparation">
        <div className="aside-orbit orbit-one" />
        <div className="aside-orbit orbit-two" />
        <div className="aside-content">
          <span className="aside-kicker">SHOW UP AS YOUR BEST</span>
          <h2>Your next great answer starts with a little practice.</h2>
          <p>A focused space to prepare, reflect, and grow into the opportunities ahead.</p>
          <div className="aside-note">
            <span className="note-mark">✳</span>
            <span>Progress is built one thoughtful answer at a time.</span>
          </div>
        </div>
        <span className="aside-index">INSIGHT · INTERVIEW PRACTICE</span>
      </aside>
    </main>
  )
}
