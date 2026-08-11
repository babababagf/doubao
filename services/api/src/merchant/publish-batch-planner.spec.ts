import { describe, expect, it } from 'vitest'

import { planPublishAssignments } from './publish-batch-planner'

const startsAt = new Date('2026-08-08T06:00:00.000Z')

describe('发布批次规划', () => {
  it('单平台去重按平台取文章，并在同平台账号间轮询', () => {
    const result = planPublishAssignments({
      articleIds: ['a1', 'a2', 'a3', 'a4'],
      platforms: ['toutiao', 'douyin'],
      accountsByPlatform: { toutiao: ['tt-1', 'tt-2'], douyin: ['dy-1'] },
      publishCount: 3,
      deduplicationMode: 'per_platform',
      dailyLimits: { toutiao: 2, douyin: 3 },
      existing: [{ articleId: 'a1', platform: 'toutiao', deduplicationMode: 'per_platform' }],
      startsAt,
    })
    expect(result.assignments).toHaveLength(6)
    expect(result.assignments.filter((item) => item.platform === 'toutiao').map((item) => [item.articleId, item.mediaAccountId])).toEqual([['a2', 'tt-1'], ['a3', 'tt-2'], ['a4', 'tt-1']])
    expect(result.assignments.find((item) => item.articleId === 'a4' && item.platform === 'toutiao')?.scheduledAt.toISOString()).toBe('2026-08-09T06:00:00.000Z')
    expect(result.assignments.some((item) => item.articleId === 'a1' && item.platform === 'douyin')).toBe(true)
    expect(result.skippedDuplicateCount).toBe(1)
  })

  it('全平台去重只取未在任一平台出现的文章并跨平台分配', () => {
    const result = planPublishAssignments({
      articleIds: ['a1', 'a2', 'a3', 'a4'],
      platforms: ['toutiao', 'douyin'],
      accountsByPlatform: { toutiao: ['tt-1'], douyin: ['dy-1', 'dy-2'] },
      publishCount: 3,
      deduplicationMode: 'all_platforms',
      dailyLimits: { toutiao: 3, douyin: 3 },
      existing: [{ articleId: 'a1', platform: 'toutiao', deduplicationMode: 'per_platform' }],
      startsAt,
    })
    expect(result.assignments.map((item) => [item.articleId, item.platform, item.mediaAccountId])).toEqual([
      ['a2', 'toutiao', 'tt-1'],
      ['a3', 'douyin', 'dy-1'],
      ['a4', 'toutiao', 'tt-1'],
    ])
    expect(result.skippedDuplicateCount).toBe(1)
  })
})
