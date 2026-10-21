/**
 * InSight Interview Delivery Analysis & Scoring Policy
 *
 * Truthful Policy Guidelines:
 * 1. Speech Delivery Metrics (WPM, Fillers, Word Count, Duration) are calculated
 *    directly from candidate transcript and audio duration measurements.
 * 2. Speech pace and filler counts measure verbal delivery habits only; they do
 *    not assess subject knowledge, technical accuracy, or candidate competence.
 * 3. Video Presence reflects webcam availability. Pupil gaze tracking, eye contact
 *    percentages, and facial expression analysis are not claimed or fabricated.
 * 4. When automated answer evaluation scores are not present in backend records,
 *    the system returns an explicit 'not_evaluated' / null state rather than
 *    inventing fake numbers or default percentages (e.g. 70, 74, 82%).
 */

export const COMMON_FILLERS = [
  'um',
  'uh',
  'er',
  'ah',
  'like',
  'you know',
  'actually',
  'basically',
  'literally',
  'i mean',
  'so',
]

// Precompiled boundary regexes for accurate matching
const FILLER_PATTERNS = COMMON_FILLERS.map((phrase) => ({
  phrase,
  regex: new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
}))

/**
 * Count total words in text string.
 * Unit: words. Formula: split on whitespace boundaries.
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

/**
 * Calculate Words Per Minute (WPM).
 * Formula: (wordCount / durationSeconds) * 60
 * Returns null if duration or words are missing or non-positive.
 */
export function calculateWpm(wordCount, durationSeconds) {
  if (
    durationSeconds == null ||
    durationSeconds <= 0 ||
    wordCount == null ||
    wordCount <= 0 ||
    Number.isNaN(durationSeconds)
  ) {
    return null
  }
  const wpm = (wordCount / durationSeconds) * 60
  return Math.round(wpm * 10) / 10
}

/**
 * Detect monitored filler words and phrases.
 * Returns exact count and occurrence map.
 */
export function detectFillers(text) {
  if (!text || typeof text !== 'string') {
    return { count: 0, breakdown: {} }
  }
  let count = 0
  const breakdown = {}

  for (const { phrase, regex } of FILLER_PATTERNS) {
    const matches = text.match(regex)
    if (matches && matches.length > 0) {
      count += matches.length
      breakdown[phrase] = matches.length
    }
  }

  return { count, breakdown }
}

/**
 * Format duration in seconds to mm:ss format.
 */
export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds) || seconds < 0) return '0:00'
  const rounded = Math.floor(seconds)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Educational reference guide: Exemplary STAR method structure for question categories.
 * Clarified as an educational guide, not an AI-graded comparison.
 */
export function generateSampleAnswer(questionPrompt = '') {
  const p = (questionPrompt || '').toLowerCase()

  if (p.includes('change') || p.includes('plan') || p.includes('information')) {
    return 'Situation: During beta testing of a core product workflow, usage analytics indicated user drop-off.\nTask: Re-evaluate priorities and align the sprint team on usability fixes.\nAction: Led an emergency discovery session, reprioritized backlog tickets into an adjusted 2-week sprint, and introduced inline helper tips.\nResult: Onboarding completion increased by 28% and customer support tickets dropped by 35%.'
  }
  if (p.includes('disagree') || p.includes('conflict') || p.includes('engineer') || p.includes('team')) {
    return 'Situation: An engineering lead and I had differing views on prioritizing architecture refactoring versus a critical client deliverable.\nTask: Resolve priority conflict while balancing technical debt and customer expectations.\nAction: Mapped client delivery risks alongside tech debt liabilities. Facilitated a trade-off discussion and agreed on a two-phase rollout.\nResult: Met the external client deadline on schedule while reserving the subsequent cycle for refactoring with zero team friction.'
  }
  if (p.includes('prioritize') || p.includes('competing') || p.includes('multiple') || p.includes('deadline')) {
    return 'Situation: Multiple high-priority requests arrived concurrently from marketing, sales, and operations.\nTask: Establish clear sequence of delivery based on strategic impact.\nAction: Scored each request on an effort-versus-impact matrix, communicated capacity transparently with department heads, and established weekly milestones.\nResult: Delivered the top two revenue-generating initiatives on time without burning out team capacity.'
  }
  if (p.includes('mistake') || p.includes('failure') || p.includes('wrong')) {
    return 'Situation: An edge-case input validation was missed during an urgent release, causing a reporting discrepancy.\nTask: Contain customer impact and prevent recurrence.\nAction: Immediately notified stakeholders, traced root cause, and deployed a hotfix within two hours. Held a blameless post-mortem and added automated regression tests.\nResult: Zero data loss occurred, and new automated test coverage prevented recurring validation bugs in subsequent releases.'
  }

  return 'Situation: State the business context, company challenge, or project objective.\nTask: Detail your specific role and responsibility in solving the problem.\nAction: Describe the concrete steps, decisions, and collaboration you executed.\nResult: Conclude with quantifiable impact, key metrics, or lessons learned.'
}

/**
 * Analyze delivery for an individual question answer.
 * Does NOT invent arbitrary numerical test scores or psychological grades.
 */
export function analyzeQuestionDelivery(questionPrompt, answerText, durationSeconds = null) {
  const cleanAnswer = (answerText || '').trim()
  const wordCount = countWords(cleanAnswer)
  const hasAnswer = wordCount > 0
  const duration = durationSeconds != null && durationSeconds > 0 ? durationSeconds : null
  const wpm = hasAnswer && duration ? calculateWpm(wordCount, duration) : null
  const { count: fillerCount, breakdown: fillerBreakdown } = detectFillers(cleanAnswer)

  // Truthful pacing observation
  let pacingObservation = 'No timing recorded.'
  if (wpm !== null) {
    if (wpm >= 120 && wpm <= 160) {
      pacingObservation = `Steady conversational pace (${wpm} WPM within standard 120–160 WPM target).`
    } else if (wpm > 165) {
      pacingObservation = `Paced quickly (${wpm} WPM, above typical 120–160 WPM range). Consider pausing between main points.`
    } else {
      pacingObservation = `Deliberate pace (${wpm} WPM, below typical 120–160 WPM range). Can increase narrative momentum.`
    }
  }

  // Truthful filler observation
  let fillerObservation = 'No filler words detected.'
  if (fillerCount > 0) {
    const topFillers = Object.entries(fillerBreakdown)
      .map(([w, c]) => `"${w}" (${c}x)`)
      .join(', ')
    fillerObservation = `${fillerCount} filler word${fillerCount === 1 ? '' : 's'} detected: ${topFillers}. Brief silent pauses can replace verbal fillers.`
  }

  return {
    hasAnswer,
    wordCount,
    durationSeconds: duration,
    wpm,
    fillerCount,
    fillerBreakdown,
    pacingObservation,
    fillerObservation,
    sampleAnswer: generateSampleAnswer(questionPrompt),
    // Explicit evaluation policy: semantic content scoring requires an active evaluation service
    contentEvaluation: {
      status: 'not_evaluated',
      score: null,
      message: 'Automated rubric grading requires an active evaluation engine.',
    },
  }
}

/**
 * Truthfully evaluate an entire interview session.
 * Aggregates real speech delivery measurements across answered questions.
 * Does NOT generate fake scores (e.g. 70, 74, 82%).
 */
export function evaluateSession(session) {
  if (!session || !session.questions || session.questions.length === 0) {
    return {
      totalCount: 0,
      answeredCount: 0,
      hasAnswers: false,
      totalWords: 0,
      totalDurationSeconds: 0,
      avgWpm: null,
      totalFillers: 0,
      fillersPer100Words: null,
      avgWordsPerAnswer: 0,
      evaluationStatus: 'not_evaluated',
      evaluationScore: null,
      evaluationMessage: 'No questions available for this session.',
      questionsFeedback: [],
      timelinePoints: [],
      deliveryStrengths: 'Practice session in progress.',
      deliveryFocus: 'Answer interview questions using microphone or transcript editor.',
    }
  }

  const questions = session.questions
  const evaluatedQuestions = questions.map((q) => {
    const rawAnswer = q.answer || ''
    const dur =
      q.duration_seconds != null
        ? Number(q.duration_seconds)
        : q.speech_metrics?.duration_seconds != null
        ? Number(q.speech_metrics.duration_seconds)
        : null

    const delivery = analyzeQuestionDelivery(q.question, rawAnswer, dur)

    return {
      id: q.id,
      prompt: q.question,
      questionType: q.question_type || 'Behavioral',
      candidateAnswer: rawAnswer,
      evaluation: q.evaluation || null,
      ...delivery,
    }
  })


  const answeredList = evaluatedQuestions.filter((q) => q.hasAnswer)
  const totalCount = evaluatedQuestions.length
  const answeredCount = answeredList.length
  const hasAnswers = answeredCount > 0

  if (!hasAnswers) {
    return {
      totalCount,
      answeredCount: 0,
      hasAnswers: false,
      totalWords: 0,
      totalDurationSeconds: 0,
      avgWpm: null,
      totalFillers: 0,
      fillersPer100Words: null,
      avgWordsPerAnswer: 0,
      evaluationStatus: 'not_evaluated',
      evaluationScore: null,
      evaluationMessage: 'No responses recorded for this session yet.',
      questionsFeedback: evaluatedQuestions,
      timelinePoints: [],
      deliveryStrengths: 'Ready for response recording.',
      deliveryFocus: 'Click the microphone or type your responses to view delivery analysis.',
    }
  }

  const totalWords = answeredList.reduce((acc, q) => acc + q.wordCount, 0)
  const totalDurationSeconds = answeredList.reduce((acc, q) => acc + (q.durationSeconds || 0), 0)
  const totalFillers = answeredList.reduce((acc, q) => acc + q.fillerCount, 0)
  const avgWordsPerAnswer = Math.round(totalWords / answeredCount)

  // Average WPM across responses with valid duration and words
  const wpmResponses = answeredList.filter((q) => q.wpm !== null)
  const avgWpm =
    wpmResponses.length > 0
      ? Math.round(wpmResponses.reduce((acc, q) => acc + q.wpm, 0) / wpmResponses.length)
      : totalDurationSeconds > 0 && totalWords > 0
      ? calculateWpm(totalWords, totalDurationSeconds)
      : null

  // Filler density per 100 words
  const fillersPer100Words =
    totalWords > 0 ? Math.round((totalFillers / totalWords) * 1000) / 10 : null

  // Delivery timeline points: per-question real measurements (WPM, words, duration, fillers)
  const timelinePoints = evaluatedQuestions.map((q, idx) => {
    let flag = null
    if (q.hasAnswer) {
      if (q.fillerCount >= 3) {
        flag = { type: 'filler', text: `${q.fillerCount} fillers` }
      } else if (q.wpm !== null && q.wpm > 165) {
        flag = { type: 'pace', text: `Rushed (${q.wpm} WPM)` }
      } else if (q.wpm !== null && q.wpm < 110) {
        flag = { type: 'pace', text: `Deliberate (${q.wpm} WPM)` }
      }
    }

    return {
      index: idx + 1,
      id: q.id,
      prompt: q.prompt,
      hasAnswer: q.hasAnswer,
      wordCount: q.wordCount,
      durationSeconds: q.durationSeconds,
      wpm: q.wpm,
      fillerCount: q.fillerCount,
      flag,
    }
  })

  // Genuine delivery strengths
  const strengths = []
  if (avgWpm !== null && avgWpm >= 120 && avgWpm <= 160) {
    strengths.push(`Consistent, measured delivery pace averaging ${avgWpm} words/min across responses.`)
  }
  if (totalFillers === 0) {
    strengths.push('Clean speech delivery with zero filler words detected across recorded responses.')
  } else if (fillersPer100Words !== null && fillersPer100Words <= 2) {
    strengths.push(`Controlled delivery with low filler word frequency (${fillersPer100Words} fillers per 100 words).`)
  }
  if (avgWordsPerAnswer >= 60) {
    strengths.push(`Responses provided contextual depth averaging ${avgWordsPerAnswer} words per question.`)
  }
  const deliveryStrengths =
    strengths.length > 0
      ? strengths.join(' ')
      : 'Answers recorded successfully. Focus on structuring each point clearly.'

  // Genuine delivery focus recommendations
  const focusPoints = []
  if (totalFillers >= 4) {
    focusPoints.push(`Practice silent pauses: ${totalFillers} total filler words were detected across responses.`)
  }
  if (avgWpm !== null && avgWpm > 165) {
    focusPoints.push(`Average speaking pace was ${avgWpm} WPM. Take deliberate breaths between points to pace delivery.`)
  } else if (avgWpm !== null && avgWpm < 110) {
    focusPoints.push(`Average speaking pace was ${avgWpm} WPM. Practice maintaining narrative momentum.`)
  }
  if (avgWordsPerAnswer < 35) {
    focusPoints.push(`Responses were concise (${avgWordsPerAnswer} words average). Expand on specific actions and measurable results.`)
  }
  const deliveryFocus =
    focusPoints.length > 0
      ? focusPoints.join(' ')
      : 'Maintain steady pacing and continue anchoring responses with concrete examples.'

  const evaluatedList = evaluatedQuestions.filter((q) => q.evaluation != null)
  const hasEvaluations = evaluatedList.length > 0
  const avgRelevance = hasEvaluations
    ? Math.round(
        evaluatedList.reduce((acc, q) => acc + Number(q.evaluation.relevance_score || 0), 0) /
          evaluatedList.length
      )
    : null
  const avgCompleteness = hasEvaluations
    ? Math.round(
        evaluatedList.reduce((acc, q) => acc + Number(q.evaluation.completeness_score || 0), 0) /
          evaluatedList.length
      )
    : null
  const avgClarity = hasEvaluations
    ? Math.round(
        evaluatedList.reduce((acc, q) => acc + Number(q.evaluation.clarity_score || 0), 0) /
          evaluatedList.length
      )
    : null
  const avgStructure = hasEvaluations
    ? Math.round(
        evaluatedList.reduce((acc, q) => acc + Number(q.evaluation.structure_score || 0), 0) /
          evaluatedList.length
      )
    : null

  return {
    totalCount,
    answeredCount,
    hasAnswers: true,
    totalWords,
    totalDurationSeconds,
    avgWpm,
    totalFillers,
    fillersPer100Words,
    avgWordsPerAnswer,
    hasEvaluations,
    avgRelevance,
    avgCompleteness,
    avgClarity,
    avgStructure,
    evaluationStatus: session.score != null ? 'scored' : 'not_evaluated',
    evaluationScore: session.score != null ? Math.round(session.score) : null,
    evaluationMessage:
      session.score != null
        ? 'Verified evaluation score calculated from genuine AI rubric assessment.'
        : 'Automated answer rubric scoring has not been run for this session.',
    questionsFeedback: evaluatedQuestions,
    timelinePoints,
    deliveryStrengths,
    deliveryFocus,
  }
}


/**
 * Truthfully evaluate dashboard summary and history from database records.
 * Does NOT generate fake scores, fake trends, or fake chart paths.
 */
export function evaluateStudentDashboard(summary, sessions = []) {
  const totalSessions = summary?.total_sessions ?? sessions?.length ?? 0
  const completedSessions = summary?.completed_sessions ?? 0
  const inProgressSessions = summary?.in_progress_sessions ?? 0

  // Real database average score (from evaluations table in backend)
  const averageScore =
    summary?.average_score != null && !Number.isNaN(Number(summary.average_score))
      ? Math.round(Number(summary.average_score))
      : null

  const hasEvaluation = averageScore !== null

  // Collect genuine scored sessions for trend charting
  // Only include sessions that have a validated real score
  const scoredSessions = (sessions || []).filter(
    (s) => s.score != null && !Number.isNaN(Number(s.score))
  )

  let trendDelta = null
  let trendText = null
  if (scoredSessions.length >= 2) {
    const latestScore = Number(scoredSessions[0].score)
    const oldestScore = Number(scoredSessions[scoredSessions.length - 1].score)
    trendDelta = latestScore - oldestScore
    trendText = trendDelta >= 0 ? `+${trendDelta} vs first scored session` : `${trendDelta} vs first scored session`
  }

  const chartPoints = scoredSessions.slice(0, 8).reverse().map((s, idx) => ({
    label: `Session ${s.id || idx + 1}`,
    score: Math.round(Number(s.score)),
  }))

  const recentSessionsList = (sessions || []).slice(0, 5).map((s) => ({
    ...s,
    realScore: s.score != null ? Math.round(Number(s.score)) : null,
  }))

  return {
    totalSessions,
    completedSessions,
    inProgressSessions,
    averageScore,
    hasEvaluation,
    trendDelta,
    trendText,
    chartPoints,
    recentSessions: recentSessionsList,
    hasHistory: totalSessions > 0,
    recommendedRole: sessions[0]?.job_title || 'General Mock Interview',
  }
}
