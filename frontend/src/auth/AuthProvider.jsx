import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCurrentUser, login as loginRequest } from '../services/api'
import { AuthContext } from './context'

const STORAGE_KEY = 'insight.auth'

function readStoredSession() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const session = JSON.parse(stored)
    if (typeof session.token !== 'string' || !session.user?.id) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return session
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession)
  const [isLoading, setIsLoading] = useState(() => Boolean(readStoredSession()?.token))

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    const stored = readStoredSession()
    if (!stored?.token) return undefined

    const controller = new AbortController()
    getCurrentUser(stored.token, { signal: controller.signal })
      .then((user) => {
        const nextSession = { token: stored.token, user }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession))
        setSession(nextSession)
      })
      .catch((error) => {
        if (error.name !== 'AbortError' && error.status === 401) clearSession()
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [clearSession])

  const login = useCallback(async (email, password) => {
    const result = await loginRequest(email, password)
    const nextSession = { token: result.access_token, user: result.user }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession))
    setSession(nextSession)
    return result.user
  }, [])

  const logout = useCallback(() => {
    clearSession()
  }, [clearSession])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isLoading,
      login,
      logout,
    }),
    [session, isLoading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
