import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function Navbar({ activePage = 'dashboard' }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const userInitial = user?.name ? user.name.trim().charAt(0).toUpperCase() : 'U'

  return (
    <header className="poise-navbar-header">
      <div className="poise-navbar-inner">
        {/* Brand */}
        <Link className="poise-brand" to="/dashboard" aria-label="InSight dashboard">
          <span className="poise-brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <circle cx="12" cy="12" r="4" fill="currentColor" />
            </svg>
          </span>
          <span className="poise-brand-name">InSight</span>
        </Link>

        {/* Navigation items */}
        <nav className="poise-nav-links" aria-label="Main navigation">
          <Link
            className={`poise-nav-link ${activePage === 'dashboard' ? 'poise-nav-link--active' : ''}`}
            to="/dashboard"
          >
            Dashboard
          </Link>

          <Link
            className={`poise-nav-link ${activePage === 'setup' || activePage === 'practice' ? 'poise-nav-link--active' : ''}`}
            to="/interview/new"
          >
            Practice
          </Link>

          <Link
            className={`poise-nav-link ${activePage === 'reports' ? 'poise-nav-link--active' : ''}`}
            to="/reports"
          >
            Reports
          </Link>

          <Link
            className={`poise-nav-link ${activePage === 'profiles' ? 'poise-nav-link--active' : ''}`}
            to="/job-profiles"
          >
            Question bank
          </Link>
        </nav>

        {/* Right side CTA & account */}
        <div className="poise-navbar-right">
          <Link className="button poise-btn-primary poise-btn-new-session" to="/interview/new">
            New session
          </Link>

          <div className="poise-nav-account">
            <span className="poise-avatar-bubble" title={user?.email || 'User'}>
              {userInitial}
            </span>
            <button
              type="button"
              className="button button-quiet button-sm poise-logout-btn"
              onClick={handleLogout}
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
