import { useCallback, useEffect, useRef, useState } from 'react'

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState(null)
  const [error, setError] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')

  const isSpeechRecognitionSupported = typeof window !== 'undefined' && Boolean(
    window.SpeechRecognition || window.webkitSpeechRecognition
  )
  const isMediaRecorderSupported = typeof window !== 'undefined' && Boolean(
    navigator?.mediaDevices?.getUserMedia && window.MediaRecorder
  )

  const mediaRecorderRef = useRef(null)
  const recognitionRef = useRef(null)
  const timerRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const startTimeRef = useRef(null)
  const finalTranscriptRef = useRef('')

  // Cleanup active audio recording resources
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resetRecording = useCallback(() => {
    cleanupStream()
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    setIsRecording(false)
    setRecordingDuration(0)
    setError('')
    setInterimTranscript('')
    finalTranscriptRef.current = ''
  }, [audioUrl, cleanupStream])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // ignore if already stopped
      }
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore if already stopped
      }
    }
    cleanupStream()
    setIsRecording(false)
    setInterimTranscript('')
  }, [cleanupStream])

  const startRecording = useCallback(
    async ({ onTranscriptUpdate } = {}) => {
      setError('')
      setInterimTranscript('')
      finalTranscriptRef.current = ''

      if (!isMediaRecorderSupported) {
        setError(
          'Audio recording is not supported in this browser. Please use a modern browser such as Chrome or Edge.'
        )
        return false
      }

      // Revoke previous audio URL if any
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
        setAudioUrl(null)
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        chunksRef.current = []
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : ''

        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }

        recorder.onstop = () => {
          const blobType = mimeType || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type: blobType })
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob)
            setAudioUrl(url)
          }
        }

        recorder.start(250) // capture in small 250ms chunks

        // Set up Web Speech API recognition if supported
        if (isSpeechRecognitionSupported) {
          const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
          const recognition = new SpeechRec()
          recognition.continuous = true
          recognition.interimResults = true
          recognition.lang = 'en-US'

          recognition.onresult = (event) => {
            let interim = ''
            let finalAccumulator = ''
            for (let i = 0; i < event.results.length; i += 1) {
              const res = event.results[i]
              if (res.isFinal) {
                finalAccumulator += res[0].transcript + ' '
              } else {
                interim += res[0].transcript
              }
            }
            finalTranscriptRef.current = finalAccumulator.trim()
            setInterimTranscript(interim)

            const fullText = (finalAccumulator + ' ' + interim).trim()
            if (onTranscriptUpdate && fullText) {
              onTranscriptUpdate(fullText)
            }
          }

          recognition.onerror = (event) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
              console.warn('Speech recognition event:', event.error)
            }
          }

          recognition.onend = () => {
            setInterimTranscript('')
          }

          recognitionRef.current = recognition
          try {
            recognition.start()
          } catch (recErr) {
            console.warn('Could not start speech recognition:', recErr)
          }
        }

        startTimeRef.current = Date.now()
        setRecordingDuration(0)
        setIsRecording(true)

        timerRef.current = setInterval(() => {
          if (startTimeRef.current) {
            const elapsed = (Date.now() - startTimeRef.current) / 1000
            setRecordingDuration(Math.round(elapsed))
          }
        }, 500)

        return true
      } catch (err) {
        cleanupStream()
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError(
            'Microphone access was denied. Please allow microphone permissions in your browser address bar to record your voice response.'
          )
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError(
            'No microphone was found on this device. You can type your answer in the text box below.'
          )
        } else {
          setError(`Unable to access microphone: ${err.message}`)
        }
        return false
      }
    },
    [audioUrl, cleanupStream, isMediaRecorderSupported, isSpeechRecognitionSupported]
  )

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupStream()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop()
        } catch {
          // ignore
        }
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // ignore
        }
      }
    }
  }, [cleanupStream])

  return {
    isRecording,
    recordingDuration,
    audioUrl,
    error,
    setError,
    interimTranscript,
    isSpeechRecognitionSupported,
    isMediaRecorderSupported,
    startRecording,
    stopRecording,
    resetRecording,
  }
}
