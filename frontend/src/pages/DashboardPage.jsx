import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getDashboardRecent, getDashboardSummary } from '../services/api'

function Brand() {
  return (
    <a className="brand dashboard-brand" href="/dashboard" aria-label="InSight dashboard">
      <span className="brand-mark" aria-hidden="true">i</span>
      <span>InSight</span>
    </a>
  )
}

function StatCard({ label, value, note, icon, tone }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon" aria-hidden="true">{icon}</span>
      </div>
      <p className="stat-value">{value}</p>
      <p className="stat-note">{note}</p>
    </article>
  )
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function DashboardPage() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const loadDashboard = useCallback(async (signal) => {
    setIsLoading(true)
    setError('')
    try {
      const [nextSummary, nextSessions] = await Promise.all([
        getDashboardSummary(token, { signal }),
        getDashboardRecent(token, { signal }),
      ])
      setSummary(nextSummary)
      setSessions(nextSessions)
    } catch (requestError) {
      if (requestError.status === 401) {
        logout()
        navigate('/login', { replace: true })
      } else if (requestError.name !== 'AbortError') {
        setError(requestError.message)
      }
    } finally {
      if (!signal.aborted) setIsLoading(false)
    }
  }, [token, logout, navigate])

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => loadDashboard(controller.signal))
    return () => controller.abort()
  }, [loadDashboard])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="header-inner">
          <Brand />
          <nav className="header-nav" aria-label="Main navigation">
            <span className="nav-current"><span className="nav-dot" />Dashboard</span>
            <Link className="nav-link" to="/job-profiles">Job Profiles</Link>
          </nav>
          <div className="header-account">
            <div className="account-copy">
              <span className="account-name">{user.name}</span>
              <span className="account-role">{user.role}</span>
            </div>
            <span className="avatar" aria-hidden="true">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <button type="button" className="button button-quiet" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="welcome-section">
          <div>
            <span className="eyebrow">YOUR PRACTICE SPACE</span>
            <h1>Welcome back, {user.name}<span className="welcome-period">.</span></h1>
            <p>Every great interview starts with showing up. You’re in the right place.</p>
          </div>
          <Link className="button button-primary dashboard-profile-action" to="/job-profiles">
            Job Profiles <span aria-hidden="true">→</span>
          </Link>
          <div className="welcome-date">
            <span className="date-icon" aria-hidden="true">◷</span>
            <span>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</span>
          </div>
        </section>

        <section className="stats-section" aria-label="Interview summary">
          <div className="section-heading">
            <div>
              <span className="eyebrow">AT A GLANCE</span>
              <h2>Your progress</h2>
            </div>
            <span className="summary-email">{user.email}</span>
          </div>
          {error && (
            <div className="dashboard-error" role="alert">
              <span>{error}</span>
              <button className="text-button" type="button" onClick={() => loadDashboard(new AbortController().signal)}>
                Try again
              </button>
            </div>
          )}
          {isLoading ? (
            <div className="dashboard-loading" role="status">Loading your dashboard...</div>
          ) : summary ? (
            <div className="stats-grid">
              <StatCard
                label="Total interviews"
                value={summary.total_sessions}
                note="Sessions started"
                icon="↗"
                tone="lavender"
              />
              <StatCard
                label="Completed"
                value={summary.completed_sessions}
                note="Ready for reflection"
                icon="✓"
                tone="mint"
              />
              <StatCard
                label="Average score"
                value={summary.average_score === null ? 'N/A' : Number(summary.average_score).toFixed(1)}
                note={summary.average_score === null ? 'Available after evaluation' : 'Across evaluated answers'}
                icon="✳"
                tone="peach"
              />
            </div>
          ) : null}
        </section>

        <section className="recent-section">
          <div className="section-heading recent-heading">
            <div>
              <span className="eyebrow">KEEP YOUR MOMENTUM</span>
              <h2>Recent sessions</h2>
            </div>
            {sessions?.length > 0 && (
              <span className="session-count">{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</span>
            )}
          </div>
          {isLoading ? (
            <div className="sessions-panel dashboard-loading" role="status">Loading recent sessions...</div>
          ) : sessions?.length ? (
            <div className="sessions-panel">
              <div className="session-table-head">
                <span>SESSION</span>
                <span>DATE &amp; TIME</span>
                <span>STATUS</span>
              </div>
              {sessions.map((session) => (
                <article className="session-row" key={session.id}>
                  <Link
                    to={`/interview/${session.id}`}
                    className="session-id session-link"
                    title={
                      session.status === 'IN_PROGRESS'
                        ? 'Resume practice interview'
                        : 'View practice interview'
                    }
                  >
                    <span className="session-symbol">↗</span> Practice session #{session.id}
                  </Link>
                  <time dateTime={session.started_at}>{formatDate(session.started_at)}</time>
                  <div className="session-row-status">
                    <span className={`status-pill status-pill--${session.status.toLowerCase().replace('_', '-')}`}>
                      <span className="status-dot" />
                      {session.status.replaceAll('_', ' ').toLowerCase()}
                    </span>
                    <Link
                      to={`/interview/${session.id}`}
                      className="button button-quiet button-sm session-action-btn"
                    >
                      {session.status === 'IN_PROGRESS' ? 'Resume →' : 'Review →'}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : sessions && !error ? (
            <div className="empty-state">
              <div className="empty-art" aria-hidden="true">
                <span className="empty-spark spark-a">✳</span>
                <span className="empty-spark spark-b">✦</span>
                <span className="empty-paper">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
              <h3>No interview sessions yet</h3>
              <p>Start your first practice interview to see your sessions and progress here.</p>
              <span className="coming-note">Your practice history will appear here when available.</span>
            </div>
          ) : null}
        </section>
        <footer className="dashboard-footer">
          <span>InSight <span aria-hidden="true">✳</span> A little practice goes a long way.</span>
          <span>Signed in as {user.email}</span>
        </footer>
      </main>
    </div>
  )
}
