import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listMediaAccounts: vi.fn(),
  listPublishTasks: vi.fn(),
}))

vi.mock('@/services/merchant.service', () => mocks)

import MediaView from './MediaView.vue'

const now = new Date().toISOString()
const accounts = [
  { id: 'account-toutiao', platform: 'toutiao', status: 'connected', maskedName: '头条运营主号', avatarUrl: 'https://example.com/toutiao.png', localReferenceId: 'toutiao-local-reference', lastVerifiedAt: now, lastHeartbeatAt: now, failureReason: null, backupAvailable: true, backupCapturedAt: now },
  { id: 'account-douyin', platform: 'douyin', status: 'verification_required', maskedName: '抖音备用号', avatarUrl: null, localReferenceId: 'douyin-local-reference', lastVerifiedAt: now, lastHeartbeatAt: now, failureReason: '需要重新验证', backupAvailable: false, backupCapturedAt: null },
  { id: null, platform: 'smzdm', status: 'unbound', maskedName: null, avatarUrl: null, localReferenceId: null, lastVerifiedAt: null, lastHeartbeatAt: null, failureReason: null, backupAvailable: false, backupCapturedAt: null },
]

describe('MediaView 媒体账号表格', () => {
  beforeEach(() => {
    mocks.listMediaAccounts.mockReset().mockResolvedValue(accounts)
    mocks.listPublishTasks.mockReset().mockResolvedValue([
      { id: 'task-1', mediaAccountId: 'account-toutiao', status: 'succeeded', publishedAt: now },
      { id: 'task-2', mediaAccountId: 'account-toutiao', status: 'failed', publishedAt: null },
    ])
  })

  function mountView() {
    return mount(MediaView, {
      global: {
        stubs: {
          'el-icon': true,
          'el-switch': { props: ['modelValue', 'disabled'], template: '<button role="switch" :aria-checked="String(modelValue)" :disabled="disabled" />' },
        },
      },
    })
  }

  it('展示真实账号数量、头像、平台、发布统计、授权和登录状态', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.listMediaAccounts).toHaveBeenCalledTimes(1)
    expect(mocks.listPublishTasks).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('[data-testid="media-account-row"]')).toHaveLength(3)
    expect(wrapper.text()).toContain('账号授权 （2）')
    expect(wrapper.text()).toContain('已管理 2 个账号')
    expect(wrapper.text()).toContain('头条运营主号')
    expect(wrapper.text()).toContain('今日头条')
    expect(wrapper.text()).toContain('授权成功')
    expect(wrapper.text()).toContain('状态已保护')
    expect(wrapper.find('.today-cell').text()).toMatch(/1\s*\/\s*3/)
    expect(wrapper.find('img[alt="头条运营主号头像"]').attributes('src')).toBe('https://example.com/toutiao.png')
  })

  it('支持按平台和账号关键词筛选，并显示无结果状态', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.find('select[aria-label="按平台筛选"]').setValue('douyin')
    expect(wrapper.findAll('[data-testid="media-account-row"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('抖音备用号')

    await wrapper.find('input[aria-label="搜索账号"]').setValue('不存在的账号')
    expect(wrapper.findAll('[data-testid="media-account-row"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('没有符合当前筛选条件的媒体账号')
  })
})
