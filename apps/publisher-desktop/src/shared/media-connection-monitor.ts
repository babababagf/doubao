import type { LocalLoginProgress } from './media-platform'

export const mediaConnectionProbeLimit = 120

export type MediaConnectionMonitorDecision = {
  probeCount: number
  candidateCount: number
  action: 'wait' | 'verify' | 'stop_closed' | 'stop_timeout'
}

export function decideMediaConnectionProbe(previous: Pick<MediaConnectionMonitorDecision, 'probeCount' | 'candidateCount'>, progress: LocalLoginProgress): MediaConnectionMonitorDecision {
  const probeCount = previous.probeCount + 1
  if (progress === 'not_open') return { probeCount, candidateCount: 0, action: 'stop_closed' }
  if (probeCount > mediaConnectionProbeLimit) return { probeCount, candidateCount: 0, action: 'stop_timeout' }
  if (progress !== 'candidate_authenticated') return { probeCount, candidateCount: 0, action: 'wait' }
  const candidateCount = previous.candidateCount + 1
  return candidateCount >= 2
    ? { probeCount, candidateCount: 0, action: 'verify' }
    : { probeCount, candidateCount, action: 'wait' }
}
