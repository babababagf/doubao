import { describe, expect, it } from 'vitest'
import { createInitialState, reconcileLocalAccountAvailability, recordLocalAccountConnected, recordLocalBrowserStartFailure, recordLocalLoginStillRequired, recordLocalPublisherOpen, recordMediaSessionBackup, recordMediaSessionBackupRefreshFailure, recordPendingPublicationResult, requestLocalAccountConnect, syncPublisherAccounts, syncPublisherTasks, toggleQueuePause, transitionTask } from './task-machine'

const accountRef = '11111111-1111-4111-8111-111111111111'

describe('desktop task machine', () => {
  it('初始状态不展示演示任务或虚构媒体账号', () => { const state = createInitialState(); expect(state.version).toBe(8); expect(state.tasks).toEqual([]); expect(state.accounts).toEqual([]); expect(state.settings.automaticSubmissionEnabled).toBe(true) })
  it('拒绝本机伪造云端任务状态', () => { expect(() => transitionTask(createInitialState(), 'any-task', 'queued')).toThrow('只能由任务服务确认') })
  it('暂停状态可恢复并保留日志', () => { const paused = toggleQueuePause(createInitialState()); expect(toggleQueuePause(paused).queuePaused).toBe(false) })
  it('同平台可以创建多个本地账号且引用相互独立', () => {
    const first = requestLocalAccountConnect(createInitialState(), 'toutiao', accountRef, '头条主号')
    const second = requestLocalAccountConnect(first, 'toutiao', '22222222-2222-4222-8222-222222222222', '头条分号')
    expect(second.accounts).toHaveLength(2)
    expect(second.accounts.map((account) => account.maskedName)).toEqual(['头条主号', '头条分号'])
  })
  it('只有发布页能力验证成功才标记连接', () => {
    const requested = requestLocalAccountConnect(createInitialState(), 'douyin', accountRef, '抖音主号')
    expect(recordLocalLoginStillRequired(requested, accountRef).accounts[0]?.status).toBe('verification_required')
    expect(recordLocalAccountConnected(requested, accountRef).accounts[0]?.status).toBe('connected')
  })
  it('打开与失败日志按账号而不是仅按平台记录', () => {
    const requested = requestLocalAccountConnect(createInitialState(), 'toutiao', accountRef, '头条主号')
    expect(recordLocalPublisherOpen(requested, accountRef).logs[0]).toContain('头条主号')
    expect(recordLocalBrowserStartFailure(requested, accountRef).logs[0]).toContain('头条主号')
  })
  it('同步任务保留服务端指定媒体账号引用', () => {
    const updated = syncPublisherTasks(createInitialState(), [{ id: 'publish-1', platform: 'douyin', status: 'attention', createdAt: '2026-08-07T00:00:00.000Z', failureReason: '需重新登录', attentionReason: 'login_required', canResume: true, canResolvePublished: false, attemptCount: 1, targetAccount: { localReferenceId: accountRef, maskedName: '抖音主号' }, article: { version: 2, title: '企业服务内容示例' } }])
    expect(updated.tasks[0]).toMatchObject({ id: 'publish-1', mediaAccountLocalReferenceId: accountRef, mediaAccountName: '抖音主号', attentionReason: 'login_required', canResume: true, canResolvePublished: false, attemptCount: 1 })
  })
  it('提交结果不明任务只开放人工核验已发布，不开放自动续发', () => {
    const updated = syncPublisherTasks(createInitialState(), [{ id: 'publish-2', platform: 'toutiao', status: 'attention', createdAt: '2026-08-08T00:00:00.000Z', failureReason: '提交结果不明', attentionReason: 'submission_unknown', canResume: false, canResolvePublished: true, attemptCount: 2, targetAccount: { localReferenceId: accountRef, maskedName: '头条主号' }, article: { version: 3, title: '人工核验文章' } }])
    expect(updated.tasks[0]).toMatchObject({ id: 'publish-2', canResume: false, canResolvePublished: true, attentionReason: 'submission_unknown', attemptCount: 2 })
  })
  it('新电脑可同步媒体账号标识和云端会话备份状态', () => {
    const updated = syncPublisherAccounts(createInitialState(), [{ id: 'media-1', platform: 'toutiao', status: 'connected', maskedName: '头条主号', localReferenceId: accountRef, lastVerifiedAt: '2026-08-08T00:00:00.000Z', failureReason: null, backupAvailable: true, backupCapturedAt: '2026-08-08T00:01:00.000Z' }])
    expect(updated.accounts[0]).toMatchObject({ remoteAccountId: 'media-1', localReferenceId: accountRef, status: 'connected', backupAvailable: true })
  })
  it('当前电脑既无本地资料也无云端备份时不把账号显示为可发布', () => {
    const synced = syncPublisherAccounts(createInitialState(), [{ id: 'media-1', platform: 'toutiao', status: 'connected', maskedName: '头条主号', localReferenceId: accountRef, lastVerifiedAt: '2026-08-08T00:00:00.000Z', failureReason: null, backupAvailable: false, backupCapturedAt: null }])
    const unavailable = reconcileLocalAccountAvailability(synced, () => false)
    expect(unavailable.accounts[0]).toMatchObject({ status: 'verification_required', backupAvailable: false, reason: expect.stringContaining('请重新扫码验证') })
    expect(reconcileLocalAccountAvailability(synced, () => true).accounts[0]).toMatchObject({ status: 'connected' })
  })
  it('云端存在加密备份时新电脑仍可保持已连接并按需恢复', () => {
    const synced = syncPublisherAccounts(createInitialState(), [{ id: 'media-2', platform: 'douyin', status: 'connected', maskedName: '抖音主号', localReferenceId: accountRef, lastVerifiedAt: '2026-08-08T00:00:00.000Z', failureReason: null, backupAvailable: true, backupCapturedAt: '2026-08-08T00:01:00.000Z' }])
    expect(reconcileLocalAccountAvailability(synced, () => false).accounts[0]).toMatchObject({ status: 'connected', backupAvailable: true })
  })
  it('刷新备份临时失败时保留上一次可恢复备份', () => {
    const requested = requestLocalAccountConnect(createInitialState(), 'toutiao', accountRef, '头条主号')
    const backedUp = recordMediaSessionBackup(recordLocalAccountConnected(requested, accountRef), accountRef, { available: true, capturedAt: '2026-08-08T08:00:00.000Z' })
    const failed = recordMediaSessionBackupRefreshFailure(backedUp, accountRef, '网络短暂不可用')
    expect(failed.accounts[0]).toMatchObject({ backupAvailable: true, backupCapturedAt: '2026-08-08T08:00:00.000Z' })
    expect(failed.accounts[0]?.reason).toContain('仍保留')
  })
  it('平台成功链接先落本机且后续同步不会丢失', () => {
    const remote = [{ id: 'publish-1', platform: 'douyin' as const, status: 'running' as const, createdAt: '2026-08-07T00:00:00.000Z', failureReason: null, attentionReason: null, canResume: false, canResolvePublished: false, attemptCount: 1, targetAccount: { localReferenceId: accountRef, maskedName: '抖音主号' }, article: { version: 2, title: '企业服务内容示例' } }]
    const synced = syncPublisherTasks(createInitialState(), remote)
    const pending = recordPendingPublicationResult(synced, 'publish-1', 'https://www.douyin.com/note/123')
    expect(syncPublisherTasks(pending, remote).tasks[0]?.pendingResultUrl).toBe('https://www.douyin.com/note/123')
  })
})
