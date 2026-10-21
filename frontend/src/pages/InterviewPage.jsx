import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useCameraPreview } from '../hooks/useCameraPreview'
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import {
  completeInterview,
  getInterview,
  saveInterviewAnswer,
} from '../services/api'
import { analyzeClientSpeech } from '../utils/speechMetrics'

export default function InterviewPage() {
  const { token, logout } = useAuth()
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
  const [showHint, setShowHint] = useState(false)
  const [isEditingTranscript, setIsEditingTranscript] = useState(false)

  // Load user settings saved during setup
  const settings = useMemo(() => {
    try {
      const stored =
        sessionStorage.getItem(`insight_interview_settings_${sessionId}`) ||
        sessionStorage.getItem('insight_interview_settings')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }, [sessionId])

  // Timer: dynamic duration countdown initialized directly from user selection
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    try {
      const stored =
        sessionStorage.getItem(`insight_interview_settings_${sessionId}`) ||
        sessionStorage.getItem('insight_interview_settings')
      const parsed = stored ? JSON.parse(stored) : null
      if (parsed?.durationSeconds) return Number(parsed.durationSeconds)
      if (parsed?.interviewLength === '15 min') return 15 * 60
      if (parsed?.interviewLength === '45 min') return 45 * 60
    } catch {
      // ignore
    }
    return 25 * 60
  })

  // Interviewer vocal delivery tailored to chosen style
  const speechConfig = useMemo(() => {
    const style = settings?.interviewerStyle || 'Neutral'
    if (style === 'Friendly') {
      return { rate: 0.98, pitch: 1.08 }
    }
    if (style.startsWith('Tough')) {
      return { rate: 1.06, pitch: 0.95 }
    }
    return { rate: 1.0, pitch: 1.0 }
  }, [settings?.interviewerStyle])

  const lastVoicedQuestionIdRef = useRef(null)

  // Speech Synthesis Hook (Interviewer speaking)
  const {
    isSupported: isSpeechSupported,
    isSpeaking,
    isMuted,
    speak,
    cancel: cancelSpeech,
  } = useSpeechSynthesis()

  // Camera Preview Hook (PiP video)
  const {
    videoRef,
    isCameraOn,
    cameraError,
    toggleCamera,
    stopCamera,
    startCamera,
  } = useCameraPreview()

  // Voice Recorder Hook (Candidate answering)
  const {
    isRecording,
    recordingDuration,
    interimTranscript,
    error: recorderError,
    startRecording,
    stopRecording,
    resetRecording,
  } = useVoiceRecorder()

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  // Load session
  const loadSession = useCallback(
    async (signal) => {
      setIsLoading(true)
      setError('')
      try {
        const data = await getInterview(token, sessionId, { signal })
        setSession(data)

        if (data.status === 'IN_PROGRESS' && data.questions?.length > 0) {
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

  // Start camera automatically upon entering the room
  useEffect(() => {
    startCamera().catch(() => {})
  }, [startCamera])

  // Session timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const currentQuestion = session?.questions?.[currentIndex]
  const totalQuestions = session?.questions?.length || 0

  // Voice current question automatically when navigating to it
  useEffect(() => {
    if (!session || session.status === 'COMPLETED' || !currentQuestion?.id || !currentQuestion?.question) {
      return
    }

    if (lastVoicedQuestionIdRef.current !== currentQuestion.id) {
      lastVoicedQuestionIdRef.current = currentQuestion.id
      if (isSpeechSupported && !isMuted) {
        speak(currentQuestion.question, speechConfig)
      }
    }
  }, [session, currentQuestion, isSpeechSupported, isMuted, speak, speechConfig])

  // Live Signals computation derived genuinely from actual speech
  const effectiveDuration = isRecording ? recordingDuration : currentDuration
  const clientMetrics = useMemo(() => {
    return analyzeClientSpeech(currentAnswer, effectiveDuration)
  }, [currentAnswer, effectiveDuration])

  const liveWpm = clientMetrics.words_per_minute // null if not yet speaking
  const liveFillers = clientMetrics.filler_words_count || 0
  const hasSpoken = clientMetrics.word_count > 0 && effectiveDuration > 2

  const isSpeakingFast = hasSpoken && liveWpm !== null && liveWpm > 165
  const isSpeakingSlow = hasSpoken && liveWpm !== null && liveWpm < 110

  // Format seconds to mm:ss
  function formatTimer(totalSec) {
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs} left`
  }

  // Persist Answer Helper
  const persistCurrentAnswer = useCallback(
    async (targetQuestionId, textToSave, durationToSave = null) => {
      if (!session || !targetQuestionId) return true
      setIsSaving(true)
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
          return {
            ...prev,
            questions: nextQuestions,
            answered_count: nextQuestions.filter((q) => q.answered).length,
          }
        })
        return true
      } catch (err) {
        if (err.status === 401) {
          handleUnauthorized()
        }
        return false
      } finally {
        setIsSaving(false)
      }
    },
    [session, token, handleUnauthorized]
  )

  // Toggle Microphone / Answering
  async function handleToggleMic() {
    if (isRecording) {
      stopRecording()
      setCurrentDuration(recordingDuration)
    } else {
      if (isSpeaking) {
        cancelSpeech()
      }
      await startRecording({
        onTranscriptUpdate: (newText) => {
          setCurrentAnswer(newText)
        },
      })
    }
  }

  // Done Answering & Next Question
  async function handleDoneAnswering() {
    if (!session) return

    cancelSpeech()
    if (isRecording) {
      stopRecording()
    }

    const currentQ = session.questions[currentIndex]
    if (currentQ) {
      const effDuration = isRecording ? recordingDuration : currentDuration
      const saved = await persistCurrentAnswer(currentQ.id, currentAnswer, effDuration)
      if (!saved) return
    }

    if (currentIndex < totalQuestions - 1) {
      const nextIndex = currentIndex + 1
      resetRecording()
      setCurrentIndex(nextIndex)
      setCurrentAnswer(session.questions[nextIndex]?.answer || '')
      setCurrentDuration(session.questions[nextIndex]?.duration_seconds || null)
      setShowHint(false)
      setIsEditingTranscript(false)
    } else {
      // Completed all questions -> finalize and view report!
      handleFinishSession()
    }
  }

  // Complete Interview & Go to Report
  async function handleFinishSession() {
    if (!session) return
    setIsFinishing(true)
    cancelSpeech()
    if (isRecording) {
      stopRecording()
    }
    stopCamera()

    try {
      const currentQ = session.questions[currentIndex]
      if (currentQ) {
        const effDuration = isRecording ? recordingDuration : currentDuration
        await persistCurrentAnswer(currentQ.id, currentAnswer, effDuration)
      }
      await completeInterview(token, session.id)
      navigate(`/interview/${session.id}/report`)
    } catch {
      setIsFinishing(false)
      navigate(`/interview/${session.id}/report`)
    }
  }

  if (isLoading) {
    return (
      <div className="dark-interview-page dark-room-loading">
        <p>Connecting to virtual interview room...</p>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="dark-interview-page dark-room-error">
        <div className="dark-error-modal">
          <h2>Unable to join interview</h2>
          <p>{error || 'Session could not be retrieved.'}</p>
          <button
            type="button"
            className="button poise-btn-primary"
            onClick={() => navigate('/dashboard')}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const roleTitle = session.job_title || 'Mock interview session'

  return (
    <div className="dark-interview-page">
      {/* Top Header Bar matching Screenshot 2 */}
      <header className="dark-room-header">
        <div className="dark-header-left">
          <div className="dark-brand-title">
            <span className="dark-brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <circle cx="12" cy="12" r="4" fill="currentColor" />
              </svg>
            </span>
            <span>{roleTitle}</span>
          </div>
          {settings?.interviewType && (
            <span className="dark-type-badge">{settings.interviewType}</span>
          )}
          {settings?.interviewerStyle && (
            <span className="dark-style-badge">{settings.interviewerStyle}</span>
          )}
        </div>

        <div className="dark-header-meta">
          <span className="dark-question-count">
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <span className="dark-timer-pill">{formatTimer(secondsRemaining)}</span>
          <div className="dark-rec-indicator">
            <span className="dark-rec-dot" aria-hidden="true" />
            <span>{settings?.saveRecording ? 'Recording & analysis' : 'Live signals active'}</span>
          </div>
        </div>
      </header>

      {/* Main 2-Column Dark Stage Layout matching Screenshot 2 */}
      <main className="dark-room-main-layout">
        {/* Left Column: Virtual Interviewer Stage (Top) & Current Question Card (Bottom) */}
        <div className="dark-room-left-col">
          {/* Virtual Interviewer Stage Card */}
          <section className="dark-card dark-stage-card" aria-label="Virtual interviewer stage">
            {/* Dynamic Gentle Nudge Banner */}
            {isRecording && hasSpoken && isSpeakingFast ? (
              <div className="dark-nudge-banner">
                <span>⚠️ Gentle nudge: you are speaking a little fast ({liveWpm} WPM). Take a breath between points.</span>
              </div>
            ) : isRecording && hasSpoken && isSpeakingSlow ? (
              <div className="dark-nudge-banner">
                <span>💡 Pacing tip: Maintain a steady flow to keep the interviewer engaged.</span>
              </div>
            ) : isRecording && liveFillers >= 4 ? (
              <div className="dark-nudge-banner">
                <span>💡 Delivery tip: Replace filler words with brief silent pauses.</span>
              </div>
            ) : isSpeaking ? (
              <div className="dark-nudge-banner dark-nudge-banner--calm">
                <span>🎧 Interviewer is speaking. Listen carefully to the question prompt.</span>
              </div>
            ) : (
              <div className="dark-nudge-banner dark-nudge-banner--calm">
                <span>🎯 Focus on structured delivery and clear articulation while answering.</span>
              </div>
            )}

            {/* Concentric Animated Audio Rings */}
            <div className="dark-avatar-center-stage">
              <div
                className={`dark-audio-rings-wrap ${
                  isSpeaking ? 'dark-rings-speaking' : isRecording ? 'dark-rings-recording' : ''
                }`}
              >
                <div className="ring ring-outer" />
                <div className="ring ring-middle" />
                <div className="ring ring-core">
                  <span className="core-dot" />
                </div>
              </div>
              <span className="dark-interviewer-status-text">
                {isSpeaking
                  ? 'Interviewer is speaking'
                  : isRecording
                  ? 'Listening to your answer...'
                  : 'Ready for your response'}
              </span>
            </div>

            {/* Picture-in-Picture (PiP) Video Feed */}
            <div className="dark-pip-camera-box">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`dark-pip-video ${isCameraOn ? 'dark-pip-video--active' : 'dark-pip-video--hidden'}`}
                aria-label="Your webcam preview"
              />
              {!isCameraOn && (
                <div className="dark-pip-placeholder">
                  <svg viewBox="0 0 40 40" className="dark-pip-silhouette" aria-hidden="true">
                    <circle cx="20" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
                    <path
                      d="M8 32 C8 25 13 22 20 22 C27 22 32 25 32 32"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    />
                  </svg>
                </div>
              )}
              <span className="dark-pip-label">You</span>
            </div>
          </section>

          {/* Current Question Card */}
          <section className="dark-card dark-question-card" aria-label="Current interview question">
            <span className="dark-question-tag">CURRENT QUESTION</span>
            <h1 className="dark-question-prompt">
              {currentQuestion?.question || 'Please tell me about your relevant background and experience.'}
            </h1>

            {showHint && (
              <div className="dark-hint-box">
                💡 <strong>Hint:</strong> Use the STAR method: describe the Situation, Task, specific Actions you took, and measurable Results.
              </div>
            )}

            {(recorderError || cameraError) && (
              <div className="dark-device-alert" role="alert">
                <span>⚠️ {recorderError || cameraError}</span>
              </div>
            )}

            {/* Action Buttons matching Screenshot 2 */}
            <div className="dark-question-actions-row">
              <div className="dark-media-icons-wrap">
                <button
                  type="button"
                  className={`dark-circle-icon-btn ${isRecording ? 'is-recording-btn' : ''}`}
                  onClick={handleToggleMic}
                  title={isRecording ? 'Stop recording microphone' : 'Start speaking'}
                  aria-label={isRecording ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {isRecording ? '⏹' : '🎤'}
                </button>
                <button
                  type="button"
                  className={`dark-circle-icon-btn ${isCameraOn ? 'is-camera-active' : ''}`}
                  onClick={toggleCamera}
                  title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
                  aria-label={isCameraOn ? 'Disable camera' : 'Enable camera'}
                >
                  📹
                </button>
              </div>

              <button
                type="button"
                className="button dark-secondary-btn"
                onClick={() => setShowHint((v) => !v)}
              >
                {showHint ? 'Hide hint' : 'Show a hint'}
              </button>

              <button
                type="button"
                className="button dark-secondary-btn"
                onClick={() => currentQuestion && speak(currentQuestion.question, speechConfig)}
                title="Repeat current question aloud"
              >
                Repeat question
              </button>

              <button
                type="button"
                className="button dark-primary-btn"
                disabled={isSaving}
                onClick={handleDoneAnswering}
              >
                {isSaving
                  ? 'Saving...'
                  : currentIndex < totalQuestions - 1
                  ? 'Done answering'
                  : 'Complete interview'}
              </button>

              <button
                type="button"
                className="button dark-danger-btn"
                disabled={isFinishing}
                onClick={handleFinishSession}
              >
                {isFinishing ? 'Finishing...' : 'End session'}
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Live Signals (Top) & Live Transcript (Bottom) */}
        <div className="dark-room-right-col">
          {/* Live Signals Card */}
          <section className="dark-card dark-signals-card" aria-label="Live signals">
            <h2 className="dark-card-title">Live signals</h2>

            {/* Signal 1: Speaking Pace */}
            <div className="dark-signal-row">
              <div className="dark-signal-data">
                <span className="dark-signal-label">Speaking pace</span>
                <span className="dark-signal-val">
                  {settings?.analyzeVoice === false
                    ? 'Voice analysis off'
                    : hasSpoken && liveWpm !== null
                    ? `${liveWpm} words/min`
                    : isRecording
                    ? 'Listening...'
                    : '— words/min'}
                </span>
              </div>
              <span
                className={`dark-signal-pill ${
                  settings?.analyzeVoice === false
                    ? 'pill-neutral'
                    : !hasSpoken
                    ? 'pill-neutral'
                    : isSpeakingFast
                    ? 'pill-warning'
                    : isSpeakingSlow
                    ? 'pill-neutral'
                    : 'pill-success'
                }`}
              >
                {settings?.analyzeVoice === false
                  ? 'Off'
                  : !hasSpoken
                  ? 'Ready'
                  : isSpeakingFast
                  ? 'A bit fast'
                  : isSpeakingSlow
                  ? 'Deliberate'
                  : 'Optimal pace'}
              </span>
            </div>

            {/* Signal 2: Filler Words */}
            <div className="dark-signal-row">
              <div className="dark-signal-data">
                <span className="dark-signal-label">Filler words</span>
                <span className="dark-signal-val">
                  {settings?.analyzeVoice === false ? 'Off' : `${liveFillers} so far`}
                </span>
              </div>
              <span
                className={`dark-signal-pill ${
                  settings?.analyzeVoice === false
                    ? 'pill-neutral'
                    : liveFillers > 3
                    ? 'pill-warning'
                    : 'pill-success'
                }`}
              >
                {settings?.analyzeVoice === false
                  ? 'Off'
                  : liveFillers > 3
                  ? 'Watch fillers'
                  : 'On track'}
              </span>
            </div>

            {/* Signal 3: Video Feed Preview */}
            <div className="dark-signal-row">
              <div className="dark-signal-data">
                <span className="dark-signal-label">Webcam preview</span>
                <span className="dark-signal-val">
                  {settings?.enableCameraPreview === false || settings?.analyzeEyeContact === false
                    ? 'Preview disabled'
                    : isCameraOn
                    ? 'Webcam active'
                    : 'Camera off'}
                </span>
                <span className="dark-signal-subnote">
                  Visual presence preview only. Eye contact and gaze tracking are not measured.
                </span>
              </div>
              <span
                className={`dark-signal-pill ${
                  settings?.enableCameraPreview === false || settings?.analyzeEyeContact === false || !isCameraOn
                    ? 'pill-neutral'
                    : 'pill-success'
                }`}
              >
                {settings?.enableCameraPreview === false || settings?.analyzeEyeContact === false
                  ? 'Off'
                  : isCameraOn
                  ? 'Video on'
                  : 'Off'}
              </span>
            </div>

            {/* Signal 4: Speaking Pace Rhythm */}
            <div className="dark-signal-row">
              <div className="dark-signal-data">
                <span className="dark-signal-label">Pace rhythm</span>
                <span className="dark-signal-val">
                  {settings?.analyzeVoice === false
                    ? 'Off'
                    : !hasSpoken
                    ? 'Awaiting response'
                    : isSpeakingFast
                    ? 'Paced quick'
                    : isSpeakingSlow
                    ? 'Deliberate pace'
                    : 'Steady rhythm'}
                </span>
                <span className="dark-signal-subnote">
                  Conversational delivery rhythm based on words-per-minute target.
                </span>
              </div>
              <span
                className={`dark-signal-pill ${
                  settings?.analyzeVoice === false
                    ? 'pill-neutral'
                    : !hasSpoken
                    ? 'pill-neutral'
                    : isSpeakingFast
                    ? 'pill-warning'
                    : isSpeakingSlow
                    ? 'pill-neutral'
                    : 'pill-success'
                }`}
              >
                {settings?.analyzeVoice === false
                  ? 'Off'
                  : !hasSpoken
                  ? 'Idle'
                  : isSpeakingFast
                  ? 'Quick'
                  : isSpeakingSlow
                  ? 'Deliberate'
                  : 'Optimal'}
              </span>
            </div>

            <div className="dark-signals-disclaimer">
              <span>ℹ️ Speech pace and filler counts measure verbal delivery habits only. Eye gaze tracking, emotion, and subject competence are not measured.</span>
            </div>
          </section>

          {/* Live Transcript Card */}
          <section className="dark-card dark-transcript-card" aria-label="Live transcript">
            <div className="dark-transcript-header">
              <h2 className="dark-card-title">Live transcript</h2>
              <button
                type="button"
                className="text-button dark-edit-transcript-toggle"
                onClick={() => setIsEditingTranscript((v) => !v)}
              >
                {isEditingTranscript ? 'Done editing' : 'Edit transcript'}
              </button>
            </div>

            <div className="dark-transcript-body">
              {/* Interviewer Turn */}
              <div className="dark-turn dark-turn--interviewer">
                <span className="turn-speaker">Interviewer</span>
                <p className="turn-text">{currentQuestion?.question}</p>
              </div>

              {/* Candidate Turn */}
              <div className="dark-turn dark-turn--candidate">
                <span className="turn-speaker">You</span>
                {isEditingTranscript ? (
                  <textarea
                    className="dark-transcript-textarea"
                    rows={5}
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    placeholder="Type or refine your response here..."
                  />
                ) : (
                  <p className="turn-text">
                    {currentAnswer ? (
                      currentAnswer
                    ) : (
                      <em className="dark-turn-listening">
                        {isRecording
                          ? interimTranscript
                            ? `"${interimTranscript}"`
                            : 'Listening for your voice...'
                          : 'Click the mic icon or "Done answering" to speak or type your answer.'}
                      </em>
                    )}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
