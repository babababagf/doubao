import { describe, expect, it, vi } from 'vitest'

import { controlledWorkerConcurrency, startWorkerHeartbeat } from './worker-runtime'

describe('Worker 运行参数', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['1', 1],
    ['4', 4],
    ['16', 16],
    ['0', 1],
    ['17', 1],
    ['2.5', 1],
    ['abc', 1],
  ])('并发参数 %s 解析为 %s', (value, expected) => {
    expect(controlledWorkerConcurrency(value)).toBe(expected)
  })

  it('立即写入带30秒TTL的心跳且允许显式停止定时器', async () => {
    vi.useFakeTimers()
    const set = vi.fn(async (key: string, value: string, mode: string, ttl: number) => {
      void key; void value; void mode; void ttl
      return 'OK'
    })
    const stop = startWorkerHeartbeat({ set } as never, 'worker:key')
    await vi.runAllTicks()
    expect(set).toHaveBeenCalledOnce()
    expect(set.mock.calls[0]?.[0]).toBe('worker:key')
    expect(set.mock.calls[0]?.[2]).toBe('EX')
    expect(set.mock.calls[0]?.[3]).toBe(30)
    expect(JSON.parse(String(set.mock.calls[0]?.[1]))).toMatchObject({ instanceId: expect.any(String), at: expect.any(String) })
    stop()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(set).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
