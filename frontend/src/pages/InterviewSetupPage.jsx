import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Navbar } from '../components/Navbar'
import { useCameraPreview } from '../hooks/useCameraPreview'
import {
  createJobProfile,
  generateJobProfileQuestions,
  getJobProfileQuestions,
  startInterview,
  updateJobProfileQuestionApproval,
} from '../services/api'

export default function InterviewSetupPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  // Form Fields matching Screenshot 1
  const [targetRole, setTargetRole] = useState('Product manager')
  const [companyName, setCompanyName] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [fileName, setFileName] = useState('')
  const [showTextDrawer, setShowTextDrawer] = useState(false)

  // Interview Type (Screenshot 1: Behavioral, Technical, Case study, HR and culture, Panel)
  const [interviewType, setInterviewType] = useState('Behavioral')

  // Interviewer style & length
  const [interviewerStyle, setInterviewerStyle] = useState('Neutral') // Friendly, Neutral, Tough, pushes back
  const [interviewLength, setInterviewLength] = useState('25 min') // 15 min, 25 min, 45 min

  // Device check toggles
  const [analyzeVoice, setAnalyzeVoice] = useState(true)
  const [enableCameraPreview, setEnableCameraPreview] = useState(true)
  const [saveRecording, setSaveRecording] = useState(false)

  // Mic state
  const [isMicActive, setIsMicActive] = useState(false)
  const [micLevel, setMicLevel] = useState(45)
  const [micError, setMicError] = useState('')
  const micStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const animFrameRef = useRef(null)

  // Camera preview hook
  const {
    videoRef,
    isCameraOn,
    isLoading: isCameraLoading,
    cameraError,
    stopCamera,
    toggleCamera,
  } = useCameraPreview()

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  // Real-time microphone audio sampling
  const startMicMonitoring = useCallback(async () => {
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return

      const audioCtx = new AudioCtx()
      audioContextRef.current = audioCtx
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      setIsMicActive(true)

      const updateLevel = () => {
        if (!micStreamRef.current) return
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const normalized = Math.min(100, Math.max(10, Math.round((avg / 128) * 100)))
        setMicLevel(normalized)
        animFrameRef.current = requestAnimationFrame(updateLevel)
      }
      updateLevel()
    } catch (err) {
      setIsMicActive(false)
      setMicLevel(0)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Microphone permission denied. Allow mic access in browser settings.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setMicError('No microphone found. Please connect an audio input device.')
      } else {
        setMicError('Microphone unavailable or in use by another application.')
      }
    }
  }, [])

  const stopMicMonitoring = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    setIsMicActive(false)
  }, [])

  // Start devices on mount or user preference
  useEffect(() => {
    Promise.resolve().then(() => startMicMonitoring())
    return () => {
      stopMicMonitoring()
      stopCamera()
    }
  }, [startMicMonitoring, stopMicMonitoring, stopCamera])

  // File Upload Handler
  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setError('File must be smaller than 5MB.')
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result
      if (typeof content === 'string') {
        setResumeText(content.trim())
        setError('')
      }
    }
    reader.onerror = () => {
      setError('Could not read file. You can paste your resume or job description text directly.')
    }
    reader.readAsText(file)
  }

  // Question count and duration based on length
  const questionCount = interviewLength === '15 min' ? 3 : interviewLength === '25 min' ? 5 : 7
  const durationMinutes = interviewLength === '15 min' ? 15 : interviewLength === '45 min' ? 45 : 25
  const durationSeconds = durationMinutes * 60

  // Handle Begin Interview
  async function handleBeginInterview() {
    if (!targetRole.trim()) {
      setError('Please enter a target role.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      // Build comprehensive prompt context for AI question generator
      let contextDesc = `Target Role: ${targetRole.trim()}`
      if (companyName.trim()) {
        contextDesc += `\nCompany: ${companyName.trim()}`
      }
      contextDesc += `\nInterview Type: ${interviewType}`
      contextDesc += `\nInterviewer Style: ${interviewerStyle}`
      contextDesc += `\nTarget Length: ${interviewLength} (${questionCount} questions)`

      if (jobDescription.trim()) {
        contextDesc += `\n\nJob Description / Requirements:\n${jobDescription.trim()}`
      }
      if (resumeText.trim()) {
        contextDesc += `\n\nCandidate Resume / Experience Highlights:\n${resumeText.trim()}`
      } else if (!jobDescription.trim()) {
        contextDesc += `\n\nFocus on standard industry interview competencies for a ${targetRole.trim()}.`
      }

      // 1. Create Job Profile
      const profile = await createJobProfile(token, {
        job_title: `${targetRole.trim()}${companyName ? ` - ${companyName.trim()}` : ''}`,
        job_description: contextDesc,
        experience_level: interviewerStyle,
      })

      // 2. Generate Questions
      const genResult = await generateJobProfileQuestions(token, profile.id)
      const rawQuestions = genResult.questions || []

      // 3. Auto-approve up to selected questionCount
      const toApprove = rawQuestions.slice(0, questionCount)
      for (const q of toApprove) {
        await updateJobProfileQuestionApproval(token, profile.id, q.id, true)
      }

      // Verify approval count
      const updated = await getJobProfileQuestions(token, profile.id)
      const approvedCount = (updated.questions || []).filter((q) => q.approved_by_student).length

      if (approvedCount === 0 && rawQuestions.length > 0) {
        // Fallback approve first question
        await updateJobProfileQuestionApproval(token, profile.id, rawQuestions[0].id, true)
      }

      // 4. Start Interview Session
      const session = await startInterview(token, profile.id)

      const settingsData = {
        analyzeVoice,
        enableCameraPreview,
        analyzeEyeContact: enableCameraPreview,
        saveRecording,
        interviewerStyle,
        interviewType,
        targetRole,
        companyName,
        interviewLength,
        durationMinutes,
        durationSeconds,
        questionCount,
      }

      // Store device preference flags and session parameters in session storage
      sessionStorage.setItem('insight_interview_settings', JSON.stringify(settingsData))
      if (session?.id) {
        sessionStorage.setItem(`insight_interview_settings_${session.id}`, JSON.stringify(settingsData))
      }

      stopCamera()
      stopMicMonitoring()
      navigate(`/interview/${session.id}`)
    } catch (err) {
      if (err.status === 401) {
        handleUnauthorized()
      } else {
        setError(err.message || 'Failed to prepare interview session. Please try again.')
      }
      setIsSubmitting(false)
    }
  }

  const interviewTypes = [
    { id: 'Behavioral', label: 'Behavioral', desc: 'Stories about past work' },
    { id: 'Technical', label: 'Technical', desc: 'Role skills and problem solving' },
    { id: 'Case study', label: 'Case study', desc: 'Structured business problems' },
    { id: 'HR and culture', label: 'HR and culture', desc: 'Motivation, salary, fit' },
    { id: 'Panel', label: 'Panel', desc: 'Several interviewers at once' },
  ]

  const interviewerStyles = ['Friendly', 'Neutral', 'Tough, pushes back']
  const interviewLengths = ['15 min', '25 min', '45 min']

  return (
    <div className="poise-page-shell">
      <Navbar activePage="setup" />

      <main className="poise-setup-container">
        <header className="poise-setup-header">
          <h1>Set up your mock interview</h1>
          <p>Tell us the role. The interviewer tailors questions and follow-ups to it.</p>
        </header>

        {error && (
          <div className="poise-alert poise-alert-error" role="alert">
            <span>⚠️ {error}</span>
            <button type="button" className="text-button" onClick={() => setError('')}>
              Dismiss
            </button>
          </div>
        )}

        <div className="poise-setup-grid">
          {/* Left Column: Sections 1, 2, 3 */}
          <div className="poise-setup-left-col">
            {/* Section 1: Role and context */}
            <section className="poise-card poise-setup-section" aria-label="Role and context">
              <h2 className="poise-section-title">1. Role and context</h2>
              <div className="poise-inputs-row">
                <div className="poise-field-group">
                  <label htmlFor="target-role-input">Target role</label>
                  <input
                    id="target-role-input"
                    type="text"
                    placeholder="Product manager"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                  />
                </div>
                <div className="poise-field-group">
                  <label htmlFor="company-name-input">Company (optional)</label>
                  <input
                    id="company-name-input"
                    type="text"
                    placeholder="[COMPANY NAME]"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
              </div>

              {/* Upload file banner */}
              <div className="poise-upload-banner">
                <div className="poise-upload-banner-left">
                  <span className="poise-upload-icon" aria-hidden="true">↑</span>
                  <div className="poise-upload-text">
                    <span>Add a job description or your resume so questions match your experience.</span>
                    {fileName && <span className="poise-filename-pill">📎 {fileName}</span>}
                  </div>
                </div>
                <div className="poise-upload-actions">
                  <label htmlFor="resume-file-upload" className="button poise-btn-outline">
                    {fileName ? 'Replace file' : 'Upload file'}
                  </label>
                  <input
                    id="resume-file-upload"
                    type="file"
                    accept=".txt,.md,.pdf,.doc,.docx"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    className="button button-quiet button-sm"
                    onClick={() => setShowTextDrawer((v) => !v)}
                  >
                    {showTextDrawer ? 'Hide text' : 'Paste text'}
                  </button>
                </div>
              </div>

              {/* Expandable text paste drawer */}
              {showTextDrawer && (
                <div className="poise-drawer-paste">
                  <label htmlFor="paste-job-desc">Paste Job Description or Resume Details:</label>
                  <textarea
                    id="paste-job-desc"
                    rows={4}
                    placeholder="Paste job requirements, responsibilities, or your key resume highlights..."
                    value={jobDescription || resumeText}
                    onChange={(e) => {
                      setJobDescription(e.target.value)
                      setResumeText(e.target.value)
                    }}
                  />
                </div>
              )}
            </section>

            {/* Section 2: Interview type */}
            <section className="poise-card poise-setup-section" aria-label="Interview type">
              <h2 className="poise-section-title">2. Interview type</h2>
              <div className="poise-type-cards-grid">
                {interviewTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`poise-type-card ${interviewType === t.id ? 'poise-type-card--selected' : ''}`}
                    onClick={() => setInterviewType(t.id)}
                  >
                    <span className="poise-type-name">{t.label}</span>
                    <span className="poise-type-desc">{t.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Section 3: Interviewer style and length */}
            <section className="poise-card poise-setup-section" aria-label="Interviewer style and length">
              <h2 className="poise-section-title">3. Interviewer style and length</h2>
              <div className="poise-pills-row">
                <div className="poise-pill-group">
                  <span className="poise-group-label">Interviewer</span>
                  <div className="poise-pills-wrap">
                    {interviewerStyles.map((style) => (
                      <button
                        key={style}
                        type="button"
                        className={`poise-pill-btn ${interviewerStyle === style ? 'poise-pill-btn--selected' : ''}`}
                        onClick={() => setInterviewerStyle(style)}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="poise-pill-group">
                  <span className="poise-group-label">Length</span>
                  <div className="poise-pills-wrap">
                    {interviewLengths.map((len) => (
                      <button
                        key={len}
                        type="button"
                        className={`poise-pill-btn ${interviewLength === len ? 'poise-pill-btn--selected' : ''}`}
                        onClick={() => setInterviewLength(len)}
                      >
                        {len}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Section 4 Device Check + Begin Interview */}
          <div className="poise-setup-right-col">
            <section className="poise-card poise-device-card" aria-label="Device check">
              <h2 className="poise-section-title">4. Device check</h2>

              {/* Camera Preview Box */}
              <div className="poise-camera-box">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`poise-camera-feed ${isCameraOn ? 'poise-camera-feed--live' : 'poise-camera-feed--hidden'}`}
                  aria-label="Camera preview"
                />
                {!isCameraOn && (
                  <div className="poise-camera-placeholder">
                    <svg viewBox="0 0 40 40" className="poise-silhouette-icon" aria-hidden="true">
                      <circle cx="20" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
                      <path
                        d="M8 32 C8 25 13 22 20 22 C27 22 32 25 32 32"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <button
                      type="button"
                      className="button button-quiet button-sm poise-cam-toggle-btn"
                      onClick={toggleCamera}
                      disabled={isCameraLoading}
                    >
                      {isCameraLoading ? 'Starting...' : 'Turn on camera'}
                    </button>
                  </div>
                )}
                {isCameraOn && (
                  <button
                    type="button"
                    className="poise-cam-corner-btn"
                    onClick={stopCamera}
                    title="Turn camera off"
                  >
                    Turn off
                  </button>
                )}
              </div>

              {cameraError && (
                <div className="poise-device-error">
                  <span>⚠️ {cameraError}</span>
                </div>
              )}

              {/* Microphone Level */}
              <div className="poise-mic-section">
                <div className="poise-mic-label-row">
                  <span className="poise-mic-label">Microphone level</span>
                </div>
                <div className="poise-mic-meter-track" role="meter" aria-valuenow={micLevel} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className="poise-mic-meter-fill"
                    style={{ width: `${isMicActive ? Math.max(micLevel, 15) : 0}%` }}
                  />
                </div>
                <div className="poise-mic-helper">
                  {micError ? (
                    <span>
                      ⚠️ {micError}{' '}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => startMicMonitoring()}
                      >
                        Retry mic
                      </button>
                    </span>
                  ) : isMicActive ? (
                    'Say a sentence. Your voice is coming through clearly.'
                  ) : (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => startMicMonitoring()}
                    >
                      Click to test microphone
                    </button>
                  )}
                </div>
              </div>

              {/* Checkboxes */}
              <div className="poise-options-list">
                <label className="poise-checkbox-item">
                  <input
                    type="checkbox"
                    checked={analyzeVoice}
                    onChange={(e) => setAnalyzeVoice(e.target.checked)}
                  />
                  <span>Track speech pace and filler words</span>
                </label>
                <label className="poise-checkbox-item">
                  <input
                    type="checkbox"
                    checked={enableCameraPreview}
                    onChange={(e) => setEnableCameraPreview(e.target.checked)}
                  />
                  <span>Enable webcam video preview</span>
                </label>
                <label className="poise-checkbox-item">
                  <input
                    type="checkbox"
                    checked={saveRecording}
                    onChange={(e) => setSaveRecording(e.target.checked)}
                  />
                  <span>Save recording for replay</span>
                </label>
              </div>

              <p className="poise-privacy-disclaimer">
                Video stays on your device unless you choose to save it. You can delete any session later.
              </p>
            </section>

            {/* Prominent Begin Interview Button */}
            <button
              type="button"
              className="button poise-begin-interview-btn"
              disabled={isSubmitting}
              onClick={handleBeginInterview}
            >
              {isSubmitting ? 'Preparing your interview...' : 'Begin interview'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
