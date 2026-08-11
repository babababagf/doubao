import { describe, expect, it } from 'vitest'

import { AccountStatus, TenantKind, UserRole } from '../generated/prisma/client'
import { TenantAdminService } from './tenant-admin.service'

const whiteLabelTenant = {
  id: 'white-label-1', name: '贴牌测试企业', kind: TenantKind.WHITE_LABEL, whiteLabelId: null,
  status: AccountStatus.ACTIVE, closedAt: null, expiresAt: new Date('2027-08-07T00:00:00.000Z'),
  agentSeatLimit: 3, merchantSeatLimit: 20,
  quota: { computePointsAvailable: 500, writingLimit: 20, writingUsed: 4 },
}

const agentTenant = {
  id: 'agent-1', name: '代理测试企业', kind: TenantKind.AGENT, whiteLabelId: 'white-label-1',
  status: AccountStatus.ACTIVE, closedAt: null, expiresAt: new Date('2027-08-07T00:00:00.000Z'),
  agentSeatLimit: 0, merchantSeatLimit: 5,
  quota: { computePointsAvailable: 200, writingLimit: 10, writingUsed: 3 },
}

function serviceFor(tenant: typeof whiteLabelTenant | typeof agentTenant): TenantAdminService {
  const prisma = {
    tenant: {
      findFirst: async () => tenant,
      findMany: async () => tenant.kind === TenantKind.WHITE_LABEL
        ? [{ id: 'agent-child-1', kind: TenantKind.AGENT, merchantSeatLimit: 4 }, { id: 'merchant-child-1', kind: TenantKind.MERCHANT, merchantSeatLimit: 0 }]
        : [{ id: 'merchant-child-1', kind: TenantKind.MERCHANT, merchantSeatLimit: 0 }],
      count: async () => tenant.kind === TenantKind.WHITE_LABEL ? 2 : 0,
    },
    brandConfiguration: { findUnique: async () => ({ nickname: '贴牌品牌', logoUrl: 'https://cdn.example.com/logo.png', version: 3 }) },
  }
  return new TenantAdminService(prisma as never)
}

describe('TenantAdminService 权限矩阵', () => {
  it('贴牌可开代理、管理贴牌资源并向下开商户', async () => {
    const actor = { userId: 'white-user', tenantId: whiteLabelTenant.id, username: 'white001', role: UserRole.WHITE_LABEL_ADMIN, status: AccountStatus.ACTIVE }
    const result = await serviceFor(whiteLabelTenant).bootstrap(actor)

    expect(result).toMatchObject({
      account: { role: 'white_label' },
      capabilities: {
        canCreateAgent: true,
        canCreateMerchant: true,
        canManageProviders: true,
        canManageObjectStorage: true,
        canRunDoubaoChecks: true,
      },
      entitlements: { agentUsage: 1, merchantUsage: 3, merchantReserved: 5, writingRemaining: 16 },
    })
  })

  it('代理只能开和管理普通商户，不能接触贴牌资源入口', async () => {
    const actor = { userId: 'agent-user', tenantId: agentTenant.id, username: 'agent001', role: UserRole.AGENT_ADMIN, status: AccountStatus.ACTIVE }
    const result = await serviceFor(agentTenant).bootstrap(actor)

    expect(result).toMatchObject({
      account: { role: 'agent' },
      capabilities: {
        canCreateAgent: false,
        canCreateMerchant: true,
        canManageProviders: false,
        canManageObjectStorage: false,
        canRunDoubaoChecks: false,
      },
      entitlements: { agentUsage: 0, agentLimit: 0, merchantUsage: 1, merchantReserved: 1, writingRemaining: 7 },
    })
  })

  it('代理查看商户时仅汇总每题最新成功检测，不得到批次或模型配置权限', async () => {
    const merchant = {
      id: 'merchant-1', name: '商户测试企业', kind: TenantKind.MERCHANT, whiteLabelId: whiteLabelTenant.id, parentId: agentTenant.id,
      status: AccountStatus.ACTIVE, closedAt: null, expiresAt: new Date('2027-08-07T00:00:00.000Z'),
      users: [{ usernameCanonical: 'merchant001' }], quota: { computePointsAvailable: 80, writingLimit: 10, writingUsed: 2, keywordLimit: 20 }, parent: { name: agentTenant.name },
    }
    const prisma = {
      tenant: {
        findFirst: async () => agentTenant,
        findMany: async () => [merchant],
      },
      doubaoCheckResult: {
        findMany: async () => [
          { id: 'new-unmatched', tenantId: merchant.id, questionId: 'question-1', matched: false, checkedAt: new Date('2026-08-08T02:00:00.000Z') },
          { id: 'new-matched', tenantId: merchant.id, questionId: 'question-2', matched: true, checkedAt: new Date('2026-08-08T01:00:00.000Z') },
          { id: 'old-matched', tenantId: merchant.id, questionId: 'question-1', matched: true, checkedAt: new Date('2026-08-07T01:00:00.000Z') },
        ],
      },
    }
    const service = new TenantAdminService(prisma as never)
    const actor = { userId: 'agent-user', tenantId: agentTenant.id, username: 'agent001', role: UserRole.AGENT_ADMIN, status: AccountStatus.ACTIVE }

    await expect(service.listMerchants(actor)).resolves.toEqual([expect.objectContaining({
      id: merchant.id, doubaoCheckedCount: 2, doubaoIncludedCount: 1, latestDoubaoCheckedAt: '2026-08-08T02:00:00.000Z',
    })])
  })
})
