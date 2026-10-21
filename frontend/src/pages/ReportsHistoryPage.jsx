import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Navbar } from '../components/Navbar'
import { getDashboardSummary, getUserInterviews } from '../services/api'
import { formatDateTime } from '../utils/dateUtils'

const PAGE_SIZE = 10

function parseRoleAndCompany(jobTitle) {
  if (!jobTitle) return { role: 'Interview session', company: null }
  const parts = jobTitle.split(' - ')
  if (parts.length > 1) {
    const company = parts.slice(1).join(' - ').trim()
    const role = parts[0].trim()
    return { role: role || 'Interview session', company: company || null }
  }
  return { role: jobTitle.trim(), company: null }
}

export default function ReportsHistoryPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  const [summary, setSummary] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const loadData = useCallback(async (signal) => {
    setIsLoading(true)
    setError('')
    try {
      const [sum, userInterviews] = await Promise.all([
        getDashboardSummary(token, { signal }),
        getUserInterviews(token, { signal }),
      ])
      setSummary(sum)
      setSessions(userInterviews || [])
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized()
      } else if (err.name !== 'AbortError') {
        setError(err.message || 'Unable to load report history.')
      }
    } finally {
      if (!signal.aborted) setIsLoading(false)
    }
  }, [token, handleUnauthorized])

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => loadData(controller.signal))
    return () => controller.abort()
  }, [loadData])

  return (
    <div className="poise-page-shell">
      <Navbar activePage="reports" />

      <main className="poise-history-container">
        <header className="poise-history-header">
          <div>
            <h1>Session reports</h1>
            <p>Every completed mock interview generates detailed feedback, vocal analysis, and actionable drills.</p>
          </div>
          <Link className="button poise-btn-primary" to="/interview/new">
            Start new interview
          </Link>
        </header>

        {error && (
          <div className="poise-alert poise-alert-error" role="alert">
            <span>⚠️ {error}</span>
            <button type="button" className="text-button" onClick={() => loadData(new AbortController().signal)}>
              Retry
            </button>
          </div>
        )}

        {/* Overview Stats */}
        {summary && (
          <section className="poise-history-stats-grid">
            <article className="poise-card poise-stat-mini-card">
              <span className="poise-stat-label">Total interviews</span>
              <span className="poise-stat-number">{summary.total_sessions}</span>
              <span className="poise-stat-sub">Sessions launched</span>
            </article>

            <article className="poise-card poise-stat-mini-card">
              <span className="poise-stat-label">Completed sessions</span>
              <span className="poise-stat-number">{summary.completed_sessions}</span>
              <span className="poise-stat-sub">With comprehensive analysis</span>
            </article>

            <article className="poise-card poise-stat-mini-card">
              <span className="poise-stat-label">Average evaluation</span>
              <span className="poise-stat-number">
                {summary.average_score !== null && summary.average_score !== undefined
                  ? Math.round(summary.average_score)
                  : '—'}
              </span>
              <span className="poise-stat-sub">
                {summary.average_score !== null && summary.average_score !== undefined
                  ? 'Average score'
                  : 'Awaiting evaluated sessions'}
              </span>
            </article>
          </section>
        )}

        {/* Sessions list */}
        <section className="poise-card poise-history-list-card">
          <div className="poise-history-table-header">
            <span>Interview session</span>
            <span>Date &amp; time</span>
            <span>Status</span>
            <span>Report action</span>
          </div>

          {isLoading ? (
            <div className="poise-history-loading">Loading your session reports...</div>
          ) : sessions && sessions.length > 0 ? (
            <>
              <div className="poise-history-rows">
                {sessions.slice(0, visibleCount).map((session) => {
                  const isCompleted = session.status === 'COMPLETED'
                  const displayScore = session.score != null ? Math.round(session.score) : null
                  const { role, company } = parseRoleAndCompany(session.job_title)

                  return (
                    <article key={session.id} className="poise-history-row">
                      <div className="poise-history-role-cell">
                        <span className="poise-history-title">{role}</span>
                        {company && (
                          <span className="poise-history-company-tag" title={`Company: ${company}`}>
                            🏢 {company}
                          </span>
                        )}
                        <span className="poise-history-meta-sub">
                          Session #{session.id} • {isCompleted ? 'Standard round' : 'In progress'}
                        </span>
                      </div>

                      <div className="poise-history-date-cell">
                        <time dateTime={session.started_at}>{formatDateTime(session.started_at)}</time>
                      </div>

                      <div className="poise-history-status-cell">
                        <span className={`status-pill status-pill--${session.status.toLowerCase().replace('_', '-')}`}>
                          <span className="status-dot" />
                          {session.status.replace('_', ' ').toLowerCase()}
                        </span>
                        {isCompleted && displayScore !== null && (
                          <span className="poise-history-score-chip" title="Session evaluation score">
                            Score: {displayScore}
                          </span>
                        )}
                      </div>

                      <div className="poise-history-action-cell">
                        {isCompleted ? (
                          <Link
                            to={`/interview/${session.id}/report`}
                            className="button poise-btn-outline poise-btn-sm"
                          >
                            View report →
                          </Link>
                        ) : (
                          <Link
                            to={`/interview/${session.id}`}
                            className="button poise-btn-primary poise-btn-sm"
                          >
                            Resume room →
                          </Link>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>

              {sessions.length > visibleCount && (
                <div className="poise-history-load-more-wrap">
                  <button
                    type="button"
                    className="button poise-btn-outline poise-history-load-more-btn"
                    onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  >
                    Load more ({sessions.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="poise-empty-history">
              <span className="poise-empty-icon" aria-hidden="true">📋</span>
              <h3>No interview reports yet</h3>
              <p>Set up and complete your first mock interview to view comprehensive analysis and feedback.</p>
              <Link to="/interview/new" className="button poise-btn-primary">
                Start your first interview
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
