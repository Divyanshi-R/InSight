const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

function getApiUrl(path) {
  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is not configured')
  }
  return `${apiBaseUrl.replace(/\/$/, '')}${path}`
}

function getErrorMessage(payload, fallback) {
  if (typeof payload?.detail === 'string') return payload.detail
  if (Array.isArray(payload?.detail)) {
    return payload.detail.map((issue) => issue.msg).filter(Boolean).join(' ')
  }
  return fallback
}

async function request(path, { token, signal, ...options } = {}) {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(getApiUrl(path), {
    ...options,
    headers,
    signal,
  })
  const payload = response.status === 204 ? null : await response.json()

  if (!response.ok) {
    const error = new Error(getErrorMessage(payload, `Request failed with status ${response.status}`))
    error.status = response.status
    throw error
  }

  return payload
}

export async function getHealth({ signal } = {}) {
  return request('/api/health', { signal })
}

export async function login(email, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register({ name, email, password }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  })
}

export async function getCurrentUser(token, { signal } = {}) {
  return request('/api/auth/me', { token, signal })
}

export async function getDashboardSummary(token, { signal } = {}) {
  return request('/api/dashboard/summary', { token, signal })
}

export async function getDashboardRecent(token, { signal } = {}) {
  return request('/api/dashboard/recent', { token, signal })
}
