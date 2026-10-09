import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useCameraPreview } from '../hooks/useCameraPreview'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import {
  completeInterview,
  getInterview,
  saveInterviewAnswer,
} from '../services/api'
import {
  analyzeClientSpeech,
  formatDuration,
} from '../utils/speechMetrics'

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
  const [currentDuration, setCurrentDuration] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const {
    videoRef,
    isCameraOn,
    isLoading: isCameraLoading,
    cameraError,
    stopCamera,
    toggleCamera,
    clearCameraError,
  } = useCameraPreview()

  const {
    isRecording,
    recordingDuration,
    audioUrl,
    error: recorderError,
    interimTranscript,
    isSpeechRecognitionSupported,
    startRecording,
    stopRecording,
    resetRecording,
  } = useVoiceRecorder()

  const effectiveDuration = isRecording ? recordingDuration : currentDuration
  const clientMetrics = useMemo(() => {
    return analyzeClientSpeech(currentAnswer, effectiveDuration)
  }, [currentAnswer, effectiveDuration])

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
          setCurrentDuration(data.questions[resumeIdx]?.duration_seconds || null)
        } else if (data.questions?.length > 0) {
          setCurrentIndex(0)
          setCurrentAnswer(data.questions[0]?.answer || '')
          setCurrentDuration(data.questions[0]?.duration_seconds || null)
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
    async (targetQuestionId, textToSave, durationToSave = null) => {
      if (!session || !targetQuestionId) return true
      setIsSaving(true)
      setSaveMessage('Saving...')
      try {
        const updated = await saveInterviewAnswer(
          token,
          session.id,
          targetQuestionId,
          textToSave,
          durationToSave
        )
        setSession((prev) => {
          if (!prev) return prev
          const nextQuestions = prev.questions.map((q) =>
            q.id === targetQuestionId
              ? {
                  ...q,
                  answer: updated.answer,
                  answered: updated.answered,
                  duration_seconds: updated.duration_seconds,
                  speech_metrics: updated.speech_metrics,
                }
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

  async function handleToggleRecording() {
    if (isRecording) {
      stopRecording()
      setCurrentDuration(recordingDuration)
    } else {
      await startRecording({
        onTranscriptUpdate: (newText) => {
          setCurrentAnswer(newText)
        },
      })
    }
  }

  async function handleNavigate(nextIndex) {
    if (!session || nextIndex < 0 || nextIndex >= session.questions.length) return

    if (isRecording) {
      stopRecording()
    }
    resetRecording()

    const currentQ = session.questions[currentIndex]
    if (currentQ) {
      const trimmedCurrent = currentAnswer.trim()
      const existingAnswer = (currentQ.answer || '').trim()
      const effectiveDuration = isRecording ? recordingDuration : currentDuration
      if (trimmedCurrent !== existingAnswer || (effectiveDuration != null && effectiveDuration !== currentQ.duration_seconds)) {
        await persistCurrentAnswer(currentQ.id, currentAnswer, effectiveDuration)
      }
    }

    setCurrentIndex(nextIndex)
    setCurrentAnswer(session.questions[nextIndex]?.answer || '')
    setCurrentDuration(session.questions[nextIndex]?.duration_seconds || null)
    setSaveMessage('')
  }

  async function handleManualSave() {
    const currentQ = session?.questions[currentIndex]
    if (!currentQ) return
    const effectiveDuration = isRecording ? recordingDuration : currentDuration
    await persistCurrentAnswer(currentQ.id, currentAnswer, effectiveDuration)
  }

  async function handleFinish() {
    if (!session) return
    const confirmed = window.confirm(
      'Finish this practice interview? Once completed, your answers will be finalized.'
    )
    if (!confirmed) return

    if (isRecording) {
      stopRecording()
    }
    if (isCameraOn) {
      stopCamera()
    }

    setIsFinishing(true)
    setError('')
    try {
      const currentQ = session.questions[currentIndex]
      if (currentQ) {
        const effectiveDuration = isRecording ? recordingDuration : currentDuration
        await persistCurrentAnswer(currentQ.id, currentAnswer, effectiveDuration)
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
                      {q.speech_metrics && q.speech_metrics.word_count > 0 && (
                        <div className="review-speech-metrics" aria-label="Speech delivery metrics">
                          <span className="speech-metric-badge" title="Answer duration">
                            ⏱ {q.speech_metrics.duration_seconds != null ? `${Math.round(q.speech_metrics.duration_seconds)}s` : 'Written'}
                          </span>
                          <span className="speech-metric-badge" title="Word count">
                            📝 {q.speech_metrics.word_count} words
                          </span>
                          {q.speech_metrics.words_per_minute != null && (
                            <span className="speech-metric-badge" title="Speaking pace in Words Per Minute">
                              ⚡ {q.speech_metrics.words_per_minute} WPM
                            </span>
                          )}
                          <span className="speech-metric-badge" title="Filler word count">
                            💬 {q.speech_metrics.filler_words_count} fillers
                          </span>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : (
          <div className="interview-active-view virtual-interview-room">
            <div className="interview-progress-bar-wrap">
              <div className="progress-info">
                <div className="progress-room-status">
                  <span className="virtual-room-indicator">
                    <span
                      className={`room-dot ${isCameraOn ? 'room-dot--live' : ''}`}
                      aria-hidden="true"
                    />
                    Virtual Interview Room
                  </span>
                  <span className="progress-step">
                    Question <strong>{currentIndex + 1}</strong> of <strong>{totalQuestions}</strong>
                  </span>
                </div>
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
              <div className="virtual-room-grid">
                {/* Left Stage: Camera Preview & Audio AV Controls */}
                <aside className="virtual-room-stage" aria-label="Camera preview and audio recording">
                  <div className="camera-preview-tile">
                    <div className="camera-tile-header">
                      <div className="camera-status-indicator">
                        <span
                          className={`camera-status-dot ${isCameraOn ? 'camera-status-dot--live' : ''}`}
                          aria-hidden="true"
                        />
                        <span className="camera-status-label">
                          {isCameraOn ? 'Live Camera' : 'Camera Off'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`button button-sm ${isCameraOn ? 'button-danger' : 'button-secondary'} camera-toggle-btn`}
                        onClick={toggleCamera}
                        disabled={isCameraLoading}
                      >
                        {isCameraLoading ? (
                          'Connecting...'
                        ) : isCameraOn ? (
                          'Turn Camera Off'
                        ) : (
                          'Turn Camera On'
                        )}
                      </button>
                    </div>

                    <div className="camera-viewport">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`camera-video-feed ${isCameraOn ? 'camera-video-feed--active' : 'camera-video-feed--hidden'}`}
                        aria-label="Live webcam preview"
                      />

                      {!isCameraOn && (
                        <div className="camera-off-placeholder">
                          <div className="camera-off-icon" aria-hidden="true">
                            📷
                          </div>
                          <p className="camera-off-title">Camera preview is off</p>
                          <p className="camera-off-text">
                            Enable your camera to preview your video while answering, or continue with microphone or typing.
                          </p>
                          <button
                            type="button"
                            className="button button-sm button-primary enable-cam-action"
                            onClick={toggleCamera}
                            disabled={isCameraLoading}
                          >
                            {isCameraLoading ? 'Starting...' : 'Enable Camera'}
                          </button>
                        </div>
                      )}

                      {isCameraOn && (
                        <div className="camera-live-badge" aria-label="Live video preview">
                          <span className="live-pulse-dot" aria-hidden="true" />
                          LIVE PREVIEW
                        </div>
                      )}
                    </div>

                    {cameraError && (
                      <div className="camera-error-banner" role="alert">
                        <div className="camera-error-content">
                          <span className="camera-error-icon" aria-hidden="true">⚠️</span>
                          <span className="camera-error-text">{cameraError}</span>
                        </div>
                        <button
                          type="button"
                          className="camera-error-dismiss"
                          onClick={clearCameraError}
                          aria-label="Dismiss error notice"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Voice Recording & Transcription */}
                  <div className="voice-recorder-section" aria-label="Voice response recorder">
                    <div className="voice-recorder-header">
                      <div className="voice-title-wrap">
                        <span className="mic-icon" aria-hidden="true">🎙</span>
                        <span className="voice-section-title">Microphone & Transcription</span>
                      </div>
                      {!isSpeechRecognitionSupported && (
                        <span className="browser-support-tag" title="Web Speech API not available in this browser">
                          Manual transcription
                        </span>
                      )}
                    </div>

                    {recorderError && (
                      <div className="dashboard-error voice-error-alert" role="alert">
                        <span>{recorderError}</span>
                      </div>
                    )}

                    {!isSpeechRecognitionSupported && (
                      <div className="voice-browser-notice">
                        <span>
                          ℹ️ <strong>Browser note:</strong> Real-time speech-to-text uses the Web Speech API (supported in Chrome and Edge). You can still record audio for review and type or edit your answer in the editor.
                        </span>
                      </div>
                    )}

                    <div className="voice-controls-bar">
                      {!isRecording ? (
                        <div className="voice-idle-controls">
                          <button
                            type="button"
                            className="button button-primary record-button"
                            disabled={isSaving}
                            onClick={handleToggleRecording}
                          >
                            <span className="record-dot-icon" aria-hidden="true" />
                            {audioUrl ? 'Record Again' : 'Record Answer'}
                          </button>
                          <span className="voice-hint">
                            {audioUrl
                              ? 'Re-record response or edit text in the response box.'
                              : 'Click to speak. Audio transcribes live.'}
                          </span>
                        </div>
                      ) : (
                        <div className="voice-active-controls">
                          <div className="recording-status-pill">
                            <span className="recording-pulse-dot" aria-hidden="true" />
                            <span>Recording...</span>
                            <span className="recording-timer">{formatDuration(recordingDuration)}</span>
                          </div>
                          <button
                            type="button"
                            className="button button-danger stop-record-button"
                            onClick={handleToggleRecording}
                          >
                            ⏹ Stop Recording
                          </button>
                        </div>
                      )}

                      {audioUrl && !isRecording && (
                        <div className="voice-playback-wrap">
                          <span className="playback-label">Review audio:</span>
                          <audio
                            controls
                            src={audioUrl}
                            className="voice-audio-player"
                            aria-label="Recorded answer playback"
                          />
                        </div>
                      )}
                    </div>

                    {isRecording && interimTranscript && (
                      <div className="voice-interim-box" aria-live="polite">
                        <span className="interim-label">Listening:</span>
                        <p className="interim-text">"{interimTranscript}"</p>
                      </div>
                    )}
                  </div>

                  <div className="room-guidance-card">
                    <span className="guidance-title">🎯 Virtual Practice Tips</span>
                    <ul className="guidance-list">
                      <li>Maintain eye contact by looking near your camera lens.</li>
                      <li>Camera & microphone work independently — practice with or without video.</li>
                      <li>Take a breath before answering and structure responses clearly.</li>
                    </ul>
                  </div>
                </aside>

                {/* Right Workspace: Question Prompt, Text Response, Delivery Metrics, Navigation */}
                <section className="virtual-room-workspace" aria-label="Question prompt and response workspace">
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
                        <label htmlFor="answer-input">
                          Your Response & Transcript
                          {currentDuration != null && (
                            <span className="recorded-pill">
                              Recorded ({Math.round(currentDuration)}s)
                            </span>
                          )}
                        </label>
                        <span className="char-count">{currentAnswer.length} characters</span>
                      </div>
                      <textarea
                        id="answer-input"
                        rows={8}
                        maxLength={20000}
                        value={currentAnswer}
                        onChange={(e) => setCurrentAnswer(e.target.value)}
                        placeholder="Type or speak your answer here... You can freely edit or expand your answer before saving."
                      />
                    </div>

                    {/* M7 Speech Delivery Summary */}
                    {clientMetrics.word_count > 0 && (
                      <div className="speech-metrics-card" aria-label="Speech delivery analysis">
                        <div className="speech-metrics-header">
                          <span className="speech-metrics-title">📊 Speech Delivery Summary</span>
                          {effectiveDuration != null ? (
                            <span className="delivery-mode-tag">🎙 Recorded ({formatDuration(effectiveDuration)})</span>
                          ) : (
                            <span className="delivery-mode-tag">✍ Written</span>
                          )}
                        </div>

                        <div className="speech-metrics-grid">
                          <div className="speech-metric-item">
                            <span className="metric-name">Duration</span>
                            <span className="metric-number">
                              {effectiveDuration != null ? `${Math.round(effectiveDuration)}s` : 'Written'}
                            </span>
                          </div>

                          <div className="speech-metric-item">
                            <span className="metric-name">Word Count</span>
                            <span className="metric-number">{clientMetrics.word_count}</span>
                          </div>

                          <div className="speech-metric-item">
                            <span className="metric-name">Pacing</span>
                            <span className="metric-number">
                              {clientMetrics.words_per_minute != null
                                ? `${clientMetrics.words_per_minute} WPM`
                                : '—'}
                            </span>
                            <span className="metric-subtext">
                              {clientMetrics.words_per_minute != null
                                ? clientMetrics.words_per_minute < 110
                                  ? 'Deliberate pace'
                                  : clientMetrics.words_per_minute <= 165
                                  ? 'Conversational pace'
                                  : 'Brisk pace'
                                : 'Available with audio'}
                            </span>
                          </div>

                          <div className="speech-metric-item">
                            <span className="metric-name">Filler Words</span>
                            <span className="metric-number">{clientMetrics.filler_words_count}</span>
                            {clientMetrics.filler_words_count > 0 && (
                              <div className="filler-tags-list">
                                {Object.entries(clientMetrics.filler_words).map(([word, count]) => (
                                  <span className="filler-word-pill" key={word}>
                                    "{word}" ({count})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="speech-metrics-footer">
                          <span className="pause-notice">
                            ⏸ <em>{clientMetrics.pause_analysis}</em>
                          </span>
                          <p className="speech-disclaimer">
                            * Pacing and filler word metrics are provided for delivery awareness only and do not evaluate candidate competence, knowledge, or confidence.
                          </p>
                        </div>
                      </div>
                    )}

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
                </section>
              </div>
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
