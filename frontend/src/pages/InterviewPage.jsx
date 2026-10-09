import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  completeInterview,
  getInterview,
  saveInterviewAnswer,
} from '../services/api'

function formatDate(value) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function InterviewPage() {
  const { token, user, logout } = useAuth()
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const loadSession = useCallback(
    async (signal) => {
      setIsLoading(true)
      setError('')
      try {
        const data = await getInterview(token, sessionId, { signal })
        setSession(data)

        if (data.status === 'IN_PROGRESS' && data.questions?.length > 0) {
          // Deterministic resume: resume at first unanswered question
          const firstUnanswered = data.questions.findIndex((q) => !q.answered)
          const resumeIdx = firstUnanswered !== -1 ? firstUnanswered : 0
          setCurrentIndex(resumeIdx)
          setCurrentAnswer(data.questions[resumeIdx]?.answer || '')
        } else if (data.questions?.length > 0) {
          setCurrentIndex(0)
          setCurrentAnswer(data.questions[0]?.answer || '')
        }
      } catch (err) {
        if (err.status === 401) {
          handleUnauthorized()
        } else if (err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false)
        }
      }
    },
    [token, sessionId, handleUnauthorized]
  )

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => loadSession(controller.signal))
    return () => controller.abort()
  }, [loadSession])

  const persistCurrentAnswer = useCallback(
    async (targetQuestionId, textToSave) => {
      if (!session || !targetQuestionId) return true
      setIsSaving(true)
      setSaveMessage('Saving...')
      try {
        const updated = await saveInterviewAnswer(
          token,
          session.id,
          targetQuestionId,
          textToSave
        )
        setSession((prev) => {
          if (!prev) return prev
          const nextQuestions = prev.questions.map((q) =>
            q.id === targetQuestionId
              ? { ...q, answer: updated.answer, answered: updated.answered }
              : q
          )
          const nextAnsweredCount = nextQuestions.filter((q) => q.answered).length
          return {
            ...prev,
            questions: nextQuestions,
            answered_count: nextAnsweredCount,
          }
        })
        setSaveMessage('Saved')
        setTimeout(() => setSaveMessage(''), 2000)
        return true
      } catch (err) {
        if (err.status === 401) {
          handleUnauthorized()
        } else {
          setSaveMessage('Failed to save answer')
        }
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [session, token, handleUnauthorized]
  )

  async function handleNavigate(nextIndex) {
    if (!session || nextIndex < 0 || nextIndex >= session.questions.length) return

    const currentQ = session.questions[currentIndex]
    if (currentQ) {
      const trimmedCurrent = currentAnswer.trim()
      const existingAnswer = (currentQ.answer || '').trim()
      if (trimmedCurrent !== existingAnswer) {
        await persistCurrentAnswer(currentQ.id, currentAnswer)
      }
    }

    setCurrentIndex(nextIndex)
    setCurrentAnswer(session.questions[nextIndex]?.answer || '')
    setSaveMessage('')
  }

  async function handleManualSave() {
    const currentQ = session?.questions[currentIndex]
    if (!currentQ) return
    await persistCurrentAnswer(currentQ.id, currentAnswer)
  }

  async function handleFinish() {
    if (!session) return
    const confirmed = window.confirm(
      'Finish this practice interview? Once completed, your answers will be finalized.'
    )
    if (!confirmed) return

    setIsFinishing(true)
    setError('')
    try {
      const currentQ = session.questions[currentIndex]
      if (currentQ) {
        await persistCurrentAnswer(currentQ.id, currentAnswer)
      }

      const completed = await completeInterview(token, session.id)
      setSession(completed)
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized()
      } else {
        setError(err.message)
      }
    } finally {
      setIsFinishing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="dashboard-shell">
        <main className="screen-loader" role="status">
          Loading interview session...
        </main>
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className="dashboard-shell">
        <main className="dashboard-main interview-error-main">
          <div className="profile-load-error" role="alert">
            <h2>Unable to load interview</h2>
            <p>{error}</p>
            <div className="profile-detail-actions">
              <Link className="button button-primary" to="/job-profiles">
                Return to Job Profiles
              </Link>
              <Link className="button button-quiet" to="/dashboard">
                Go to Dashboard
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const isCompleted = session.status === 'COMPLETED'
  const totalQuestions = session.questions?.length || 0
  const currentQuestion = session.questions?.[currentIndex]
  const progressPercent = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0
  const answeredCount = session.questions?.filter((q) => q.answered).length || 0

  return (
    <div className="dashboard-shell interview-shell">
      <header className="dashboard-header">
        <div className="header-inner">
          <Link className="brand dashboard-brand" to="/dashboard" aria-label="InSight dashboard">
            <span className="brand-mark" aria-hidden="true">i</span>
            <span>InSight</span>
          </Link>
          <nav className="header-nav" aria-label="Main navigation">
            <Link className="nav-link" to="/dashboard">Dashboard</Link>
            <Link className="nav-link" to="/job-profiles">Job Profiles</Link>
            <span className="nav-current"><span className="nav-dot" />Interview Practice</span>
          </nav>
          <div className="header-account">
            <div className="account-copy">
              <span className="account-name">{user.name}</span>
              <span className="account-role">{user.role}</span>
            </div>
            <span className="avatar" aria-hidden="true">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main interview-main">
        <div className="interview-top-bar">
          <div>
            <Link className="back-link" to="/job-profiles">
              ← Exit to Job Profiles
            </Link>
            <span className="eyebrow">PRACTICE SESSION #{session.id}</span>
            <h1>{session.job_title}</h1>
          </div>
          <div className="interview-status-wrap">
            <span
              className={`status-pill status-pill--${session.status.toLowerCase().replace('_', '-')}`}
            >
              <span className="status-dot" />
              {session.status.replaceAll('_', ' ').toLowerCase()}
            </span>
          </div>
        </div>

        {error && (
          <div className="dashboard-error interview-alert" role="alert">
            <span>{error}</span>
          </div>
        )}

        {isCompleted ? (
          <section className="interview-completed-view">
            <article className="completed-card">
              <div className="completed-icon" aria-hidden="true">✓</div>
              <span className="eyebrow">INTERVIEW COMPLETE</span>
              <h2>Great work practicing!</h2>
              <p>
                You’ve finished your interview session for <strong>{session.job_title}</strong>.
                Your responses have been saved and recorded.
              </p>

              <div className="completed-metrics">
                <div className="metric-box">
                  <span className="metric-label">Total Questions</span>
                  <span className="metric-val">{totalQuestions}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Answered</span>
                  <span className="metric-val">{answeredCount}</span>
                </div>
                <div className="metric-box">
                  <span className="metric-label">Completed On</span>
                  <span className="metric-val">{formatDate(session.completed_at)}</span>
                </div>
              </div>

              <div className="completed-actions">
                <Link className="button button-primary" to="/dashboard">
                  Return to Dashboard <span aria-hidden="true">→</span>
                </Link>
                <Link className="button button-quiet" to="/job-profiles">
                  Practice another role
                </Link>
              </div>
            </article>

            <section className="completed-review-section">
              <h3>Review your responses</h3>
              <div className="review-list">
                {session.questions.map((q, idx) => (
                  <article className="review-item-card" key={q.id}>
                    <div className="review-item-header">
                      <span className="question-index">Question {idx + 1}</span>
                      <span className="question-pill question-pill--type">{q.question_type}</span>
                      <span className="question-pill question-pill--difficulty">{q.difficulty}</span>
                    </div>
                    <p className="review-question-text">{q.question}</p>
                    <div className="review-answer-box">
                      <span className="answer-label">Your answer:</span>
                      <p className="answer-content">
                        {q.answer ? q.answer : <em className="unanswered-text">No answer submitted.</em>}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : (
          <div className="interview-active-view">
            <div className="interview-progress-bar-wrap">
              <div className="progress-info">
                <span className="progress-step">
                  Question <strong>{currentIndex + 1}</strong> of <strong>{totalQuestions}</strong>
                </span>
                <span className="progress-count">
                  {answeredCount} of {totalQuestions} answered
                </span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-valuenow={currentIndex + 1}
                aria-valuemin={1}
                aria-valuemax={totalQuestions}
              >
                <div
                  className="progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {currentQuestion ? (
              <article className="interview-question-card">
                <div className="question-card-meta">
                  <div className="question-badges">
                    <span className="question-pill question-pill--type">
                      {currentQuestion.question_type}
                    </span>
                    <span className="question-pill question-pill--difficulty">
                      {currentQuestion.difficulty}
                    </span>
                  </div>
                  {saveMessage && (
                    <span className="save-status-indicator" aria-live="polite">
                      {saveMessage}
                    </span>
                  )}
                </div>

                <h2 className="interview-prompt-text">{currentQuestion.question}</h2>

                {currentQuestion.skill_tags?.length > 0 && (
                  <div className="question-tags">
                    {currentQuestion.skill_tags.map((tag) => (
                      <span className="skill-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="interview-input-area">
                  <div className="input-area-header">
                    <label htmlFor="answer-input">Your response</label>
                    <span className="char-count">{currentAnswer.length} characters</span>
                  </div>
                  <textarea
                    id="answer-input"
                    rows={8}
                    maxLength={20000}
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    placeholder="Type your answer here... Be clear, direct, and structured in your explanation."
                  />
                </div>

                <div className="interview-nav-actions">
                  <div className="nav-actions-left">
                    <button
                      type="button"
                      className="button button-quiet"
                      disabled={currentIndex === 0 || isSaving}
                      onClick={() => handleNavigate(currentIndex - 1)}
                    >
                      ← Previous
                    </button>
                    <button
                      type="button"
                      className="button button-secondary save-draft-button"
                      disabled={isSaving}
                      onClick={handleManualSave}
                    >
                      {isSaving ? 'Saving...' : 'Save Draft'}
                    </button>
                  </div>

                  <div className="nav-actions-right">
                    {currentIndex < totalQuestions - 1 ? (
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={isSaving}
                        onClick={() => handleNavigate(currentIndex + 1)}
                      >
                        Next question →
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button-primary finish-interview-button"
                        disabled={isFinishing || isSaving}
                        onClick={handleFinish}
                      >
                        {isFinishing ? 'Finalizing...' : 'Finish Interview'} ✓
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ) : (
              <div className="sessions-panel dashboard-loading">No questions found in this session.</div>
            )}
          </div>
        )}

        <footer className="dashboard-footer">
          <span>InSight <span aria-hidden="true">✳</span> Practice makes perfect.</span>
          <span>Signed in as {user.email}</span>
        </footer>
      </main>
    </div>
  )
}
