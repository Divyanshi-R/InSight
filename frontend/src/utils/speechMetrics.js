export const COMMON_FILLER_WORDS = [
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

// Precompiled regex for word/phrase boundaries
const FILLER_REGEXES = COMMON_FILLER_WORDS.map((phrase) => ({
  phrase,
  regex: new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
}))

export function countWords(text) {
  if (!text || typeof text !== 'string') return 0
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

export function calculateWpm(wordCount, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0 || !wordCount || wordCount <= 0) {
    return null
  }
  const wpm = (wordCount / durationSeconds) * 60
  return Math.round(wpm * 10) / 10
}

export function detectFillerWords(text) {
  if (!text || typeof text !== 'string') return {}
  const counts = {}
  for (const { phrase, regex } of FILLER_REGEXES) {
    const matches = text.match(regex)
    if (matches && matches.length > 0) {
      counts[phrase] = matches.length
    }
  }
  return counts
}

export function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds) || seconds < 0) return '0:00'
  const rounded = Math.floor(seconds)
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function analyzeClientSpeech(text, durationSeconds = null) {
  const wordCount = countWords(text)
  const roundedDuration = durationSeconds != null && durationSeconds >= 0
    ? Math.round(durationSeconds * 10) / 10
    : null
  const wpm = calculateWpm(wordCount, roundedDuration)
  const fillerWords = detectFillerWords(text)
  const fillerCount = Object.values(fillerWords).reduce((sum, count) => sum + count, 0)

  return {
    word_count: wordCount,
    duration_seconds: roundedDuration,
    words_per_minute: wpm,
    filler_words_count: fillerCount,
    filler_words: fillerWords,
    pause_analysis: 'Pause analysis is not yet available',
  }
}
