import { useCallback, useEffect, useRef, useState } from 'react'

export function useCameraPreview() {
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [cameraError, setCameraError] = useState('')

  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const isCameraSupported =
    typeof window !== 'undefined' &&
    Boolean(navigator?.mediaDevices?.getUserMedia)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // ignore error on stop
        }
      })
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsCameraOn(false)
    setIsLoading(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError('')

    if (!isCameraSupported) {
      setCameraError('Camera access is not supported in this browser.')
      return false
    }

    // Stop any existing stream before starting a new one
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          // ignore
        }
      })
      streamRef.current = null
    }

    setIsLoading(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false, // Keep camera and microphone completely independent
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      setIsCameraOn(true)
      setIsLoading(false)
      return true
    } catch (err) {
      setIsLoading(false)
      setIsCameraOn(false)

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError(
          'Camera access was denied. Please allow camera permissions in your browser to view your video, or continue practicing with microphone or text.'
        )
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError(
          'No camera device found on this system. You can continue practicing with microphone or text.'
        )
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError(
          'Camera is currently in use by another application. Please close the other application and try again.'
        )
      } else if (err.name === 'OverconstrainedError') {
        setCameraError('Camera resolution or constraints not supported by your device.')
      } else {
        setCameraError(err.message || 'Unable to access camera.')
      }

      return false
    }
  }, [isCameraSupported])

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      stopCamera()
    } else {
      await startCamera()
    }
  }, [isCameraOn, startCamera, stopCamera])

  // Ensure videoRef receives stream if mounted or re-rendered
  useEffect(() => {
    if (isCameraOn && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current
      }
    }
  }, [isCameraOn])

  // Release all media tracks on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop()
          } catch {
            // ignore
          }
        })
        streamRef.current = null
      }
    }
  }, [])

  return {
    videoRef,
    isCameraOn,
    isLoading,
    cameraError,
    isCameraSupported,
    startCamera,
    stopCamera,
    toggleCamera,
    clearCameraError: () => setCameraError(''),
  }
}
