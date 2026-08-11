import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'

import { AccountStatus, DoubaoApiStatus, TenantKind, UserRole } from '../generated/prisma/client'
import type { AdminActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'

type ChildAccount = { id: string; companyName: string; username: string; kind: 'agent' | 'merchant'; status: 'active' | 'disabled' | 'expired'; expiresAt: string; parentName: string; computePoints: number; writingRemaining: number; keywordLimit: number; doubaoCheckedCount: number; doubaoIncludedCount: number; latestDoubaoCheckedAt: string | null }
type DoubaoSummary = { checkedCount: number; includedCount: number; latestCheckedAt: Date | null }

@Injectable()
export class TenantAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(actor: AdminActor) {
    const tenant = await this.currentTenant(actor)
    const [brand, children] = await Promise.all([
      this.prisma.brandConfiguration.findUnique({ where: { tenantId: tenant.kind === TenantKind.WHITE_LABEL ? tenant.id : tenant.whiteLabelId! } }),
      this.prisma.tenant.findMany({ where: { parentId: tenant.id, closedAt: null }, select: { id: true, kind: true, merchantSeatLimit: true } }),
    ])
    const directMerchantCount = children.filter((child) => child.kind === TenantKind.MERCHANT).length
    const agents = tenant.kind === TenantKind.WHITE_LABEL ? children.filter((child) => child.kind === TenantKind.AGENT) : []
    const delegatedMerchantSeats = agents.reduce((sum, child) => sum + child.merchantSeatLimit, 0)
    const delegatedMerchantUsage = agents.length
      ? await this.prisma.tenant.count({ where: { parentId: { in: agents.map((item) => item.id) }, kind: TenantKind.MERCHANT, closedAt: null } })
      : 0
    return {
      account: { id: tenant.id, companyName: tenant.name, role: actor.role === UserRole.WHITE_LABEL_ADMIN ? 'white_label' : 'agent', expiresAt: tenant.expiresAt.toISOString() },
      brand: { nickname: brand?.nickname ?? '豆包获客', logoUrl: brand?.logoUrl ?? '', version: brand?.version ?? 0 },
      entitlements: {
        computePoints: tenant.quota?.computePointsAvailable ?? 0,
        writingRemaining: tenant.quota ? Math.max(tenant.quota.writingLimit - tenant.quota.writingUsed, 0) : 0,
        merchantUsage: directMerchantCount + delegatedMerchantUsage,
        merchantReserved: directMerchantCount + delegatedMerchantSeats,
        merchantLimit: tenant.merchantSeatLimit,
        agentUsage: tenant.kind === TenantKind.WHITE_LABEL ? children.filter((child) => child.kind === TenantKind.AGENT).length : 0,
        agentLimit: tenant.agentSeatLimit,
      },
      capabilities: { canCreateAgent: actor.role === UserRole.WHITE_LABEL_ADMIN, canCreateMerchant: true, canManageProviders: actor.role === UserRole.WHITE_LABEL_ADMIN, canManageObjectStorage: actor.role === UserRole.WHITE_LABEL_ADMIN, canRunDoubaoChecks: actor.role === UserRole.WHITE_LABEL_ADMIN },
    }
  }

  async listAgents(actor: AdminActor): Promise<ChildAccount[]> {
    if (actor.role !== UserRole.WHITE_LABEL_ADMIN) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '代理账户仅贴牌可查看' })
    const tenant = await this.currentTenant(actor)
    const agents = await this.prisma.tenant.findMany({ where: { parentId: tenant.id, kind: TenantKind.AGENT, closedAt: null }, include: { users: { select: { usernameCanonical: true }, take: 1 }, quota: true }, orderBy: { createdAt: 'desc' } })
    return agents.map((item) => this.child(item, tenant.name))
  }

  async listMerchants(actor: AdminActor): Promise<ChildAccount[]> {
    const tenant = await this.currentTenant(actor)
    const where = actor.role === UserRole.WHITE_LABEL_ADMIN
      ? { whiteLabelId: tenant.id, kind: TenantKind.MERCHANT, closedAt: null }
      : { parentId: tenant.id, kind: TenantKind.MERCHANT, closedAt: null }
    const merchants = await this.prisma.tenant.findMany({ where, include: { users: { select: { usernameCanonical: true }, take: 1 }, quota: true, parent: { select: { name: true } } }, orderBy: { createdAt: 'desc' } })
    const summaries = await this.doubaoSummaries(merchants.map((merchant) => merchant.id))
    return merchants.map((item) => this.child(item, item.parent?.name ?? tenant.name, summaries.get(item.id)))
  }

  async updateChildStatus(actor: AdminActor, childId: string, input: { status?: unknown }): Promise<ChildAccount> {
    const targetStatus = input.status === 'active' ? AccountStatus.ACTIVE : input.status === 'disabled' ? AccountStatus.DISABLED : null
    if (!targetStatus) throw new ConflictException({ code: 'TENANT_STATUS_INVALID', message: '状态仅支持 active 或 disabled' })
    const owner = await this.currentTenant(actor)
    const child = await this.prisma.tenant.findFirst({ where: { id: childId, closedAt: null }, include: { users: { select: { usernameCanonical: true }, take: 1 }, quota: true, parent: { select: { name: true } } } })
    if (!child || !this.canManage(actor, owner.id, child)) throw new NotFoundException({ code: 'MANAGED_TENANT_NOT_FOUND', message: '账户不存在或不在当前管理范围' })
    if (child.status !== targetStatus) {
      const ids = child.kind === TenantKind.AGENT ? (await this.prisma.tenant.findMany({ where: { OR: [{ id: child.id }, { parentId: child.id }] }, select: { id: true } })).map((item) => item.id) : [child.id]
      await this.prisma.$transaction(async (tx) => {
        await tx.tenant.update({ where: { id: child.id }, data: { status: targetStatus } })
        await tx.session.updateMany({ where: { user: { tenantId: { in: ids } }, revokedAt: null }, data: { revokedAt: new Date() } })
        await tx.auditLog.create({ data: { tenantId: child.id, actorUserId: actor.userId, actorTenantId: owner.id, action: 'tenant.child_status.updated', entityType: 'Tenant', entityId: child.id, detail: { previousStatus: child.status.toLowerCase(), status: targetStatus.toLowerCase(), revokedTenantCount: ids.length } } })
      })
      child.status = targetStatus
    }
    return this.child(child, child.parent?.name ?? owner.name)
  }

  private async currentTenant(actor: AdminActor) {
    if (!actor.tenantId || (actor.role !== UserRole.WHITE_LABEL_ADMIN && actor.role !== UserRole.AGENT_ADMIN)) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '当前账户不是有效的贴牌或代理管理账户' })
    const tenant = await this.prisma.tenant.findFirst({ where: { id: actor.tenantId, status: AccountStatus.ACTIVE, closedAt: null }, include: { quota: true } })
    if (!tenant) throw new UnauthorizedException({ code: 'TENANT_INACTIVE', message: '当前租户已停用或不存在' })
    return tenant
  }

  private canManage(actor: AdminActor, ownerId: string, child: { kind: TenantKind; parentId: string | null; whiteLabelId: string | null }): boolean {
    if (actor.role === UserRole.WHITE_LABEL_ADMIN) return child.kind !== TenantKind.WHITE_LABEL && child.whiteLabelId === ownerId || child.parentId === ownerId
    return child.kind === TenantKind.MERCHANT && child.parentId === ownerId
  }

  private async doubaoSummaries(merchantIds: string[]): Promise<Map<string, DoubaoSummary>> {
    const summaries = new Map<string, DoubaoSummary>()
    if (!merchantIds.length) return summaries
    const rows = await this.prisma.doubaoCheckResult.findMany({ where: { tenantId: { in: merchantIds }, apiStatus: DoubaoApiStatus.SUCCEEDED, checkedAt: { not: null } }, select: { id: true, tenantId: true, questionId: true, matched: true, checkedAt: true }, orderBy: [{ tenantId: 'asc' }, { checkedAt: 'desc' }, { id: 'desc' }] })
    const seen = new Set<string>()
    for (const row of rows) {
      const key = `${row.tenantId}:${row.questionId ?? `legacy:${row.id}`}`
      if (seen.has(key)) continue
      seen.add(key)
      const summary = summaries.get(row.tenantId) ?? { checkedCount: 0, includedCount: 0, latestCheckedAt: null }
      summary.checkedCount += 1
      if (row.matched) summary.includedCount += 1
      if (!summary.latestCheckedAt && row.checkedAt) summary.latestCheckedAt = row.checkedAt
      summaries.set(row.tenantId, summary)
    }
    return summaries
  }

  private child(item: { id: string; name: string; kind: TenantKind; status: AccountStatus; expiresAt: Date; users: Array<{ usernameCanonical: string }>; quota: { computePointsAvailable: number; writingLimit: number; writingUsed: number; keywordLimit: number } | null }, parentName: string, doubao?: DoubaoSummary): ChildAccount {
    return { id: item.id, companyName: item.name, username: item.users[0]?.usernameCanonical ?? '—', kind: item.kind === TenantKind.AGENT ? 'agent' : 'merchant', status: item.expiresAt <= new Date() ? 'expired' : item.status.toLowerCase() as ChildAccount['status'], expiresAt: item.expiresAt.toISOString(), parentName, computePoints: item.quota?.computePointsAvailable ?? 0, writingRemaining: item.quota ? Math.max(item.quota.writingLimit - item.quota.writingUsed, 0) : 0, keywordLimit: item.quota?.keywordLimit ?? 0, doubaoCheckedCount: doubao?.checkedCount ?? 0, doubaoIncludedCount: doubao?.includedCount ?? 0, latestDoubaoCheckedAt: doubao?.latestCheckedAt?.toISOString() ?? null }
  }
}
