export interface RemoteUpdatePolicy {
  enabled: boolean
  feedUrl: string | null
  minimumVersion: string | null
  releaseNotes: string
  updatedAt: string | null
}

export type UpdatePhase = 'not_configured' | 'checking' | 'up_to_date' | 'available' | 'downloading' | 'ready_to_install' | 'blocked' | 'failed'

export interface DesktopUpdateStatus {
  phase: UpdatePhase
  version: string | null
  message: string
  releaseNotes: string
}

const versionPattern = /^\d+\.\d+\.\d+$/

export function isValidUpdateVersion(value: string | null): value is string {
  return Boolean(value && versionPattern.test(value))
}

export function isVersionBelow(current: string, minimum: string): boolean {
  if (!isValidUpdateVersion(current) || !isValidUpdateVersion(minimum)) return false
  const currentParts = current.split('.').map(Number)
  const minimumParts = minimum.split('.').map(Number)
  for (let index = 0; index < currentParts.length; index += 1) {
    const currentPart = currentParts[index] ?? 0
    const minimumPart = minimumParts[index] ?? 0
    if (currentPart !== minimumPart) return currentPart < minimumPart
  }
  return false
}

export function isAllowedUpdateFeed(value: string | null): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && !url.username && !url.password && host !== 'localhost' && !host.endsWith('.local') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.includes(':')
  } catch {
    return false
  }
}

export function resolveUpdateReleaseNotes(manifestNotes: unknown, configuredNotes: string): string {
  const manifestText = typeof manifestNotes === 'string'
    ? manifestNotes
    : Array.isArray(manifestNotes)
      ? manifestNotes
        .map((entry) => entry && typeof entry === 'object' && 'note' in entry && typeof entry.note === 'string' ? entry.note : '')
        .filter(Boolean)
        .join('\n\n')
      : ''
  return (manifestText.trim() || configuredNotes.trim()).slice(0, 2_000)
}
