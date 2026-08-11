import { describe, expect, it } from 'vitest'
import { emptyWorkspaceSessionVault, removeWorkspaceSession, upsertWorkspaceSession, validWorkspaceSessions } from './workspace-session-model'

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'

describe('发布助手多商户会话模型', () => {
  it('同一账号重新登录更新令牌但复用不可猜测工作区 ID', () => {
    const first = upsertWorkspaceSession(emptyWorkspaceSessionVault(), { accessToken: 'token-1', username: 'Demo001', expiresAt: '2099-01-01T00:00:00.000Z' }, () => firstId)
    const second = upsertWorkspaceSession(first.vault, { accessToken: 'token-2', username: 'demo001', expiresAt: '2099-02-01T00:00:00.000Z' }, () => secondId)
    expect(second.session.workspaceId).toBe(firstId)
    expect(second.vault.sessions).toHaveLength(1)
    expect(second.vault.sessions[0]?.accessToken).toBe('token-2')
  })

  it('过滤过期、损坏和重复工作区记录', () => {
    const sessions = validWorkspaceSessions({ sessions: [
      { workspaceId: firstId, accessToken: 'old', username: 'old001', expiresAt: '2020-01-01T00:00:00.000Z' },
      { workspaceId: secondId, accessToken: 'token', username: 'demo002', expiresAt: '2099-01-01T00:00:00.000Z' },
      { workspaceId: secondId, accessToken: 'token-new', username: 'demo002', expiresAt: '2099-02-01T00:00:00.000Z' },
      { workspaceId: '../escape', accessToken: 'bad', username: 'bad001', expiresAt: '2099-01-01T00:00:00.000Z' },
      { workspaceId: firstId, accessToken: 'bad-date', username: 'bad002', expiresAt: 'not-a-date' },
    ] }, new Date('2026-01-01T00:00:00.000Z'))
    expect(sessions).toEqual([{ workspaceId: secondId, accessToken: 'token-new', username: 'demo002', expiresAt: '2099-02-01T00:00:00.000Z' }])
  })

  it('退出单个工作区不影响其他商户会话', () => {
    const vault = { version: 2 as const, sessions: [
      { workspaceId: firstId, accessToken: 'one', username: 'demo001', expiresAt: '2099-01-01T00:00:00.000Z' },
      { workspaceId: secondId, accessToken: 'two', username: 'demo002', expiresAt: '2099-01-01T00:00:00.000Z' },
    ] }
    expect(removeWorkspaceSession(vault, firstId).sessions.map((session) => session.username)).toEqual(['demo002'])
  })
})
