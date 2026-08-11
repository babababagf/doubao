import { describe, expect, it, vi } from 'vitest'

import { AuthService } from './auth.service'

const config = { get: (_name: string, fallback: string) => fallback }

describe('AuthService 登录保护', () => {
  it('未提供会话令牌时注销保持幂等，不触碰数据库', async () => {
    const service = new AuthService({ session: { updateMany: vi.fn() } } as never, {} as never, config as never)
    await expect(service.logoutMerchant(undefined)).resolves.toBeUndefined()
  })

  it('密码连续失败时记录风控和匿名审计信息，不写入明文账号', async () => {
    const auditCreate = vi.fn(async () => undefined)
    const protection = { assertAllowed: vi.fn(async () => undefined), recordFailure: vi.fn(async () => true), clearFailures: vi.fn(async () => undefined) }
    const prisma = { user: { findUnique: vi.fn(async () => null) }, auditLog: { create: auditCreate } }
    const service = new AuthService(prisma as never, protection as never, config as never)

    await expect(service.loginMerchant('demo001', 'abc123')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }) })
    expect(protection.assertAllowed).toHaveBeenCalledOnce()
    expect(protection.recordFailure).toHaveBeenCalledOnce()
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'auth.login.locked', entityId: expect.stringMatching(/^principal:[a-f0-9]{64}$/) }),
    }))
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain('demo001')
  })

  it('成功登录后清除失败计数，并仅记录不可逆账号摘要', async () => {
    const auditCreate = vi.fn(async () => undefined)
    const protection = { assertAllowed: vi.fn(async () => undefined), recordFailure: vi.fn(async () => false), clearFailures: vi.fn(async () => undefined) }
    const prisma = {
      user: { findUnique: vi.fn(async () => ({ id: 'user-1', passwordHash: await import('argon2').then(({ hash }) => hash('abc123')), role: 'MERCHANT', status: 'ACTIVE', tenant: { id: 'tenant-1', status: 'ACTIVE', expiresAt: new Date('2099-01-01'), parent: null } })) },
      session: { create: vi.fn(async () => ({ id: 'session-1' })) },
      auditLog: { create: auditCreate },
    }
    const service = new AuthService(prisma as never, protection as never, config as never)

    await expect(service.loginMerchant('demo001', 'abc123')).resolves.toMatchObject({ sessionId: 'session-1' })
    expect(protection.clearFailures).toHaveBeenCalledOnce()
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'auth.login.succeeded', actorUserId: 'user-1' }) }))
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain('demo001')
  })
})
