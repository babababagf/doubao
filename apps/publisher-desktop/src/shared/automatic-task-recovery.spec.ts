import { describe, expect, it } from 'vitest'

import { recoverableTaskIdsForVerifiedAccount } from './automatic-task-recovery'
import type { SyncedPublisherTask } from './task-machine'

const account = { localReferenceId: 'account-1', platform: 'toutiao' as const }

function task(overrides: Partial<SyncedPublisherTask>): SyncedPublisherTask {
  return {
    id: 'task-1', platform: 'toutiao', status: 'attention', createdAt: '2026-08-08T00:00:00.000Z',
    failureReason: '本机平台登录已失效，需要重新扫码验证', attentionReason: 'login_required', canResume: true, canResolvePublished: false, attemptCount: 1,
    targetAccount: { localReferenceId: 'account-1', maskedName: '头条主号' }, article: { version: 1, title: '测试文章' },
    ...overrides,
  }
}

describe('已验证媒体账号的自动续发筛选', () => {
  it('只恢复同账号的登录或验证码中断任务', () => {
    expect(recoverableTaskIdsForVerifiedAccount([
      task({ id: 'login' }), task({ id: 'captcha', attentionReason: 'captcha_required' }),
      task({ id: 'other-account', targetAccount: { localReferenceId: 'account-2', maskedName: '其他号' } }), task({ id: 'other-platform', platform: 'douyin' }),
    ], account)).toEqual(['login', 'captcha'])
  })

  it('不恢复提交结果不明、页面变化或不可安全续发的任务', () => {
    expect(recoverableTaskIdsForVerifiedAccount([
      task({ id: 'unknown', attentionReason: 'submission_unknown', canResume: false, canResolvePublished: true }),
      task({ id: 'changed', attentionReason: 'platform_changed' }), task({ id: 'not-attention', status: 'queued' }),
    ], account)).toEqual([])
  })
})
