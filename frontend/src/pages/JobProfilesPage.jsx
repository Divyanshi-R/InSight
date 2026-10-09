import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  createJobProfile,
  deleteJobProfile,
  generateJobProfileQuestions,
  getJobProfile,
  getJobProfileQuestions,
  getJobProfiles,
  startInterview,
  updateJobProfileQuestionApproval,
} from '../services/api'

function formatDate(value) {
  if (!value) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export default function JobProfilesPage() {
  const { token, user, logout } = useAuth()
  const { jobProfileId } = useParams()
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [questions, setQuestions] = useState(null)
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [questionsError, setQuestionsError] = useState('')
  const [isStartingInterview, setIsStartingInterview] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const loadProfiles = useCallback(async (signal) => {
    setIsLoading(true)
    setError('')
    try {
      const result = await getJobProfiles(token, { signal })
      setProfiles(result)
    } catch (requestError) {
      if (requestError.status === 401) handleUnauthorized()
      else if (requestError.name !== 'AbortError') setError(requestError.message)
    } finally {
      if (!signal.aborted) setIsLoading(false)
    }
  }, [token, handleUnauthorized])

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => loadProfiles(controller.signal))
    return () => controller.abort()
  }, [loadProfiles])

  const loadQuestions = useCallback(async (signal) => {
    if (!jobProfileId) return
    setIsLoadingQuestions(true)
    setQuestionsError('')
    try {
      const result = await getJobProfileQuestions(token, jobProfileId, { signal })
      setQuestions(result.questions)
    } catch (requestError) {
      if (requestError.status === 401) handleUnauthorized()
      else if (requestError.name !== 'AbortError') setQuestionsError(requestError.message)
    } finally {
      if (!signal.aborted) setIsLoadingQuestions(false)
    }
  }, [jobProfileId, token, handleUnauthorized])

  useEffect(() => {
    if (!jobProfileId) return undefined

    const controller = new AbortController()
    Promise.resolve()
      .then(() => {
        setSelectedProfile(null)
        setQuestions(null)
        setError('')
        return getJobProfile(token, jobProfileId, { signal: controller.signal })
      })
      .then((profile) => {
        setSelectedProfile(profile)
        return loadQuestions(controller.signal)
      })
      .catch((requestError) => {
        if (requestError.status === 401) handleUnauthorized()
        else if (requestError.name !== 'AbortError') setError(requestError.message)
      })
    return () => controller.abort()
  }, [jobProfileId, token, handleUnauthorized, loadQuestions])

  async function handleGenerateQuestions() {
    setIsGenerating(true)
    setQuestionsError('')
    try {
      const result = await generateJobProfileQuestions(token, jobProfileId)
      setQuestions(result.questions)
    } catch (requestError) {
      if (requestError.status === 401) handleUnauthorized()
      else setQuestionsError(requestError.message)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleToggleApproval(question) {
    setTogglingId(question.id)
    setQuestionsError('')
    const nextApproved = !question.approved_by_student
    try {
      const updated = await updateJobProfileQuestionApproval(
        token,
        jobProfileId,
        question.id,
        nextApproved
      )
      setQuestions((current) =>
        current?.map((q) => (q.id === question.id ? updated : q))
      )
    } catch (requestError) {
      if (requestError.status === 401) handleUnauthorized()
      else setQuestionsError(requestError.message)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleStartInterview() {
    setIsStartingInterview(true)
    setQuestionsError('')
    try {
      const session = await startInterview(token, selectedProfile.id)
      navigate(`/interview/${session.id}`)
    } catch (requestError) {
      if (requestError.status === 401) handleUnauthorized()
      else setQuestionsError(requestError.message)
      setIsStartingInterview(false)
    }
  }

  function validateForm() {
    if (!jobTitle.trim()) {
      setFormError('Enter a job title.')
      return false
    }
    if (!jobDescription.trim()) {
      setFormError('Enter a job description.')
      return false
    }
    return true
  }

  async function handleCreate(event) {
    event.preventDefault()
    setFormError('')
    if (!validateForm()) return

    setIsCreating(true)
    setError('')
    try {
      const created = await createJobProfile(token, {
        job_title: jobTitle.trim(),
        job_description: jobDescription.trim(),
        experience_level: experienceLevel.trim() || null,
      })
      setProfiles((currentProfiles) => [
        created,
        ...(currentProfiles ?? []).filter((profile) => profile.id !== created.id),
      ])
      setJobTitle('')
      setJobDescription('')
      setExperienceLevel('')
      setShowForm(false)
    } catch (requestError) {
      if (requestError.status === 401) handleUnauthorized()
      else setFormError(requestError.message)
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDelete(profile) {
    const confirmed = window.confirm(`Delete "${profile.job_title}"? This cannot be undone.`)
    if (!confirmed) return

    setDeletingId(profile.id)
    setError('')
    try {
      await deleteJobProfile(token, profile.id)
      setProfiles((currentProfiles) => currentProfiles.filter((item) => item.id !== profile.id))
      if (String(profile.id) === jobProfileId) navigate('/job-profiles', { replace: true })
      if (String(profile.id) === jobProfileId) setSelectedProfile(null)
    } catch (requestError) {
      if (requestError.status === 401) handleUnauthorized()
      else setError(requestError.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="header-inner">
          <Link className="brand dashboard-brand" to="/dashboard" aria-label="InSight dashboard">
            <span className="brand-mark" aria-hidden="true">i</span>
            <span>InSight</span>
          </Link>
          <nav className="header-nav" aria-label="Main navigation">
            <Link className="nav-link" to="/dashboard">Dashboard</Link>
            <span className="nav-current"><span className="nav-dot" />Job Profiles</span>
          </nav>
          <div className="header-account">
            <div className="account-copy">
              <span className="account-name">{user.name}</span>
              <span className="account-role">{user.role}</span>
            </div>
            <span className="avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
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

      <main className="dashboard-main job-profiles-main">
        <div className="job-profiles-heading">
          <div>
            <Link className="back-link" to="/dashboard">← Back to dashboard</Link>
            <span className="eyebrow">PERSONALIZE YOUR PRACTICE</span>
            <h1>{selectedProfile ? selectedProfile.job_title : 'Job Profiles'}</h1>
            <p>
              {selectedProfile
                ? 'Review the role details you saved.'
                : 'Save roles you’re preparing for and keep the important details close.'}
            </p>
          </div>
          {!jobProfileId && (
            <button
              className="button button-primary create-profile-button"
              type="button"
              onClick={() => {
                setShowForm((isVisible) => !isVisible)
                setFormError('')
              }}
            >
              <span aria-hidden="true">{showForm ? '−' : '+'}</span>
              {showForm ? 'Close form' : 'New job profile'}
            </button>
          )}
        </div>

        {error && (
          <div className="dashboard-error job-profile-error" role="alert">
            <span>{error}</span>
            {!jobProfileId && (
              <button className="text-button" type="button" onClick={() => loadProfiles(new AbortController().signal)}>
                Try again
              </button>
            )}
          </div>
        )}

        {jobProfileId ? (
          selectedProfile && String(selectedProfile.id) === jobProfileId ? (
            <>
              <article className="profile-detail-card">
              <div className="profile-detail-top">
                <div>
                  <span className="eyebrow">SAVED JOB PROFILE</span>
                  <h2>{selectedProfile.job_title}</h2>
                </div>
                {selectedProfile.experience_level && (
                  <span className="experience-badge">{selectedProfile.experience_level}</span>
                )}
              </div>
              <div className="profile-detail-meta">
                <span>Created {formatDate(selectedProfile.created_at)}</span>
                {selectedProfile.updated_at && (
                  <span>Updated {formatDate(selectedProfile.updated_at)}</span>
                )}
              </div>
              <div className="profile-description">
                <h3>Job description</h3>
                <p>{selectedProfile.job_description}</p>
              </div>
              <div className="profile-detail-actions">
                <Link className="button button-quiet" to="/job-profiles">Back to profiles</Link>
                <button
                  className="button button-danger"
                  type="button"
                  disabled={deletingId === selectedProfile.id}
                  onClick={() => handleDelete(selectedProfile)}
                >
                  {deletingId === selectedProfile.id ? 'Deleting...' : 'Delete profile'}
                </button>
              </div>
            </article>

            <section className="profile-questions-section" aria-label="Interview questions">
              <div className="questions-section-header">
                <div>
                  <span className="eyebrow">PRACTICE PREPARATION</span>
                  <h2>Generated Questions</h2>
                  <p>
                    {questions?.length
                      ? `${questions.filter((q) => q.approved_by_student).length} of ${questions.length} questions approved for practice.`
                      : 'Generate questions tailored to this role and select which ones you want to practice.'}
                  </p>
                </div>
                <div className="questions-header-actions">
                  {questions && questions.length > 0 && (
                    <button
                      className="button button-quiet"
                      type="button"
                      disabled={isGenerating}
                      onClick={handleGenerateQuestions}
                    >
                      {isGenerating ? 'Generating...' : '+ Generate more'}
                    </button>
                  )}
                  {questions && questions.length > 0 && (
                    <button
                      className="button button-primary start-interview-button"
                      type="button"
                      disabled={
                        isStartingInterview ||
                        questions.filter((q) => q.approved_by_student).length === 0
                      }
                      onClick={handleStartInterview}
                      title={
                        questions.filter((q) => q.approved_by_student).length === 0
                          ? 'Approve at least one question to start an interview'
                          : 'Start interview practice'
                      }
                    >
                      {isStartingInterview ? 'Starting session...' : 'Start Interview'}
                      <span aria-hidden="true">→</span>
                    </button>
                  )}
                </div>
              </div>

              {questionsError && (
                <div className="dashboard-error questions-error" role="alert">
                  <span>{questionsError}</span>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => loadQuestions(new AbortController().signal)}
                  >
                    Try again
                  </button>
                </div>
              )}

              {isLoadingQuestions ? (
                <div className="sessions-panel dashboard-loading" role="status">
                  Loading interview questions...
                </div>
              ) : isGenerating ? (
                <div className="sessions-panel dashboard-loading" role="status">
                  Generating AI questions tailored to {selectedProfile.job_title}...
                </div>
              ) : questions?.length ? (
                <div className="questions-list">
                  {questions.map((question, index) => (
                    <article
                      className={`question-card ${
                        question.approved_by_student ? 'question-card--approved' : ''
                      }`}
                      key={question.id}
                    >
                      <div className="question-card-top">
                        <div className="question-badges">
                          <span className="question-index">#{index + 1}</span>
                          <span className="question-pill question-pill--type">
                            {question.question_type}
                          </span>
                          <span className="question-pill question-pill--difficulty">
                            {question.difficulty}
                          </span>
                        </div>
                        <label className="question-approve-label">
                          <input
                            type="checkbox"
                            checked={question.approved_by_student}
                            disabled={togglingId === question.id}
                            onChange={() => handleToggleApproval(question)}
                          />
                          <span>{question.approved_by_student ? 'Approved' : 'Approve'}</span>
                        </label>
                      </div>
                      <p className="question-text">{question.question}</p>
                      {question.skill_tags?.length > 0 && (
                        <div className="question-tags">
                          {question.skill_tags.map((tag) => (
                            <span className="skill-tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state questions-empty-state">
                  <div className="empty-art" aria-hidden="true">
                    <span className="empty-spark spark-a">✳</span>
                    <span className="empty-spark spark-b">✦</span>
                  </div>
                  <h3>No questions generated yet</h3>
                  <p>
                    Generate AI interview questions based on {selectedProfile.job_title} to practice answering them.
                  </p>
                  <button
                    className="button button-primary empty-create-button"
                    type="button"
                    disabled={isGenerating}
                    onClick={handleGenerateQuestions}
                  >
                    {isGenerating ? 'Generating questions...' : 'Generate interview questions'}
                    {!isGenerating && <span aria-hidden="true">→</span>}
                  </button>
                </div>
              )}
            </section>
          </>
        ) : error ? (
            <div className="profile-load-error" role="alert">
              <p>{error}</p>
              <Link className="button button-quiet" to="/job-profiles">Back to profiles</Link>
            </div>
          ) : (
            <div className="sessions-panel dashboard-loading" role="status">Loading job profile...</div>
          )
        ) : (
          <>
            {showForm && (
              <form className="profile-form-card" onSubmit={handleCreate} noValidate>
                <div className="profile-form-heading">
                  <div>
                    <span className="eyebrow">ADD A ROLE</span>
                    <h2>New job profile</h2>
                  </div>
                  <p>Your profile is private to your account.</p>
                </div>
                <label htmlFor="job-title">Job title <span aria-hidden="true">*</span></label>
                <input
                  id="job-title"
                  type="text"
                  maxLength={150}
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="e.g. Junior Software Engineer"
                  aria-invalid={Boolean(formError && !jobTitle.trim())}
                  required
                />
                <label htmlFor="job-description">Job description <span aria-hidden="true">*</span></label>
                <textarea
                  id="job-description"
                  rows={6}
                  maxLength={20000}
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Paste or write the responsibilities, requirements, and skills for this role..."
                  aria-invalid={Boolean(formError && !jobDescription.trim())}
                  required
                />
                <label htmlFor="experience-level">Experience level <span className="optional-label">(optional)</span></label>
                <input
                  id="experience-level"
                  type="text"
                  maxLength={80}
                  value={experienceLevel}
                  onChange={(event) => setExperienceLevel(event.target.value)}
                  placeholder="e.g. Entry level, 2–4 years"
                />
                {formError && <p className="form-error profile-form-error" role="alert">{formError}</p>}
                <div className="profile-form-actions">
                  <button
                    className="button button-quiet"
                    type="button"
                    disabled={isCreating}
                    onClick={() => {
                      setShowForm(false)
                      setFormError('')
                    }}
                  >
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={isCreating}>
                    {isCreating ? 'Saving profile...' : 'Save job profile'}
                    {!isCreating && <span aria-hidden="true">→</span>}
                  </button>
                </div>
              </form>
            )}

            <div className="job-profile-list-heading">
              <div>
                <span className="eyebrow">YOUR SAVED ROLES</span>
                <h2>Job profiles</h2>
              </div>
              {profiles && <span className="session-count">{profiles.length} {profiles.length === 1 ? 'profile' : 'profiles'}</span>}
            </div>
            {isLoading ? (
              <div className="sessions-panel dashboard-loading" role="status">Loading your job profiles...</div>
            ) : profiles?.length ? (
              <div className="job-profile-grid">
                {profiles.map((profile) => (
                  <article className="job-profile-card" key={profile.id}>
                    <div className="job-profile-card-top">
                      <span className="profile-card-icon" aria-hidden="true">⌘</span>
                      {profile.experience_level && (
                        <span className="experience-badge">{profile.experience_level}</span>
                      )}
                    </div>
                    <h3>{profile.job_title}</h3>
                    <p className="job-profile-preview">{profile.job_description}</p>
                    <time className="profile-created-date" dateTime={profile.created_at}>
                      Added {formatDate(profile.created_at)}
                    </time>
                    <div className="job-profile-actions">
                      <Link className="button button-profile-view" to={`/job-profiles/${profile.id}`}>View profile <span aria-hidden="true">→</span></Link>
                      <button
                        className="button button-profile-delete"
                        type="button"
                        disabled={deletingId === profile.id}
                        onClick={() => handleDelete(profile)}
                      >
                        {deletingId === profile.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state profile-empty-state">
                <div className="empty-art" aria-hidden="true">
                  <span className="empty-spark spark-a">✳</span>
                  <span className="empty-spark spark-b">✦</span>
                  <span className="empty-paper"><span /><span /><span /></span>
                </div>
                <h3>No job profiles saved yet</h3>
                <p>Add a job title and description to keep the roles you’re preparing for in one place.</p>
                <button className="button button-primary empty-create-button" type="button" onClick={() => setShowForm(true)}>
                  Create your first profile <span aria-hidden="true">→</span>
                </button>
              </div>
            )}
          </>
        )}
        <footer className="dashboard-footer">
          <span>InSight <span aria-hidden="true">✳</span> A little practice goes a long way.</span>
          <span>Signed in as {user.email}</span>
        </footer>
      </main>
    </div>
  )
}
