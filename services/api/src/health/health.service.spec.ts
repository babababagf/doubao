import { describe, expect, it } from 'vitest'

import { readinessResult } from './health.service'

describe('生产就绪状态', () => {
  it('数据库和Redis可用时，非生产强制模式允许Worker暂未启动但如实显示', () => {
    expect(readinessResult({ database: true, redis: true, aiWorker: false, doubaoWorker: false, requireWorkers: false })).toEqual({
      status: 'ok', ready: true,
      checks: { database: 'ok', redis: 'ok', workers: { required: false, ai: 'missing', doubao: 'missing' } },
    })
  })

  it('生产要求Worker时，任一心跳缺失即不可接流量', () => {
    const result = readinessResult({ database: true, redis: true, aiWorker: true, doubaoWorker: false, requireWorkers: true })
    expect(result.ready).toBe(false)
    expect(result.status).toBe('degraded')
  })

  it.each([
    { database: false, redis: true },
    { database: true, redis: false },
  ])('核心依赖不可用时始终不可就绪：$database/$redis', ({ database, redis }) => {
    expect(readinessResult({ database, redis, aiWorker: true, doubaoWorker: true, requireWorkers: false }).ready).toBe(false)
  })
})
