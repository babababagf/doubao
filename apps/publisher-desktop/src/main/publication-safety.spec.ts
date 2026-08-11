import { describe, expect, it } from 'vitest'

import { safeAttentionReasonForSubmissionFailure, selectNextExecutableTask } from './publication-safety'
import type { DesktopTask, LocalMediaAccount } from '../shared/task-machine'

describe('automatic publication safety', () => {
  it('最终提交后即使弹出验证码也必须按结果不明阻断重试', () => {
    expect(safeAttentionReasonForSubmissionFailure({ reason: 'captcha_required', submissionStarted: true })).toBe('submission_unknown')
  })

  it('最终提交前的登录或验证码可保留原因供安全续发', () => {
    expect(safeAttentionReasonForSubmissionFailure({ reason: 'login_required', submissionStarted: false })).toBe('login_required')
    expect(safeAttentionReasonForSubmissionFailure({ reason: 'captcha_required', submissionStarted: false })).toBe('captcha_required')
  })

  it('旧版无目标账号任务不能阻塞后续已绑定账号任务', () => {
    const tasks = [
      { id: 'legacy', platform: 'toutiao', mediaAccountLocalReferenceId: null, status: 'queued' },
      { id: 'waiting-login', platform: 'toutiao', mediaAccountLocalReferenceId: '11111111-1111-4111-8111-111111111111', status: 'queued' },
      { id: 'ready', platform: 'toutiao', mediaAccountLocalReferenceId: '22222222-2222-4222-8222-222222222222', status: 'queued' },
    ] as DesktopTask[]
    const accounts = [
      { localReferenceId: '11111111-1111-4111-8111-111111111111', platform: 'toutiao', status: 'verification_required' },
      { localReferenceId: '22222222-2222-4222-8222-222222222222', platform: 'toutiao', status: 'connected' },
    ] as LocalMediaAccount[]

    expect(selectNextExecutableTask(tasks, accounts)).toMatchObject({ task: { id: 'ready' }, account: { localReferenceId: '22222222-2222-4222-8222-222222222222' } })
  })

  it('没有明确且已连接的目标账号时不领取任务', () => {
    const tasks = [{ id: 'legacy', platform: 'douyin', mediaAccountLocalReferenceId: null, status: 'queued' }] as DesktopTask[]
    expect(selectNextExecutableTask(tasks, [])).toBeNull()
  })
})
