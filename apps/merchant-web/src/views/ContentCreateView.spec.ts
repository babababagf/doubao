import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listAiTasks: vi.fn(),
  listGalleries: vi.fn(async () => []),
  listKeywords: vi.fn(async () => []),
  listKnowledgeLibraries: vi.fn(async () => []),
  listRetryableAiTaskQuestions: vi.fn(async () => []),
  listWritingInstructions: vi.fn(async () => []),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/services/http', () => ({
  ApiError: class ApiError extends Error {},
  isRealApiMode: true,
}))
vi.mock('@/services/merchant.service', () => ({
  createArticleAiTask: vi.fn(),
  createArticlesMock: vi.fn(),
  retryArticleAiTask: vi.fn(),
  stopAiTask: vi.fn(),
  ...mocks,
}))

import ContentCreateView from './ContentCreateView.vue'

const task = (status: 'queued' | 'succeeded') => ({
  id: 'task-1',
  type: 'article_writing',
  status,
  totalCount: 2,
  completedCount: status === 'succeeded' ? 2 : 0,
  failedCount: 0,
  computePointsReserved: status === 'succeeded' ? 0 : 60,
  writingReserved: status === 'succeeded' ? 0 : 2,
  failureReason: null,
  retryOfTaskId: null,
  createdAt: '2026-08-08T00:00:00.000Z',
  startedAt: null,
  completedAt: status === 'succeeded' ? '2026-08-08T00:00:05.000Z' : null,
})

describe('ContentCreateView 任务进度轮询', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.listAiTasks.mockReset()
    mocks.listAiTasks.mockResolvedValueOnce([task('queued')]).mockResolvedValue([task('succeeded')])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('仅有运行中任务时自动刷新，并在页面卸载后停止轮询', async () => {
    const wrapper = mount(ContentCreateView, { global: { stubs: { 'el-icon': true } } })
    await flushPromises()
    expect(mocks.listAiTasks).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(3_000)
    await flushPromises()
    expect(mocks.listAiTasks).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('2 / 2 已完成')

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(6_000)
    expect(mocks.listAiTasks).toHaveBeenCalledTimes(2)
  })
})
