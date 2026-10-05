const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

export async function getHealth({ signal } = {}) {
  if (!apiBaseUrl) {
    throw new Error('VITE_API_BASE_URL is not configured')
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/health`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }

  return response.json()
}
