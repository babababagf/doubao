import { describe, expect, it, vi } from 'vitest'

import { WorkspaceTaskPoller } from './workspace-poller'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

describe('WorkspaceTaskPoller', () => {
  it('不同商户并行同步且去除重复工作区', async () => {
    const first = deferred()
    const second = deferred()
    const started: string[] = []
    const poller = new WorkspaceTaskPoller(
      async () => [{ workspaceId: 'merchant-a' }, { workspaceId: 'merchant-b' }, { workspaceId: 'merchant-a' }],
      async (workspaceId) => { started.push(workspaceId); await (workspaceId === 'merchant-a' ? first.promise : second.promise) },
    )

    const run = poller.runOnce()
    await vi.waitFor(() => expect(started).toEqual(['merchant-a', 'merchant-b']))
    first.resolve()
    second.resolve()
    await run
  })

  it('同一商户上一轮未完成时不重复进入', async () => {
    const pending = deferred()
    const syncTarget = vi.fn(async () => pending.promise)
    const poller = new WorkspaceTaskPoller(async () => [{ workspaceId: 'merchant-a' }], syncTarget)

    const firstRun = poller.runOnce()
    await vi.waitFor(() => expect(syncTarget).toHaveBeenCalledTimes(1))
    await poller.runOnce()
    expect(syncTarget).toHaveBeenCalledTimes(1)
    pending.resolve()
    await firstRun
  })

  it('单个商户失败不会阻止其他商户和周期收尾', async () => {
    const cycleFinished = vi.fn()
    const completed: string[] = []
    const poller = new WorkspaceTaskPoller(
      async () => [{ workspaceId: 'merchant-a' }, { workspaceId: 'merchant-b' }],
      async (workspaceId) => { if (workspaceId === 'merchant-a') throw new Error('network'); completed.push(workspaceId) },
      cycleFinished,
    )

    await expect(poller.runOnce()).resolves.toBeUndefined()
    expect(completed).toEqual(['merchant-b'])
    expect(cycleFinished).toHaveBeenCalledOnce()
  })
})
