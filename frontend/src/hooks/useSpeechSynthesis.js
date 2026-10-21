import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Custom hook providing browser-native text-to-speech for the AI Interviewer.
 * Uses window.speechSynthesis without any external dependencies.
 */
export function useSpeechSynthesis({ defaultMuted = false } = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(Boolean(defaultMuted))
  const [error, setError] = useState('')

  const activeUtteranceRef = useRef(null)
  const lastSpokenTextRef = useRef('')
  const voicesRef = useRef([])
  const isMutedRef = useRef(Boolean(defaultMuted))
  const isMountedRef = useRef(true)

  const isSupported =
    typeof window !== 'undefined' &&
    Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance)

  // Keep isMutedRef synchronized with isMuted state
  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  // Populate voices when available (Chromium loads voices asynchronously)
  useEffect(() => {
    if (!isSupported) return

    const loadVoices = () => {
      try {
        voicesRef.current = window.speechSynthesis.getVoices() || []
      } catch {
        voicesRef.current = []
      }
    }

    loadVoices()
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    } else if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = loadVoices
    }

    return () => {
      if (typeof window.speechSynthesis.removeEventListener === 'function') {
        window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
      } else if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = null
      }
    }
  }, [isSupported])

  // Select a clear English voice if available
  const selectPreferredVoice = useCallback(() => {
    if (!isSupported || voicesRef.current.length === 0) return null
    const voices = voicesRef.current
    return (
      voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Daniel') ||
            v.name.includes('Jenny'))
      ) ||
      voices.find((v) => v.lang.startsWith('en') && !v.localService) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0] ||
      null
    )
  }, [isSupported])

  // Cancel any active speech
  const cancel = useCallback(() => {
    if (!isSupported) return

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }
      window.speechSynthesis.cancel()
    } catch {
      // ignore cancel error
    }

    activeUtteranceRef.current = null
    if (isMountedRef.current) {
      setIsSpeaking(false)
    }
  }, [isSupported])

  // Speak the provided text
  const speak = useCallback(
    (text, { rate = 1.0, pitch = 1.0 } = {}) => {
      if (isMountedRef.current) {
        setError('')
      }

      if (!isSupported) {
        if (isMountedRef.current) {
          setError('Text-to-speech is not supported in this browser.')
        }
        return false
      }

      if (!text || typeof text !== 'string' || !text.trim()) {
        return false
      }

      const trimmedText = text.trim()
      lastSpokenTextRef.current = trimmedText

      // If muted, do not produce audio
      if (isMutedRef.current) {
        return false
      }

      // Cancel any previous utterance so utterances never overlap
      cancel()

      try {
        const utterance = new window.SpeechSynthesisUtterance(trimmedText)
        utterance.rate = rate
        utterance.pitch = pitch
        utterance.lang = 'en-US'

        const voice = selectPreferredVoice()
        if (voice) {
          utterance.voice = voice
        }

        utterance.onstart = () => {
          if (!isMountedRef.current) return
          setIsSpeaking(true)
        }

        utterance.onend = () => {
          if (!isMountedRef.current) return
          if (activeUtteranceRef.current === utterance) {
            activeUtteranceRef.current = null
            setIsSpeaking(false)
          }
        }

        utterance.onerror = (event) => {
          if (!isMountedRef.current) return
          if (activeUtteranceRef.current !== utterance) {
            return
          }
          // 'canceled' and 'interrupted' are expected when cancel() is called
          if (event.error !== 'canceled' && event.error !== 'interrupted') {
            setError(`Speech synthesis error: ${event.error}`)
          }
          activeUtteranceRef.current = null
          setIsSpeaking(false)
        }

        // Retain reference to avoid premature garbage collection in Chromium
        activeUtteranceRef.current = utterance

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume()
        }
        window.speechSynthesis.speak(utterance)
        return true
      } catch (err) {
        if (isMountedRef.current) {
          setIsSpeaking(false)
          setError(err.message || 'Failed to initialize speech synthesis.')
        }
        activeUtteranceRef.current = null
        return false
      }
    },
    [cancel, isSupported, selectPreferredVoice]
  )

  // Replay the last spoken text
  const replay = useCallback(
    (options) => {
      if (!lastSpokenTextRef.current) return false
      return speak(lastSpokenTextRef.current, options)
    },
    [speak]
  )

  // Toggle mute setting
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      if (next) {
        cancel()
      }
      return next
    })
  }, [cancel])

  const setMuted = useCallback(
    (value) => {
      const shouldMute = Boolean(value)
      isMutedRef.current = shouldMute
      setIsMuted(shouldMute)
      if (shouldMute) {
        cancel()
      }
    },
    [cancel]
  )

  // Track mount status and clean up any active speech when component unmounts
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (isSupported) {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume()
          }
          window.speechSynthesis.cancel()
        } catch {
          // ignore
        }
      }
      activeUtteranceRef.current = null
    }
  }, [isSupported])

  return {
    isSupported,
    isSpeaking,
    isMuted,
    error,
    speak,
    cancel,
    replay,
    toggleMute,
    setMuted,
    clearError: () => setError(''),
  }
}
