import { describe, expect, it } from 'vitest'

import { decideMediaConnectionProbe, mediaConnectionProbeLimit } from './media-connection-monitor'

describe('媒体账号扫码自动验证监控', () => {
  it('扫码中的页面不会跳转发布页', () => {
    expect(decideMediaConnectionProbe({ probeCount: 0, candidateCount: 1 }, 'awaiting_scan')).toEqual({ probeCount: 1, candidateCount: 0, action: 'wait' })
  })

  it('连续两次候选已登录才验证，验证后重新计数', () => {
    const first = decideMediaConnectionProbe({ probeCount: 0, candidateCount: 0 }, 'candidate_authenticated')
    expect(first).toEqual({ probeCount: 1, candidateCount: 1, action: 'wait' })
    expect(decideMediaConnectionProbe(first, 'candidate_authenticated')).toEqual({ probeCount: 2, candidateCount: 0, action: 'verify' })
  })

  it('浏览器关闭和超时会停止，不伪造已登录', () => {
    expect(decideMediaConnectionProbe({ probeCount: 3, candidateCount: 1 }, 'not_open')).toEqual({ probeCount: 4, candidateCount: 0, action: 'stop_closed' })
    expect(decideMediaConnectionProbe({ probeCount: mediaConnectionProbeLimit, candidateCount: 1 }, 'candidate_authenticated')).toEqual({ probeCount: mediaConnectionProbeLimit + 1, candidateCount: 0, action: 'stop_timeout' })
  })
})
