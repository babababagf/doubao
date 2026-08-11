import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { z } from 'zod'

import { AccountStatus, KeywordStatus, TenantKind, type MerchantProfile } from '../generated/prisma/client'
import type { MerchantActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'

const stringArray = z.array(z.string())
const keywordNameSchema = z.string().trim().min(2).max(80)
const brandTermsSchema = z.array(z.string().trim().min(1).max(120)).min(1).max(20)
const keywordCreateSchema = z.object({ name: keywordNameSchema, brandTerms: brandTermsSchema }).strict()
const keywordUpdateSchema = z.object({
  name: keywordNameSchema.optional(),
  brandTerms: brandTermsSchema.optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0)
const profileSchema = z.object({
  companyName: z.string().min(2).max(120),
  aliases: stringArray.max(8),
  industry: z.string().max(80),
  coreBusiness: z.string().max(300),
  serviceAreas: stringArray.max(20),
  introduction: z.string().max(6000),
  advantages: stringArray.max(30),
  products: stringArray.max(50),
  address: z.string().max(300),
  phone: z.string().max(50),
  wechat: z.string().max(80),
  businessHours: z.string().max(120),
  credentials: stringArray.max(30),
  cases: stringArray.max(50),
  proofMaterials: stringArray.max(50),
}).strict()

export type ProfileInput = z.infer<typeof profileSchema>

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : []
}

function normalizedKeyword(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}

function uniqueBrandTerms(values: string[]): string[] {
  const terms = new Map<string, string>()
  for (const value of values) {
    const term = value.trim()
    const normalized = normalizedKeyword(term)
    if (normalized && !terms.has(normalized)) terms.set(normalized, term)
  }
  return [...terms.values()]
}

function toAccountStatus(status: AccountStatus, expiresAt: Date): 'active' | 'expired' | 'disabled' {
  if (status === AccountStatus.DISABLED) {
    return 'disabled'
  }
  if (status === AccountStatus.EXPIRED || expiresAt <= new Date()) {
    return 'expired'
  }
  return 'active'
}

@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  async getBootstrap(actor: MerchantActor): Promise<object> {
    const tenant = await this.getMerchantTenant(actor.tenantId)
    const whiteLabelId = tenant.kind === TenantKind.WHITE_LABEL ? tenant.id : tenant.whiteLabelId
    if (!whiteLabelId) {
      throw new NotFoundException({ code: 'BRAND_CONTEXT_MISSING', message: '商户所属贴牌信息缺失' })
    }

    const brand = await this.prisma.brandConfiguration.findUnique({ where: { tenantId: whiteLabelId } })
    if (!brand) {
      throw new NotFoundException({ code: 'BRAND_CONTEXT_MISSING', message: '贴牌品牌信息缺失' })
    }

    return {
      brand: { nickname: brand.nickname, logoUrl: brand.logoUrl, version: brand.version },
      account: {
        companyName: tenant.profile?.companyName ?? tenant.name,
        username: actor.username,
        status: toAccountStatus(tenant.status, tenant.expiresAt),
        expiresAt: tenant.expiresAt.toISOString().slice(0, 10),
      },
    }
  }

  async getProfile(actor: MerchantActor): Promise<object> {
    const tenant = await this.getMerchantTenant(actor.tenantId)
    if (!tenant.profile) {
      throw new NotFoundException({ code: 'MERCHANT_PROFILE_MISSING', message: '网站信息尚未初始化' })
    }
    return this.formatProfile(tenant.profile)
  }

  async updateProfile(actor: MerchantActor, input: unknown): Promise<object> {
    const payload = profileSchema.safeParse(input)
    if (!payload.success) {
      throw new ConflictException({ code: 'PROFILE_INPUT_INVALID', message: '网站信息字段不符合要求' })
    }

    await this.getMerchantTenant(actor.tenantId)
    const profile = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.merchantProfile.findUnique({ where: { tenantId: actor.tenantId } })
      if (existing && !this.profileChanged(existing, payload.data)) {
        const snapshot = await tx.merchantProfileVersion.findUnique({ where: { profileId_version: { profileId: existing.id, version: existing.version } } })
        if (!snapshot) await tx.merchantProfileVersion.create({ data: this.profileVersionData(existing) })
        return existing
      }
      const next = existing
        ? await tx.merchantProfile.update({ where: { id: existing.id }, data: { ...payload.data, version: { increment: 1 } } })
        : await tx.merchantProfile.create({ data: { tenantId: actor.tenantId, ...payload.data } })
      await tx.merchantProfileVersion.create({ data: this.profileVersionData(next) })
      await tx.tenant.update({ where: { id: actor.tenantId }, data: { name: payload.data.companyName } })
      return next
    })
    return this.formatProfile(profile)
  }

  async listKeywords(actor: MerchantActor): Promise<object[]> {
    const keywords = await this.prisma.keyword.findMany({
      where: { tenantId: actor.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return Promise.all(keywords.map((keyword) => this.keywordDto(keyword)))
  }

  async createKeyword(actor: MerchantActor, input: unknown): Promise<object> {
    const parsed = keywordCreateSchema.safeParse(input)
    if (!parsed.success) throw new ConflictException({ code: 'KEYWORD_INPUT_INVALID', message: '请填写2至80字的主关键词，以及至少1个公司或品牌名' })
    const name = parsed.data.name
    const brandTerms = uniqueBrandTerms(parsed.data.brandTerms)
    const normalizedName = normalizedKeyword(name)
    const [quota, activeCount, existing] = await this.prisma.$transaction([
      this.prisma.quotaBalance.findUnique({ where: { tenantId: actor.tenantId } }),
      this.prisma.keyword.count({ where: { tenantId: actor.tenantId, deletedAt: null } }),
      this.prisma.keyword.findUnique({ where: { tenantId_normalizedName: { tenantId: actor.tenantId, normalizedName } } }),
    ])

    if (!quota) {
      throw new NotFoundException({ code: 'QUOTA_MISSING', message: '商户额度尚未初始化' })
    }
    if (existing && !existing.deletedAt) {
      throw new ConflictException({ code: 'KEYWORD_DUPLICATE', message: '关键词已存在' })
    }
    if (!existing && activeCount >= quota.keywordLimit) {
      throw new ConflictException({ code: 'KEYWORD_LIMIT_REACHED', message: '关键词数量已达到账号上限' })
    }

    const keyword = existing
      ? await this.prisma.keyword.update({
          where: { id: existing.id },
          data: { name, normalizedName, brandTerms, status: KeywordStatus.ENABLED, deletedAt: null },
        })
      : await this.prisma.keyword.create({ data: { tenantId: actor.tenantId, name, normalizedName, brandTerms } })

    return this.keywordDto(keyword)
  }

  async updateKeyword(actor: MerchantActor, keywordId: string, input: unknown): Promise<object> {
    const parsed = keywordUpdateSchema.safeParse(input)
    if (!parsed.success) throw new ConflictException({ code: 'KEYWORD_INPUT_INVALID', message: '关键词修改内容无效' })
    const data: { name?: string; normalizedName?: string; brandTerms?: string[]; status?: KeywordStatus } = {}
    if (parsed.data.name !== undefined) {
      data.name = parsed.data.name
      data.normalizedName = normalizedKeyword(parsed.data.name)
      const duplicate = await this.prisma.keyword.findUnique({ where: { tenantId_normalizedName: { tenantId: actor.tenantId, normalizedName: data.normalizedName } }, select: { id: true, deletedAt: true } })
      if (duplicate && duplicate.id !== keywordId) throw new ConflictException({ code: 'KEYWORD_DUPLICATE', message: duplicate.deletedAt ? '同名关键词曾被删除，请重新启用原关键词或换一个主词' : '关键词已存在' })
    }
    if (parsed.data.brandTerms !== undefined) data.brandTerms = uniqueBrandTerms(parsed.data.brandTerms)
    if (parsed.data.status !== undefined) data.status = parsed.data.status === 'enabled' ? KeywordStatus.ENABLED : KeywordStatus.DISABLED
    const keyword = await this.prisma.keyword.updateMany({
      where: { id: keywordId, tenantId: actor.tenantId, deletedAt: null },
      data,
    })
    if (keyword.count === 0) {
      throw new NotFoundException({ code: 'KEYWORD_NOT_FOUND', message: '关键词不存在或无权访问' })
    }
    return this.getKeyword(actor, keywordId)
  }

  async deleteKeyword(actor: MerchantActor, keywordId: string): Promise<void> {
    const result = await this.prisma.keyword.updateMany({
      where: { id: keywordId, tenantId: actor.tenantId, deletedAt: null },
      data: { deletedAt: new Date(), status: KeywordStatus.DISABLED },
    })
    if (result.count === 0) {
      throw new NotFoundException({ code: 'KEYWORD_NOT_FOUND', message: '关键词不存在或无权访问' })
    }
  }

  private async getKeyword(actor: MerchantActor, keywordId: string): Promise<object> {
    const keyword = await this.prisma.keyword.findFirst({
      where: { id: keywordId, tenantId: actor.tenantId, deletedAt: null },
    })
    if (!keyword) {
      throw new NotFoundException({ code: 'KEYWORD_NOT_FOUND', message: '关键词不存在或无权访问' })
    }
    return this.keywordDto(keyword)
  }

  private async keywordDto(keyword: { id: string; name: string; brandTerms: unknown; status: KeywordStatus; createdAt: Date }): Promise<object> {
    const [questionTotal, uncreatedCount, checkedCount] = await Promise.all([
      this.prisma.question.count({ where: { keywordId: keyword.id, deletedAt: null } }),
      this.prisma.question.count({ where: { keywordId: keyword.id, deletedAt: null, status: KeywordStatus.ENABLED, articleCreated: false } }),
      this.prisma.question.count({ where: { keywordId: keyword.id, deletedAt: null, checkedAt: { not: null } } }),
    ])
    return { id: keyword.id, name: keyword.name, brandTerms: asStringArray(keyword.brandTerms), status: keyword.status === KeywordStatus.ENABLED ? 'enabled' : 'disabled', questionTotal, uncreatedCount, checkedCount, createdAt: keyword.createdAt.toISOString() }
  }

  private async getMerchantTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, kind: TenantKind.MERCHANT },
      include: { profile: true },
    })
    if (!tenant) {
      throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: '商户不存在或无权访问' })
    }
    return tenant
  }

  private formatProfile(profile: MerchantProfile): object {
    return {
      companyName: profile.companyName,
      aliases: asStringArray(profile.aliases),
      industry: profile.industry,
      coreBusiness: profile.coreBusiness,
      serviceAreas: asStringArray(profile.serviceAreas),
      introduction: profile.introduction,
      advantages: asStringArray(profile.advantages),
      products: asStringArray(profile.products),
      address: profile.address,
      phone: profile.phone,
      wechat: profile.wechat,
      businessHours: profile.businessHours,
      credentials: asStringArray(profile.credentials),
      cases: asStringArray(profile.cases),
      proofMaterials: asStringArray(profile.proofMaterials),
      version: profile.version,
      updatedAt: profile.updatedAt.toISOString(),
    }
  }

  private profileChanged(profile: MerchantProfile, next: ProfileInput): boolean {
    return profile.companyName !== next.companyName || profile.industry !== next.industry || profile.coreBusiness !== next.coreBusiness || profile.introduction !== next.introduction || profile.address !== next.address || profile.phone !== next.phone || profile.wechat !== next.wechat || profile.businessHours !== next.businessHours || !this.sameArray(profile.aliases, next.aliases) || !this.sameArray(profile.serviceAreas, next.serviceAreas) || !this.sameArray(profile.advantages, next.advantages) || !this.sameArray(profile.products, next.products) || !this.sameArray(profile.credentials, next.credentials) || !this.sameArray(profile.cases, next.cases) || !this.sameArray(profile.proofMaterials, next.proofMaterials)
  }

  private sameArray(current: unknown, next: string[]): boolean {
    const values = asStringArray(current)
    return values.length === next.length && values.every((value, index) => value === next[index])
  }

  private profileVersionData(profile: MerchantProfile) {
    return {
      profileId: profile.id, tenantId: profile.tenantId, version: profile.version, companyName: profile.companyName, aliases: asStringArray(profile.aliases), industry: profile.industry, coreBusiness: profile.coreBusiness, serviceAreas: asStringArray(profile.serviceAreas), introduction: profile.introduction, advantages: asStringArray(profile.advantages), products: asStringArray(profile.products), address: profile.address, phone: profile.phone, wechat: profile.wechat, businessHours: profile.businessHours, credentials: asStringArray(profile.credentials), cases: asStringArray(profile.cases), proofMaterials: asStringArray(profile.proofMaterials),
    }
  }
}
