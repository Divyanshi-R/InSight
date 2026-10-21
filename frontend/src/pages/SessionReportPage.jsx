import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Navbar } from '../components/Navbar'
import { evaluateInterviewSession, getInterview } from '../services/api'
import { evaluateSession, formatDuration } from '../utils/evaluation'
import { formatDateTime } from '../utils/dateUtils'

export default function SessionReportPage() {
  const { token, logout } = useAuth()
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evalError, setEvalError] = useState('')
  const [error, setError] = useState('')
  const [expandedSampleIdx, setExpandedSampleIdx] = useState(null)

  const interviewSettings = useMemo(() => {
    try {
      const stored =
        sessionStorage.getItem(`insight_interview_settings_${sessionId}`) ||
        sessionStorage.getItem('insight_interview_settings')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }, [sessionId])

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const handleEvaluate = useCallback(async () => {
    setIsEvaluating(true)
    setEvalError('')
    try {
      await evaluateInterviewSession(token, sessionId)
      const refreshed = await getInterview(token, sessionId)
      setSession(refreshed)
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized()
        return
      }
      setEvalError(err.message || 'Evaluation request failed. Ensure AI provider is configured and available.')
    } finally {
      setIsEvaluating(false)
    }
  }, [token, sessionId, handleUnauthorized])

  useEffect(() => {
    async function fetchSession() {
      setIsLoading(true)
      try {
        const data = await getInterview(token, sessionId)
        setSession(data)
      } catch (err) {
        if (err.status === 401) {
          handleUnauthorized()
        } else {
          setError(err.message || 'Unable to load session report.')
        }
      } finally {
        setIsLoading(false)
      }
    }
    fetchSession()
  }, [token, sessionId, handleUnauthorized])

  // Derive honest delivery metrics and evaluation status from actual session data
  const analysis = useMemo(() => {
    if (!session) return null
    return evaluateSession(session)
  }, [session])


  if (isLoading) {
    return (
      <div className="poise-page-shell">
        <Navbar activePage="reports" />
        <main className="poise-report-container poise-loading-state">
          <p>Compiling session delivery metrics and transcript records...</p>
        </main>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="poise-page-shell">
        <Navbar activePage="reports" />
        <main className="poise-report-container poise-error-state">
          <h2>Report not found</h2>
          <p>{error || 'Unable to retrieve session data.'}</p>
          <Link className="button poise-btn-primary" to="/dashboard">
            Return to Dashboard
          </Link>
        </main>
      </div>
    )
  }

  const roleTitle = session.job_title || 'Mock interview session'
  const totalQuestions = session.questions?.length || 0
  const answeredCount = analysis?.answeredCount || 0

  // Calculate SVG timeline points mapped to real WPM measurements
  // Y coordinate range in 160-height SVG space: 25 (fast, 200 WPM) to 135 (slow, 60 WPM)
  const points = (analysis?.timelinePoints || []).map((p) => {
    const wpmVal = p.wpm != null ? p.wpm : 0
    const yVal =
      p.hasAnswer && p.wpm != null
        ? Math.max(25, Math.min(135, Math.round(150 - (wpmVal / 200) * 120)))
        : 100
    return {
      ...p,
      yVal,
    }
  })

  const svgPathData =
    points.length > 1
      ? points
          .map((p, i) => {
            const x = 50 + (i / (points.length - 1)) * 800
            const y = p.yVal
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
          })
          .join(' ')
      : 'M 50 80 L 850 80'

  return (
    <div className="poise-page-shell">
      <Navbar activePage="reports" />

      <main className="poise-report-container">
        {/* Report Header matching Screenshot 3 */}
        <header className="poise-report-header">
          <div>
            <h1>Session report</h1>
            <p className="poise-report-meta">
              {roleTitle} • {session.started_at ? `${formatDateTime(session.started_at)} • ` : ''}
              {interviewSettings?.interviewType || 'Behavioral'} round • {interviewSettings?.interviewLength || '25 min'} • {totalQuestions} questions ({answeredCount} answered)
            </p>
          </div>
          <div className="poise-report-top-actions">
            {analysis?.hasAnswers && (
              <button
                type="button"
                className={`button ${analysis.hasEvaluations ? 'poise-btn-outline' : 'poise-btn-primary'}`}
                onClick={handleEvaluate}
                disabled={isEvaluating}
              >
                {isEvaluating
                  ? 'Evaluating with AI...'
                  : analysis.hasEvaluations
                  ? 'Re-evaluate with AI'
                  : 'Evaluate with AI'}
              </button>
            )}
            <Link className="button poise-btn-outline" to={`/interview/${session.id}`}>
              Replay session
            </Link>
            <Link className="button poise-btn-primary" to="/interview/new">
              Practice again
            </Link>
          </div>
        </header>

        {evalError && (
          <div className="poise-alert poise-alert-error" role="alert" style={{ marginBottom: 20 }}>
            <span>⚠️ {evalError}</span>
            <button type="button" className="text-button" onClick={handleEvaluate}>
              Retry evaluation
            </button>
          </div>
        )}

        {isEvaluating && (
          <div className="poise-evaluating-card">
            <div className="poise-evaluating-spinner" />
            <div>
              <h3>Evaluating answers against AI rubric...</h3>
              <p>
                Assessing relevance, technical completeness, articulation clarity, and STAR structure across all recorded responses.
              </p>
            </div>
          </div>
        )}

        {!isEvaluating && !analysis?.hasEvaluations && analysis?.hasAnswers && (
          <div className="poise-evaluation-prompt-card">
            <div>
              <h3>AI Rubric Evaluation Ready</h3>
              <p>
                Get structured 0–100 scores across relevance, technical depth, clarity, and STAR structure with evidence citations and actionable advice.
              </p>
            </div>
            <button
              type="button"
              className="button poise-btn-primary"
              onClick={handleEvaluate}
            >
              Evaluate session with AI
            </button>
          </div>
        )}

        {/* Row 1: Session Delivery Summary & Diagnostics Breakdown */}
        <section className="poise-score-hero-row">
          {/* Content / Delivery Summary Hero Card */}
          <article className="poise-card poise-confidence-card">
            <span className="poise-card-eyebrow">
              {analysis?.hasEvaluations ? 'CONTENT RUBRIC OVERALL SCORE' : 'SPEECH DELIVERY SUMMARY'}
            </span>
            <div className="poise-score-display">
              <span className="poise-big-score">
                {analysis?.hasEvaluations
                  ? `${analysis.evaluationScore}`
                  : analysis?.avgWpm
                  ? `${analysis.avgWpm}`
                  : '—'}
              </span>
              <span className="poise-score-trend-badge">
                {analysis?.hasEvaluations
                  ? analysis.evaluationScore >= 85
                    ? 'Strong performance'
                    : analysis.evaluationScore >= 70
                    ? 'Proficient'
                    : 'Needs practice'
                  : analysis?.avgWpm
                  ? analysis.avgWpm >= 120 && analysis.avgWpm <= 160
                    ? 'Target pace (120–160 WPM)'
                    : analysis.avgWpm > 165
                    ? 'Paced quickly'
                    : 'Deliberate pace'
                  : 'Awaiting responses'}
              </span>
            </div>
            <p className="poise-confidence-summary">
              {analysis?.hasEvaluations
                ? `Calculated from verified AI rubric scoring across ${answeredCount} responses. Weights: 30% Relevance + 25% Completeness + 25% Clarity + 20% Structure.`
                : analysis?.hasAnswers
                ? `Candidate spoke ${analysis.totalWords} words across ${analysis.answeredCount} answered questions (${formatDuration(analysis.totalDurationSeconds)} total audio recorded). Average response depth was ${analysis.avgWordsPerAnswer} words.`
                : 'No candidate answers were recorded for this session. Complete a practice round to generate delivery diagnostics.'}
            </p>
          </article>

          {/* Diagnostics / Rubric Breakdown Card */}
          <article className="poise-card poise-breakdown-card">
            <h2 className="poise-section-title">
              {analysis?.hasEvaluations ? 'Content rubric breakdown (0–100)' : 'Delivery diagnostics & evaluation status'}
            </h2>

            {analysis?.hasEvaluations ? (
              <>
                {/* Rubric Metric 1: Relevance */}
                <div className="poise-metric-bar-group">
                  <div className="poise-metric-bar-header">
                    <span className="poise-metric-title">Question relevance (30% weight)</span>
                    <span className="poise-metric-score">{analysis.avgRelevance ?? 0}%</span>
                  </div>
                  <div className="poise-track">
                    <div className="poise-fill" style={{ width: `${analysis.avgRelevance ?? 0}%` }} />
                  </div>
                  <span className="poise-metric-subtext">
                    Measures how directly and specifically responses address prompt requirements with pertinent examples.
                  </span>
                </div>

                {/* Rubric Metric 2: Completeness / Technical Depth */}
                <div className="poise-metric-bar-group">
                  <div className="poise-metric-bar-header">
                    <span className="poise-metric-title">Technical completeness &amp; depth (25% weight)</span>
                    <span className="poise-metric-score">{analysis.avgCompleteness ?? 0}%</span>
                  </div>
                  <div className="poise-track">
                    <div className="poise-fill" style={{ width: `${analysis.avgCompleteness ?? 0}%` }} />
                  </div>
                  <span className="poise-metric-subtext">
                    Evaluates depth, domain nuances, mechanisms, and factual/technical accuracy where assessable.
                  </span>
                </div>

                {/* Rubric Metric 3: Clarity */}
                <div className="poise-metric-bar-group">
                  <div className="poise-metric-bar-header">
                    <span className="poise-metric-title">Clarity &amp; articulation (25% weight)</span>
                    <span className="poise-metric-score">{analysis.avgClarity ?? 0}%</span>
                  </div>
                  <div className="poise-track">
                    <div className="poise-fill" style={{ width: `${analysis.avgClarity ?? 0}%` }} />
                  </div>
                  <span className="poise-metric-subtext">
                    Evaluates precise phrasing, terminology accuracy, and smooth conceptual flow.
                  </span>
                </div>

                {/* Rubric Metric 4: Structure */}
                <div className="poise-metric-bar-group">
                  <div className="poise-metric-bar-header">
                    <span className="poise-metric-title">Structure &amp; STAR method (20% weight)</span>
                    <span className="poise-metric-score">{analysis.avgStructure ?? 0}%</span>
                  </div>
                  <div className="poise-track">
                    <div className="poise-fill" style={{ width: `${analysis.avgStructure ?? 0}%` }} />
                  </div>
                  <span className="poise-metric-subtext">
                    Measures organized progression (Situation, Task, Action, Result for behavioral; Problem-Solution-Impact for technical).
                  </span>
                </div>
              </>
            ) : (
              <>
                {/* Metric 1: Speech Pacing */}
                <div className="poise-metric-bar-group">
                  <div className="poise-metric-bar-header">
                    <span className="poise-metric-title">Speaking pace</span>
                    <span className="poise-metric-score">
                      {analysis?.avgWpm ? `${analysis.avgWpm} WPM` : 'N/A'}
                    </span>
                  </div>
                  <div className="poise-track">
                    <div
                      className="poise-fill"
                      style={{
                        width: `${analysis?.avgWpm ? Math.min(100, Math.round((analysis.avgWpm / 180) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="poise-metric-subtext">
                    Formula: (words / duration in seconds) × 60. Standard conversational target is 120–160 WPM.
                  </span>
                </div>

                {/* Metric 2: Filler Word Density */}
                <div className="poise-metric-bar-group">
                  <div className="poise-metric-bar-header">
                    <span className="poise-metric-title">Filler word density</span>
                    <span className="poise-metric-score">
                      {analysis?.totalFillers ?? 0} fillers
                    </span>
                  </div>
                  <div className="poise-track">
                    <div
                      className="poise-fill"
                      style={{
                        width: `${Math.min(100, (analysis?.totalFillers || 0) * 12)}%`,
                      }}
                    />
                  </div>
                  <span className="poise-metric-subtext">
                    Monitors common fillers (um, uh, like, actually, basically). Density: {analysis?.fillersPer100Words ?? 0} per 100 words.
                  </span>
                </div>

                {/* Metric 3: Response Depth & Length */}
                <div className="poise-metric-bar-group">
                  <div className="poise-metric-bar-header">
                    <span className="poise-metric-title">Response depth &amp; length</span>
                    <span className="poise-metric-score">
                      {analysis?.avgWordsPerAnswer ?? 0} words/avg
                    </span>
                  </div>
                  <div className="poise-track">
                    <div
                      className="poise-fill"
                      style={{
                        width: `${Math.min(100, Math.round(((analysis?.avgWordsPerAnswer || 0) / 120) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="poise-metric-subtext">
                    Total {analysis?.totalWords ?? 0} words across {answeredCount} responses. 60–180 words provide structured context and results.
                  </span>
                </div>

                {/* Metric 4: Content Rubric Scoring Policy */}
                <div className="poise-metric-bar-group">
                  <div className="poise-metric-bar-header">
                    <span className="poise-metric-title">Content rubric evaluation</span>
                    <span className="poise-badge-inline">
                      {analysis?.evaluationStatus === 'scored' ? `Score: ${analysis.evaluationScore}` : 'Pending'}
                    </span>
                  </div>
                  <span className="poise-metric-subtext">
                    {analysis?.evaluationStatus === 'scored'
                      ? 'Score verified from session evaluation record.'
                      : 'Automated AI scoring of answer content and STAR structure is awaiting evaluation run.'}
                  </span>
                </div>
              </>
            )}
          </article>
        </section>


        {/* Row 2: Delivery Timeline Chart Across Questions */}
        <section className="poise-card poise-timeline-chart-card" aria-label="Delivery pacing timeline">
          <div className="poise-chart-header">
            <h2 className="poise-section-title">Delivery pacing timeline across questions</h2>
            <span className="poise-chart-legend">
              Measured speaking pace (WPM) per question. Target band is 120–160 WPM.
            </span>
          </div>

          <div className="poise-chart-area">
            {/* SVG Real Trend Wave */}
            <svg viewBox="0 0 900 160" className="poise-trend-svg" aria-hidden="true">
              <defs>
                <linearGradient id="chartLineGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#4361ee" />
                  <stop offset="100%" stopColor="#3a0ca3" />
                </linearGradient>
              </defs>

              {/* Grid lines: 160 WPM line (top band), 120 WPM line (bottom band), baseline */}
              <line x1="40" y1="45" x2="860" y2="45" stroke="#e0e7ff" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="40" y1="85" x2="860" y2="85" stroke="#e0e7ff" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="40" y1="135" x2="860" y2="135" stroke="#f0ecf7" strokeWidth="1" />

              {/* Dynamic Path */}
              {answeredCount > 0 && (
                <path
                  d={svgPathData}
                  fill="none"
                  stroke="url(#chartLineGrad)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Dynamic Markers */}
              {points.map((p, i) => {
                const x = 50 + (i / Math.max(1, points.length - 1)) * 800
                const y = p.yVal
                const isOptimal = p.wpm !== null && p.wpm >= 120 && p.wpm <= 160
                return (
                  <circle
                    key={p.index}
                    cx={x}
                    cy={y}
                    r="6.5"
                    fill={p.hasAnswer ? (isOptimal ? '#10b981' : '#f59e0b') : '#94a3b8'}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                )
              })}
            </svg>

            {/* Real Flag Callouts */}
            {points.map((p, i) => {
              if (!p.flag) return null
              const leftPct = 6 + (i / Math.max(1, points.length - 1)) * 86
              const topPx = Math.max(10, Math.min(110, p.yVal - 35))
              const flagClass = p.flag.type === 'filler' ? 'poise-flag--filler' : 'poise-flag--pause'

              return (
                <div
                  key={p.index}
                  className={`poise-flag ${flagClass}`}
                  style={{ left: `${leftPct}%`, top: `${topPx}px` }}
                >
                  <span>Q{p.index}: {p.flag.text}</span>
                </div>
              )
            })}
          </div>

          <div className="poise-chart-time-axis">
            <span>Question 1</span>
            <span>Midpoint</span>
            <span>Question {totalQuestions}</span>
          </div>
        </section>

        {/* Row 3: Feedback by question (Left) & Strengths/Next Drill (Right) */}
        <div className="poise-feedback-row">
          {/* Left Column: Feedback by question */}
          <section className="poise-questions-feedback-col">
            <h2 className="poise-column-title">Recorded answers &amp; delivery diagnostics</h2>

            {analysis?.questionsFeedback.map((item, idx) => (
              <article key={item.id} className="poise-card poise-question-feedback-card">
                <div className="poise-q-feedback-header">
                  <h3>{item.prompt}</h3>
                  <span className="poise-q-score-badge">
                    {item.evaluation
                      ? `Score: ${Math.round(item.evaluation.overall_score)}/100 • ${item.wpm ? `${item.wpm} WPM` : 'Recorded'} • ${item.wordCount} words`
                      : item.hasAnswer
                      ? `${item.wpm ? `${item.wpm} WPM` : 'Recorded'} • ${item.wordCount} words • ${item.fillerCount} fillers`
                      : 'Unanswered'}
                  </span>
                </div>

                {item.evaluation && (
                  <div className="poise-eval-score-grid">
                    <div className="poise-eval-score-pill">
                      <span className="poise-eval-pill-label">Relevance (30%)</span>
                      <span className="poise-eval-pill-score">{Math.round(item.evaluation.relevance_score)}%</span>
                    </div>
                    <div className="poise-eval-score-pill">
                      <span className="poise-eval-pill-label">Completeness (25%)</span>
                      <span className="poise-eval-pill-score">{Math.round(item.evaluation.completeness_score)}%</span>
                    </div>

                    <div className="poise-eval-score-pill">
                      <span className="poise-eval-pill-label">Clarity (25%)</span>
                      <span className="poise-eval-pill-score">{Math.round(item.evaluation.clarity_score)}%</span>
                    </div>
                    <div className="poise-eval-score-pill">
                      <span className="poise-eval-pill-label">Structure (20%)</span>
                      <span className="poise-eval-pill-score">{Math.round(item.evaluation.structure_score)}%</span>
                    </div>
                  </div>
                )}

                {item.evaluation && (
                  <div className="poise-ai-feedback-section">
                    <div className="poise-ai-feedback-block">
                      <strong>AI Evidence &amp; Evaluation</strong>
                      <span>{item.evaluation.feedback}</span>
                    </div>
                    {item.evaluation.strengths && (
                      <div className="poise-ai-feedback-block">
                        <strong>Observed Strengths</strong>
                        <span>{item.evaluation.strengths}</span>
                      </div>
                    )}
                    {item.evaluation.improvements && (
                      <div className="poise-ai-feedback-block">
                        <strong>Actionable Improvements</strong>
                        <span>{item.evaluation.improvements}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="poise-feedback-points">
                  <p>
                    <strong>Speaking pace.</strong> {item.pacingObservation}
                  </p>
                  <p>
                    <strong>Filler words.</strong> {item.fillerObservation}
                  </p>
                </div>

                {item.hasAnswer && (
                  <div className="poise-candidate-answer-box">
                    <span className="candidate-answer-label">Candidate recorded transcript:</span>
                    <p className="candidate-answer-quote">"{item.candidateAnswer}"</p>
                    <span className="candidate-answer-sub">
                      Length: {item.wordCount} words • Duration: {item.durationSeconds ? `${item.durationSeconds}s` : 'N/A'} • Fillers: {item.fillerCount}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  className="text-button poise-sample-answer-btn"
                  onClick={() => setExpandedSampleIdx(expandedSampleIdx === idx ? null : idx)}
                >
                  {expandedSampleIdx === idx ? 'Hide reference guide' : 'View STAR method reference guide'}
                </button>

                {expandedSampleIdx === idx && (
                  <div className="poise-sample-answer-card">
                    <span className="sample-tag">EDUCATIONAL REFERENCE (STAR STRUCTURE TEMPLATE)</span>
                    <p style={{ whiteSpace: 'pre-line' }}>{item.sampleAnswer}</p>
                  </div>
                )}
              </article>
            ))}

          </section>

          {/* Right Column: Strengths, Focus next, Next Practice Drill */}
          <aside className="poise-recommendations-col">
            <article className="poise-card poise-recommendation-card">
              <h2 className="poise-section-title">Delivery strengths</h2>
              <p>{analysis?.deliveryStrengths}</p>
            </article>

            <article className="poise-card poise-recommendation-card">
              <h2 className="poise-section-title">Delivery focus</h2>
              <p>{analysis?.deliveryFocus}</p>
            </article>

            {/* Next Drill Card tailored to lowest area */}
            <article className="poise-dark-drill-card">
              <h2>Recommended next drill</h2>
              {analysis?.totalFillers > 3 ? (
                <>
                  <p>Filler word reset. Practice clean sentence openings and silent pauses.</p>
                </>
              ) : analysis?.avgWpm !== null && analysis.avgWpm > 165 ? (
                <>
                  <p>Cadence pacing drill. Practice inserting breaths after each key point.</p>
                </>
              ) : (
                <>
                  <p>STAR method structure drill. Practice closing each story with quantifiable results.</p>
                </>
              )}
              <Link className="button poise-btn-white" to="/interview/new">
                Start practice session
              </Link>
            </article>
          </aside>
        </div>
      </main>
    </div>
  )
}
