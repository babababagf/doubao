import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createArticleAiTask: vi.fn(),
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
  createArticlesMock: vi.fn(),
  retryArticleAiTask: vi.fn(),
  stopAiTask: vi.fn(),
  ...mocks,
}))

import ContentCreateView from './ContentCreateView.vue'

const task = (status: 'queued' | 'succeeded') => ({
  id: 'task-1',
  articleGroupId: 'group-1',
  groupName: '2026-08 西安 GEO 优化',
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
    mocks.listKeywords.mockResolvedValue([])
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

  it('默认展示任务表，点击左上角添加任务后才显示创作配置', async () => {
    const wrapper = mount(ContentCreateView, { global: { stubs: { 'el-icon': true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('AI 写作任务')
    expect(wrapper.text()).toContain('2026-08 西安 GEO 优化')
    expect(wrapper.find('[aria-label="添加 AI 写作任务"]').exists()).toBe(false)

    const addButton = wrapper.findAll('button').find((button) => button.text().includes('添加任务'))
    expect(addButton).toBeTruthy()
    await addButton!.trigger('click')

    expect(wrapper.find('[aria-label="添加 AI 写作任务"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('创作配置')
  })

  it('问题词只显示为随机参考池，不再把剩余3条限制成最多3篇', async () => {
    mocks.listKeywords.mockResolvedValueOnce([{
      id: 'keyword-1', name: '西安GEO优化', brandTerms: [], status: 'enabled', questionTotal: 3, uncreatedCount: 3, checkedCount: 0, createdAt: '2026-08-22T00:00:00.000Z',
    }] as never)
    const wrapper = mount(ContentCreateView, { global: { stubs: { 'el-icon': true } } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('添加任务'))!.trigger('click')

    expect(wrapper.text()).toContain('3 个参考问题词')
    expect(wrapper.text()).toContain('问题词可重复使用，不再限制创作篇数')
    expect(wrapper.text()).not.toContain('可创作 3 篇')
    expect(wrapper.find('input[type="number"]').attributes('max')).toBe('100')
    expect((wrapper.find('input[readonly]').element as HTMLInputElement).value).toContain('西安GEO优化')
    expect(wrapper.find('textarea').attributes('placeholder')).toContain('西安哪家火锅好吃？')
    expect(wrapper.find('textarea').attributes('placeholder')).toContain('西安哪个火锅性价比高？')
    expect(wrapper.text()).toContain('建议填写正向、自然的用户提问')
  })

  it('切换优化关键词后自动更新只读文章分组名', async () => {
    mocks.listKeywords.mockResolvedValueOnce([
      { id: 'keyword-1', name: '西安GEO优化', brandTerms: [], status: 'enabled', questionTotal: 3, uncreatedCount: 3, checkedCount: 0, createdAt: '2026-08-22T00:00:00.000Z' },
      { id: 'keyword-2', name: '西安火锅', brandTerms: [], status: 'enabled', questionTotal: 8, uncreatedCount: 8, checkedCount: 0, createdAt: '2026-08-22T00:00:00.000Z' },
    ] as never)
    const wrapper = mount(ContentCreateView, { global: { stubs: { 'el-icon': true } } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('添加任务'))!.trigger('click')

    const groupInput = wrapper.find('input[readonly]')
    expect((groupInput.element as HTMLInputElement).value).toContain('西安GEO优化')
    await wrapper.find('select').setValue('keyword-2')
    expect((groupInput.element as HTMLInputElement).value).toContain('西安火锅')
    expect((groupInput.element as HTMLInputElement).value).not.toContain('西安GEO优化')
  })

  it('选择企业图库后自动至少使用 1 张配图', async () => {
    mocks.listGalleries.mockResolvedValueOnce([{
      id: 'gallery-1', name: '企业图库', description: '', imageCount: 2, createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z',
    }] as never)
    const wrapper = mount(ContentCreateView, { global: { stubs: { 'el-icon': true } } })
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('添加任务'))!.trigger('click')

    const gallerySelect = wrapper.findAll('select').find((select) => select.find('option[value="gallery-1"]').exists())
    expect(gallerySelect).toBeTruthy()
    await gallerySelect!.setValue('gallery-1')

    const noImageButton = wrapper.findAll('button').find((button) => button.text().includes('无配图'))
    const oneImageButton = wrapper.findAll('button').find((button) => button.text().includes('1 张配图'))
    expect(noImageButton?.attributes('disabled')).toBeDefined()
    expect(oneImageButton?.classes()).toContain('active')
    expect(wrapper.text()).toContain('写作完成后插入文章正文，发布任务继续使用同一张图片')
  })
})
