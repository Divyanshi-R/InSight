import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Navbar } from '../components/Navbar'
import { getDashboardRecent, getDashboardSummary } from '../services/api'
import { formatRelativeTime } from '../utils/dateUtils'
import { evaluateStudentDashboard } from '../utils/evaluation'

export default function DashboardPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const loadDashboard = useCallback(
    async (signal) => {
      setIsLoading(true)
      setError('')
      try {
        const [nextSummary, nextSessions] = await Promise.all([
          getDashboardSummary(token, { signal }),
          getDashboardRecent(token, { signal }),
        ])
        setSummary(nextSummary)
        setSessions(nextSessions || [])
      } catch (requestError) {
        if (requestError.status === 401) {
          handleUnauthorized()
        } else if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Unable to load dashboard data.')
        }
      } finally {
        if (!signal.aborted) setIsLoading(false)
      }
    },
    [token, handleUnauthorized]
  )

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => loadDashboard(controller.signal))
    return () => controller.abort()
  }, [loadDashboard])

  // Compute honest dashboard metrics from student's actual session history
  const dashboardData = useMemo(() => {
    return evaluateStudentDashboard(summary, sessions || [])
  }, [summary, sessions])

  const sessionCount = summary?.total_sessions || sessions?.length || 0

  const sessionCountText = sessionCount === 0
    ? 'Ready for your first session'
    : sessionCount === 1
      ? '1 session completed so far'
      : `${sessionCount} sessions completed so far`

  // SVG Chart path calculation from real session scores
  const chartPoints = dashboardData.chartPoints || []
  const chartSvgPath = chartPoints.length > 1
    ? chartPoints
        .map((p, i) => {
          const x = 40 + (i / (chartPoints.length - 1)) * 420
          const y = Math.round(150 - (p.score / 100) * 110)
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
        })
        .join(' ')
    : 'M 40 100 L 460 100'

  return (
    <div className="poise-page-shell">
      <Navbar activePage="dashboard" />

      <main className="poise-dashboard-container">
        {/* Header Title matching Screenshot 4 */}
        <header className="poise-dash-header">
          <h1>Your interview readiness</h1>
          <p>
            {sessionCountText}. Track your mock interview progress and speech delivery diagnostics.
          </p>
        </header>

        {error && (
          <div className="poise-alert poise-alert-error" role="alert">
            <span>⚠️ {error}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => loadDashboard(new AbortController().signal)}
            >
              Retry
            </button>
          </div>
        )}

        {/* Row 1: Readiness Donut Card (Left) & Recommended Next Dark Card (Right) */}
        <section className="poise-dash-hero-row">
          {/* Readiness Donut Card */}
          <article className="poise-card poise-readiness-card">
            <div className="poise-donut-col">
              <div className="poise-donut-wrap">
                <svg viewBox="0 0 160 160" className="poise-donut-svg" aria-hidden="true">
                  <circle
                    cx="80"
                    cy="80"
                    r="64"
                    fill="none"
                    stroke="#ede8f5"
                    strokeWidth="14"
                  />
                  {dashboardData.hasEvaluation ? (
                    <circle
                      cx="80"
                      cy="80"
                      r="64"
                      fill="none"
                      stroke="#3b5bfd"
                      strokeWidth="14"
                      strokeDasharray={402}
                      strokeDashoffset={402 - (402 * dashboardData.averageScore) / 100}
                      strokeLinecap="round"
                      transform="rotate(-90 80 80)"
                    />
                  ) : (
                    <circle
                      cx="80"
                      cy="80"
                      r="64"
                      fill="none"
                      stroke="#cbd5e1"
                      strokeWidth="14"
                      strokeDasharray="6 8"
                      transform="rotate(-90 80 80)"
                    />
                  )}
                </svg>
                <div className="poise-donut-center">
                  <span className="poise-donut-score">
                    {dashboardData.hasEvaluation ? dashboardData.averageScore : '—'}
                  </span>
                  <span className="poise-donut-sub">
                    {dashboardData.hasEvaluation ? 'Average score' : 'Evaluation pending'}
                  </span>
                </div>
              </div>
            </div>

            <div className="poise-readiness-bars-col">
              <div className="poise-readiness-badges">
                {dashboardData.trendText ? (
                  <span className="poise-badge-green">{dashboardData.trendText}</span>
                ) : (
                  <span className="poise-badge-muted">
                    {dashboardData.hasEvaluation
                      ? 'Single scored session'
                      : 'Evaluations record when scoring engine completes'}
                  </span>
                )}
                <span className="poise-badge-muted">
                  {dashboardData.completedSessions} completed • {dashboardData.inProgressSessions} in progress
                </span>
              </div>

              <div className="poise-bars-list">
                <div className="poise-dash-bar-row">
                  <div className="poise-dash-bar-labels">
                    <span>Session completion</span>
                    <span>
                      {dashboardData.totalSessions > 0
                        ? `${Math.round((dashboardData.completedSessions / dashboardData.totalSessions) * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="poise-track">
                    <div
                      className="poise-fill"
                      style={{
                        width: `${
                          dashboardData.totalSessions > 0
                            ? Math.round((dashboardData.completedSessions / dashboardData.totalSessions) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="poise-dash-bar-row">
                  <div className="poise-dash-bar-labels">
                    <span>Speech pace tracking</span>
                    <span className="poise-badge-inline">Active</span>
                  </div>
                  <p className="poise-dash-sublabel">
                    Measures words per minute against standard 120–160 WPM target.
                  </p>
                </div>

                <div className="poise-dash-bar-row">
                  <div className="poise-dash-bar-labels">
                    <span>Filler word detection</span>
                    <span className="poise-badge-inline">Active</span>
                  </div>
                  <p className="poise-dash-sublabel">
                    Monitors 11 common conversational filler words in real time.
                  </p>
                </div>

                <div className="poise-dash-bar-row">
                  <div className="poise-dash-bar-labels">
                    <span>Content rubric evaluation</span>
                    <span className={`poise-badge-inline ${dashboardData.hasEvaluation ? 'badge-active' : 'badge-pending'}`}>
                      {dashboardData.hasEvaluation ? 'Scored' : 'Pending'}
                    </span>
                  </div>
                  <p className="poise-dash-sublabel">
                    Semantic scoring of STAR structure awaits evaluation engine.
                  </p>
                </div>
              </div>
            </div>
          </article>

          {/* Recommended Next Dark Card matching Screenshot 4 */}
          <article className="poise-recommended-dark-card">
            <span className="poise-rec-eyebrow">PRACTICE INTERVIEW</span>
            <h2>{dashboardData.recommendedRole}</h2>
            <p>
              Launch a timed practice round with live speech pacing, filler tracking, and interview audio playback.
            </p>
            <Link className="button poise-btn-white" to="/interview/new">
              Start new session
            </Link>
          </article>
        </section>

        {/* Row 2: Confidence Over Time Chart (Left) & Recent Sessions (Right) */}
        <section className="poise-dash-middle-row">
          {/* Confidence Over Time Card */}
          <article className="poise-card poise-trend-chart-card">
            <div className="poise-chart-top">
              <h2>Evaluation score history</h2>
              <span className="poise-chart-subtitle">
                {chartPoints.length > 1
                  ? `Across ${chartPoints.length} scored sessions`
                  : 'Requires scored sessions'}
              </span>
            </div>

            {chartPoints.length > 1 ? (
              <div className="poise-chart-svg-wrap">
                <svg viewBox="0 0 520 180" className="poise-dash-trend-svg" aria-hidden="true">
                  <line x1="20" y1="40" x2="500" y2="40" stroke="#f1ecf7" strokeWidth="1" />
                  <line x1="20" y1="95" x2="500" y2="95" stroke="#f1ecf7" strokeWidth="1" />
                  <line x1="20" y1="150" x2="500" y2="150" stroke="#f1ecf7" strokeWidth="1" />
                  <path
                    d={chartSvgPath}
                    fill="none"
                    stroke="#3b5bfd"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {chartPoints.map((p, i) => {
                    const x = 40 + (i / Math.max(1, chartPoints.length - 1)) * 420
                    const y = Math.round(150 - (p.score / 100) * 110)
                    const isLatest = i === chartPoints.length - 1
                    return isLatest ? (
                      <circle
                        key={p.label}
                        cx={x}
                        cy={y}
                        r="7"
                        fill="#ffffff"
                        stroke="#3b5bfd"
                        strokeWidth="3.5"
                      />
                    ) : (
                      <circle key={p.label} cx={x} cy={y} r="4.5" fill="#3b5bfd" />
                    )
                  })}
                </svg>
              </div>
            ) : (
              <div className="poise-chart-empty-state">
                <p>Score trend chart will plot your progress once multiple evaluated sessions are recorded in the database.</p>
                <span className="poise-empty-badge">
                  {dashboardData.totalSessions} total session{dashboardData.totalSessions === 1 ? '' : 's'} launched
                </span>
              </div>
            )}
          </article>

          {/* Recent Sessions List Card matching Screenshot 4 */}
          <article className="poise-card poise-recent-sessions-card">
            <h2>Recent sessions</h2>

            {isLoading ? (
              <div className="poise-recent-loading">Loading recent sessions...</div>
            ) : sessions && sessions.length > 0 ? (
              <div className="poise-recent-list">
                {sessions.slice(0, 4).map((session) => {
                  const roleName = session.job_title || `Interview session #${session.id}`
                  const isCompleted = session.status === 'COMPLETED'
                  const targetUrl = isCompleted
                    ? `/interview/${session.id}/report`
                    : `/interview/${session.id}`

                  return (
                    <Link
                      key={session.id}
                      to={targetUrl}
                      className="poise-recent-item"
                    >
                      <div className="poise-recent-item-info">
                        <span className="poise-recent-role-name">{roleName}</span>
                        <span className="poise-recent-time-sub">
                          {formatRelativeTime(session.started_at)} • {isCompleted ? 'Completed' : 'In progress'}
                        </span>
                      </div>
                      {session.score != null ? (
                        <span className="poise-recent-score-badge">Score: {Math.round(session.score)}</span>
                      ) : (
                        <span className={`poise-recent-status-pill ${isCompleted ? 'status-pill-completed' : 'status-pill-in-progress'}`}>
                          {isCompleted ? 'Recorded' : 'In progress'}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="poise-empty-recent-state">
                <p>No interview sessions started yet.</p>
                <Link to="/interview/new" className="button poise-btn-primary poise-btn-sm">
                  Start your first mock interview →
                </Link>
              </div>
            )}
          </article>
        </section>

        {/* Row 3: Targeted Drills From Your Last Report matching Screenshot 4 */}
        <section className="poise-drills-section">
          <h2 className="poise-drills-heading">Targeted drills from your last report</h2>

          <div className="poise-drills-grid">
            {/* Drill 1: Delivery */}
            <article className="poise-card poise-drill-card">
              <span className="poise-drill-eyebrow">DELIVERY</span>
              <h3>Filler word reset</h3>
              <p>Practice speaking with clean openings and pausing silently when thinking.</p>
              <Link className="poise-drill-link" to="/interview/new">
                10 min drill
              </Link>
            </article>

            {/* Drill 2: Structure */}
            <article className="poise-card poise-drill-card">
              <span className="poise-drill-eyebrow">STRUCTURE</span>
              <h3>Answer with the STAR method</h3>
              <p>Structure your responses with Situation, Task, Actions, and measurable Results.</p>
              <Link className="poise-drill-link" to="/interview/new">
                15 min drill
              </Link>
            </article>

            {/* Drill 3: Composure */}
            <article className="poise-card poise-drill-card">
              <span className="poise-drill-eyebrow">COMPOSURE</span>
              <h3>Handle a curveball question</h3>
              <p>Take a 2-second pause when challenged before restating your reasoning.</p>
              <Link className="poise-drill-link" to="/interview/new">
                12 min drill
              </Link>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}
