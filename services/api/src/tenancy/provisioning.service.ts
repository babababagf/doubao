import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import * as argon2 from 'argon2'
import { randomUUID } from 'node:crypto'
import { AccountStatus, DomainPurpose, DomainBindingStatus, EntitlementEntryType, LoginRealm, TenantKind, UserRole, type Prisma } from '../generated/prisma/client'
import { isValidAccountText, normalizeUsername } from '../common/password-policy'
import type { AdminActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'

type WhiteLabelInput = { username: unknown; password: unknown; companyName: unknown; agentLimit: unknown; merchantLimit: unknown; computePoints: unknown; writingLimit: unknown; primaryDomain?: unknown; expiresAt: unknown }
type AgentInput = { username: unknown; password: unknown; companyName: unknown; merchantLimit: unknown; computePoints: unknown; writingLimit: unknown; primaryDomain?: unknown; expiresAt: unknown }
type MerchantInput = { username: unknown; password: unknown; companyName: unknown; keywordLimit: unknown; computePoints: unknown; writingLimit: unknown; primaryDomain?: unknown; expiresAt: unknown }
type ProvisionResult = { tenantId: string; username: string; status: 'active'; expiresAt: string; domainStatus: 'pending_verification' | null }
type BrandInput = { nickname: unknown; logoUrl: unknown }

const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
function positiveInteger(value: unknown): number | null { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null }
function validDate(value: unknown): Date | null { if (typeof value !== 'string') return null; const date = new Date(value); return Number.isNaN(date.valueOf()) || date <= new Date() ? null : date }
function validDomain(value: unknown): string | null | undefined { if (value === undefined || value === null || value === '') return null; return typeof value === 'string' && domainPattern.test(value) ? value.toLowerCase() : undefined }

@Injectable()
export class ProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async listWhiteLabels(actor: AdminActor): Promise<Array<{ id: string; companyName: string; username: string; status: 'active' | 'disabled'; expiresAt: string; agentUsage: number; agentLimit: number; merchantUsage: number; merchantReserved: number; merchantLimit: number; computePoints: number; writingRemaining: number; primaryDomain: string | null; domainStatus: 'pending_verification' | 'active' | 'disabled' | null; brand: { nickname: string; logoUrl: string; version: number } }>> {
    if (actor.role !== UserRole.PLATFORM_ADMIN) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '仅总后台可查看贴牌' })
    const tenants = await this.prisma.tenant.findMany({
      where: { kind: TenantKind.WHITE_LABEL, closedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { users: { where: { role: UserRole.WHITE_LABEL_ADMIN }, select: { usernameCanonical: true }, take: 1 }, quota: true, brand: true, children: { where: { closedAt: null }, select: { id: true, kind: true, merchantSeatLimit: true } }, ownedDomainBindings: { orderBy: { createdAt: 'asc' }, take: 1 } },
    })
    const agentIds = tenants.flatMap((tenant) => tenant.children.filter((child) => child.kind === TenantKind.AGENT).map((child) => child.id))
    const agentMerchants = agentIds.length
      ? await this.prisma.tenant.findMany({ where: { parentId: { in: agentIds }, kind: TenantKind.MERCHANT, closedAt: null }, select: { parentId: true } })
      : []
    const agentMerchantCount = new Map<string, number>()
    for (const merchant of agentMerchants) agentMerchantCount.set(merchant.parentId!, (agentMerchantCount.get(merchant.parentId!) ?? 0) + 1)
    return tenants.map((tenant) => {
      const directMerchants = tenant.children.filter((child) => child.kind === TenantKind.MERCHANT).length
      const agents = tenant.children.filter((child) => child.kind === TenantKind.AGENT)
      const delegatedMerchants = agents.reduce((sum, child) => sum + child.merchantSeatLimit, 0)
      const delegatedMerchantUsage = agents.reduce((sum, child) => sum + (agentMerchantCount.get(child.id) ?? 0), 0)
      const domain = tenant.ownedDomainBindings[0]
      return {
        id: tenant.id,
        companyName: tenant.name,
        username: tenant.users[0]?.usernameCanonical ?? '—',
        status: tenant.status === AccountStatus.ACTIVE ? 'active' : 'disabled',
        expiresAt: tenant.expiresAt.toISOString(),
        agentUsage: tenant.children.filter((child) => child.kind === TenantKind.AGENT).length,
        agentLimit: tenant.agentSeatLimit,
        merchantUsage: directMerchants + delegatedMerchantUsage,
        merchantReserved: directMerchants + delegatedMerchants,
        merchantLimit: tenant.merchantSeatLimit,
        computePoints: tenant.quota?.computePointsAvailable ?? 0,
        writingRemaining: tenant.quota ? Math.max(tenant.quota.writingLimit - tenant.quota.writingUsed, 0) : 0,
        primaryDomain: domain?.hostname ?? null,
        domainStatus: domain ? domain.status.toLowerCase() as 'pending_verification' | 'active' | 'disabled' : null,
        brand: { nickname: tenant.brand?.nickname ?? '豆包获客', logoUrl: tenant.brand?.logoUrl ?? '', version: tenant.brand?.version ?? 0 },
      }
    })
  }

  async updateWhiteLabelBrand(actor: AdminActor, whiteLabelId: string, input: BrandInput): Promise<{ nickname: string; logoUrl: string; version: number }> {
    if (actor.role !== UserRole.PLATFORM_ADMIN) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '仅总后台可修改系统昵称和 Logo' })
    const nickname = typeof input.nickname === 'string' ? input.nickname.trim() : ''
    const logoUrl = typeof input.logoUrl === 'string' ? input.logoUrl.trim() : ''
    if (nickname.length < 2 || nickname.length > 32 || (logoUrl && !/^https:\/\/[\w.-]+(?:\/[^\s]*)?$/i.test(logoUrl))) {
      throw this.conflict('BRAND_INPUT_INVALID', '系统昵称需为 2-32 个字符，Logo 仅支持 HTTPS 图片地址或留空')
    }
    const tenant = await this.prisma.tenant.findFirst({ where: { id: whiteLabelId, kind: TenantKind.WHITE_LABEL, closedAt: null } })
    if (!tenant) throw new NotFoundException({ code: 'WHITE_LABEL_NOT_FOUND', message: '贴牌不存在或已关闭' })
    const brand = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.brandConfiguration.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id, nickname, logoUrl, version: 1 }, update: { nickname, logoUrl, version: { increment: 1 } } })
      await tx.auditLog.create({ data: { tenantId: tenant.id, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'white_label.brand.updated', entityType: 'BrandConfiguration', entityId: updated.id, detail: { nickname, hasLogo: Boolean(logoUrl), version: updated.version } } })
      return updated
    })
    return { nickname: brand.nickname, logoUrl: brand.logoUrl, version: brand.version }
  }

  async createWhiteLabel(actor: AdminActor, input: WhiteLabelInput, idempotencyKey: string | undefined): Promise<ProvisionResult> {
    if (actor.role !== UserRole.PLATFORM_ADMIN) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '仅总后台可开通贴牌' })
    const data = this.whiteLabelData(input); const key = this.key(idempotencyKey); const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id })
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.replay(tx, key); if (previous) return previous
      const tenant = await tx.tenant.create({ data: { kind: TenantKind.WHITE_LABEL, name: data.companyName, expiresAt: data.expiresAt, agentSeatLimit: data.agentLimit, merchantSeatLimit: data.merchantLimit } })
      await tx.user.create({ data: { usernameCanonical: data.username, loginRealm: LoginRealm.TENANT_ADMIN, passwordHash, role: UserRole.WHITE_LABEL_ADMIN, tenantId: tenant.id } })
      await tx.quotaBalance.create({ data: { tenantId: tenant.id, computePointsAvailable: data.computePoints, writingLimit: data.writingLimit } })
      await tx.brandConfiguration.create({ data: { tenantId: tenant.id, nickname: '豆包获客', logoUrl: '' } })
      if (data.domain) await tx.domainBinding.create({ data: this.domainBindingData(tenant.id, data.domain, DomainPurpose.CONTENT_ROOT) })
      await this.record(tx, key, null, tenant.id, actor, 'white_label.created', 'Tenant', tenant.id, { seatQuantity: data.merchantLimit, computePoints: data.computePoints, writingLimit: data.writingLimit, detail: { agentLimit: data.agentLimit, merchantLimit: data.merchantLimit, domainRequested: Boolean(data.domain) } })
      return this.result(tenant.id, data.username, data.expiresAt, data.domain)
    }, { isolationLevel: 'Serializable' })
  }

  async createAgent(actor: AdminActor, input: AgentInput, idempotencyKey: string | undefined): Promise<ProvisionResult> {
    if (actor.role !== UserRole.WHITE_LABEL_ADMIN || !actor.tenantId) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '仅贴牌可开通代理' })
    const parentTenantId = actor.tenantId
    const data = this.agentData(input); const key = this.key(idempotencyKey); const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id })
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.replay(tx, key); if (previous) return previous
      const parent = await this.parent(tx, parentTenantId, TenantKind.WHITE_LABEL); this.assertExpiry(data.expiresAt, parent.expiresAt)
      const agentCount = await tx.tenant.count({ where: { parentId: parent.id, kind: TenantKind.AGENT, closedAt: null } }); if (agentCount >= parent.agentSeatLimit) throw this.conflict('AGENT_LIMIT_REACHED', '可开代理数已达到上限')
      const [allocated, direct] = await Promise.all([tx.tenant.aggregate({ where: { parentId: parent.id, kind: TenantKind.AGENT, closedAt: null }, _sum: { merchantSeatLimit: true } }), tx.tenant.count({ where: { parentId: parent.id, kind: TenantKind.MERCHANT, closedAt: null } })])
      if ((allocated._sum.merchantSeatLimit ?? 0) + direct + data.merchantLimit > parent.merchantSeatLimit) throw this.conflict('MERCHANT_SEAT_LIMIT_REACHED', '普通商户席位不足')
      await this.transferQuota(tx, parent.id, data.computePoints, data.writingLimit)
      const tenant = await tx.tenant.create({ data: { kind: TenantKind.AGENT, name: data.companyName, parentId: parent.id, whiteLabelId: parent.id, expiresAt: data.expiresAt, merchantSeatLimit: data.merchantLimit } })
      await tx.user.create({ data: { usernameCanonical: data.username, loginRealm: LoginRealm.TENANT_ADMIN, passwordHash, role: UserRole.AGENT_ADMIN, tenantId: tenant.id } })
      await tx.quotaBalance.create({ data: { tenantId: tenant.id, computePointsAvailable: data.computePoints, writingLimit: data.writingLimit } })
      if (data.domain) await tx.domainBinding.create({ data: this.domainBindingData(tenant.id, data.domain, DomainPurpose.CONTENT_ROOT) })
      await this.record(tx, key, parent.id, tenant.id, actor, 'agent.created', 'Tenant', tenant.id, { seatQuantity: data.merchantLimit, computePoints: data.computePoints, writingLimit: data.writingLimit, detail: { merchantLimit: data.merchantLimit, domainRequested: Boolean(data.domain) } })
      return this.result(tenant.id, data.username, data.expiresAt, data.domain)
    }, { isolationLevel: 'Serializable' })
  }

  async createMerchant(actor: AdminActor, input: MerchantInput, idempotencyKey: string | undefined): Promise<ProvisionResult> {
    if ((actor.role !== UserRole.WHITE_LABEL_ADMIN && actor.role !== UserRole.AGENT_ADMIN) || !actor.tenantId) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '仅贴牌或代理可开通普通商户' })
    const parentTenantId = actor.tenantId
    const data = this.merchantData(input); const key = this.key(idempotencyKey); const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id })
    return this.prisma.$transaction(async (tx) => {
      const previous = await this.replay(tx, key); if (previous) return previous
      const parent = await this.parent(tx, parentTenantId, actor.role === UserRole.WHITE_LABEL_ADMIN ? TenantKind.WHITE_LABEL : TenantKind.AGENT); this.assertExpiry(data.expiresAt, parent.expiresAt)
      const ownMerchantCount = await tx.tenant.count({ where: { parentId: parent.id, kind: TenantKind.MERCHANT, closedAt: null } })
      if (parent.kind === TenantKind.AGENT) { if (ownMerchantCount >= parent.merchantSeatLimit) throw this.conflict('MERCHANT_SEAT_LIMIT_REACHED', '普通商户席位不足') } else {
        const allocated = await tx.tenant.aggregate({ where: { parentId: parent.id, kind: TenantKind.AGENT, closedAt: null }, _sum: { merchantSeatLimit: true } })
        if ((allocated._sum.merchantSeatLimit ?? 0) + ownMerchantCount >= parent.merchantSeatLimit) throw this.conflict('MERCHANT_SEAT_LIMIT_REACHED', '普通商户席位不足')
      }
      await this.transferQuota(tx, parent.id, data.computePoints, data.writingLimit)
      const whiteLabelId = parent.kind === TenantKind.WHITE_LABEL ? parent.id : parent.whiteLabelId; if (!whiteLabelId) throw this.conflict('WHITE_LABEL_CONTEXT_MISSING', '代理缺少所属贴牌，拒绝开户')
      const tenant = await tx.tenant.create({ data: { kind: TenantKind.MERCHANT, name: data.companyName, parentId: parent.id, whiteLabelId, expiresAt: data.expiresAt } })
      await tx.user.create({ data: { usernameCanonical: data.username, loginRealm: LoginRealm.MERCHANT, passwordHash, role: UserRole.MERCHANT, tenantId: tenant.id } })
      await tx.quotaBalance.create({ data: { tenantId: tenant.id, keywordLimit: data.keywordLimit, computePointsAvailable: data.computePoints, writingLimit: data.writingLimit } })
      await tx.merchantProfile.create({ data: { tenantId: tenant.id, companyName: data.companyName } })
      if (data.domain) await tx.domainBinding.create({ data: this.domainBindingData(tenant.id, data.domain, DomainPurpose.CONTENT_HOST) })
      await this.record(tx, key, parent.id, tenant.id, actor, 'merchant.created', 'Tenant', tenant.id, { seatQuantity: 1, computePoints: data.computePoints, writingLimit: data.writingLimit, detail: { keywordLimit: data.keywordLimit, domainRequested: Boolean(data.domain) } })
      return this.result(tenant.id, data.username, data.expiresAt, data.domain)
    }, { isolationLevel: 'Serializable' })
  }

  private async transferQuota(tx: Prisma.TransactionClient, tenantId: string, compute: number, writing: number): Promise<void> { const quota = await tx.quotaBalance.updateMany({ where: { tenantId, computePointsAvailable: { gte: compute }, writingLimit: { gte: writing } }, data: { computePointsAvailable: { decrement: compute }, writingLimit: { decrement: writing } } }); if (!quota.count) throw this.conflict('QUOTA_INSUFFICIENT', '算力点数或写作篇数余额不足') }
  private async parent(tx: Prisma.TransactionClient, id: string, kind: TenantKind) { const tenant = await tx.tenant.findFirst({ where: { id, kind, status: AccountStatus.ACTIVE, closedAt: null } }); if (!tenant) throw new NotFoundException({ code: 'PARENT_TENANT_NOT_FOUND', message: '上级租户不存在、已停用或无权访问' }); return tenant }
  private assertExpiry(child: Date, parent: Date): void { if (child > parent) throw this.conflict('EXPIRY_EXCEEDS_PARENT', '下级到期时间不得晚于上级') }
  private async replay(tx: Prisma.TransactionClient, key: string): Promise<ProvisionResult | null> { const entry = await tx.entitlementLedger.findUnique({ where: { idempotencyKey: key } }); if (!entry?.targetTenantId) return null; const tenant = await tx.tenant.findUnique({ where: { id: entry.targetTenantId }, include: { users: true, ownedDomainBindings: true } }); if (!tenant) return null; const user = tenant.users[0]; if (!user) return null; return this.result(tenant.id, user.usernameCanonical, tenant.expiresAt, tenant.ownedDomainBindings.length ? tenant.ownedDomainBindings[0]?.hostname ?? null : null) }
  private async record(tx: Prisma.TransactionClient, key: string, sourceTenantId: string | null, targetTenantId: string, actor: AdminActor, action: string, entityType: string, entityId: string, allocation: { seatQuantity: number; computePoints: number; writingLimit: number; detail: Prisma.InputJsonValue }): Promise<void> {
    const base = { sourceTenantId, targetTenantId, detail: allocation.detail }
    await tx.entitlementLedger.create({ data: { ...base, idempotencyKey: key, type: EntitlementEntryType.SEAT_RESERVE, quantity: allocation.seatQuantity } })
    if (allocation.computePoints > 0) await tx.entitlementLedger.create({ data: { ...base, idempotencyKey: `${key}:compute`, type: EntitlementEntryType.COMPUTE_ALLOCATE, quantity: allocation.computePoints } })
    if (allocation.writingLimit > 0) await tx.entitlementLedger.create({ data: { ...base, idempotencyKey: `${key}:writing`, type: EntitlementEntryType.WRITING_ALLOCATE, quantity: allocation.writingLimit } })
    await tx.auditLog.create({ data: { tenantId: targetTenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action, entityType, entityId, detail: allocation.detail } })
  }
  private whiteLabelData(input: WhiteLabelInput) { const base = this.accountData(input); const agentLimit = positiveInteger(input.agentLimit); const merchantLimit = positiveInteger(input.merchantLimit); const computePoints = positiveInteger(input.computePoints); const writingLimit = positiveInteger(input.writingLimit); if (agentLimit === null || merchantLimit === null || computePoints === null || writingLimit === null) throw this.conflict('PROVISION_INPUT_INVALID', '额度和席位必须为非负整数'); return { ...base, agentLimit, merchantLimit, computePoints, writingLimit } }
  private agentData(input: AgentInput) { const base = this.accountData(input); const merchantLimit = positiveInteger(input.merchantLimit); const computePoints = positiveInteger(input.computePoints); const writingLimit = positiveInteger(input.writingLimit); if (merchantLimit === null || computePoints === null || writingLimit === null) throw this.conflict('PROVISION_INPUT_INVALID', '额度和席位必须为非负整数'); return { ...base, merchantLimit, computePoints, writingLimit } }
  private merchantData(input: MerchantInput) { const base = this.accountData(input); const keywordLimit = positiveInteger(input.keywordLimit); const computePoints = positiveInteger(input.computePoints); const writingLimit = positiveInteger(input.writingLimit); if (keywordLimit === null || computePoints === null || writingLimit === null) throw this.conflict('PROVISION_INPUT_INVALID', '额度必须为非负整数'); return { ...base, keywordLimit, computePoints, writingLimit } }
  private accountData(input: { username: unknown; password: unknown; companyName: unknown; primaryDomain?: unknown; expiresAt: unknown }) { const username = typeof input.username === 'string' ? normalizeUsername(input.username) : ''; const password = typeof input.password === 'string' ? input.password : ''; const companyName = typeof input.companyName === 'string' ? input.companyName.trim() : ''; const expiresAt = validDate(input.expiresAt); const domain = validDomain(input.primaryDomain); if (!isValidAccountText(username) || !isValidAccountText(password) || companyName.length < 2 || companyName.length > 120 || !expiresAt || domain === undefined) throw this.conflict('PROVISION_INPUT_INVALID', '账号、密码、企业名、域名或到期时间不符合要求'); return { username, password, companyName, expiresAt, domain } }
  private domainBindingData(tenantId: string, hostname: string, purpose: DomainPurpose) { return { tenantId, hostname, purpose, status: DomainBindingStatus.PENDING_VERIFICATION, verificationToken: randomUUID().replaceAll('-', ''), verificationRequestedAt: new Date() } }
  private result(tenantId: string, username: string, expiresAt: Date, domain: string | null): ProvisionResult { return { tenantId, username, status: 'active', expiresAt: expiresAt.toISOString(), domainStatus: domain ? 'pending_verification' : null } }
  private key(value: string | undefined): string { return value && /^[a-zA-Z0-9_-]{8,100}$/.test(value) ? `provision:${value}` : `provision:auto:${randomUUID()}` }
  private conflict(code: string, message: string): ConflictException { return new ConflictException({ code, message }) }
}
