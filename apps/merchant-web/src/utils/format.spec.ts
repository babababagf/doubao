import { describe, expect, it } from 'vitest'

import { clampPercent, formatNumber, formatRelativeTime } from './format'

describe('format utilities', () => {
  it('格式化资源数字并约束百分比', () => {
    expect(formatNumber(8460)).toBe('8,460')
    expect(clampPercent(-8)).toBe(0)
    expect(clampPercent(42)).toBe(42)
    expect(clampPercent(120)).toBe(100)
  })

  it('格式化今天和昨天的任务时间', () => {
    const now = new Date('2026-08-06T12:00:00+08:00')
    expect(formatRelativeTime('2026-08-06T10:18:00+08:00', now)).toContain('今天')
    expect(formatRelativeTime('2026-08-05T16:33:00+08:00', now)).toContain('昨天')
  })
})
