import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../services/api'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Your passwords do not match.')
      return
    }
    setIsSubmitting(true)
    try {
      await register({ name, email, password })
      navigate('/login', {
        replace: true,
        state: { message: 'Your account is ready. Sign in to continue.' },
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-layout auth-layout--register">
      <section className="auth-panel">
        <a className="brand" href="/" aria-label="InSight home">
          <span className="brand-mark" aria-hidden="true">i</span>
          <span>InSight</span>
        </a>
        <div className="auth-copy">
          <span className="eyebrow">MAKE YOUR NEXT MOVE</span>
          <h1>Start with confidence.</h1>
          <p>Create your account and make room to grow.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-heading">
            <h2>Create your account</h2>
            <p>Your interview practice journey begins here.</p>
          </div>
          <label htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            type="text"
            autoComplete="name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            required
          />
          <label htmlFor="register-email">Email address</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
          />
          <label htmlFor="register-confirm-password">Confirm password</label>
          <input
            id="register-confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Enter your password again"
            required
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
            {!isSubmitting && <span aria-hidden="true">→</span>}
          </button>
          <p className="auth-switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
        <p className="auth-footnote">Your future self is already rooting for you.</p>
      </section>
      <aside className="auth-aside" aria-label="Interview preparation">
        <div className="aside-orbit orbit-one" />
        <div className="aside-orbit orbit-two" />
        <div className="aside-content">
          <span className="aside-kicker">SMALL STEPS. BIG MOMENTS.</span>
          <h2>Good preparation turns nerves into possibility.</h2>
          <p>Build a habit of showing up prepared, clear, and ready to be yourself.</p>
          <div className="aside-note">
            <span className="note-mark">✳</span>
            <span>Your next opportunity is worth preparing for.</span>
          </div>
        </div>
        <span className="aside-index">INSIGHT · INTERVIEW PRACTICE</span>
      </aside>
    </main>
  )
}
