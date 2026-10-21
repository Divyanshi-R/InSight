/**
 * Date and Time utilities for InSight
 * Ensures UTC dates from SQLite / backend APIs are converted into the candidate's local timezone.
 */

export function parseUtcDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  let str = String(value).trim()
  if (!str) return null

  // If the ISO string lacks 'Z' and lacks timezone offset [+-]HH:MM, treat as UTC
  if (!str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) {
    str = str.replace(' ', 'T') + 'Z'
  }

  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? new Date(value) : d
}

export function formatDateTime(value) {
  const d = parseUtcDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

export function formatRelativeTime(value) {
  const d = parseUtcDate(value)
  if (!d) return 'Recently'
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d)
}
