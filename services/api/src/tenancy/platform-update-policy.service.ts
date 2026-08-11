import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'

import { UserRole } from '../generated/prisma/client'
import type { AdminActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'

const policyId = 'publisher-desktop'

export type PublisherUpdatePolicy = {
  enabled: boolean
  feedUrl: string | null
  minimumVersion: string | null
  releaseNotes: string
  updatedAt: string | null
}

@Injectable()
export class PlatformUpdatePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getForSuper(actor: AdminActor): Promise<PublisherUpdatePolicy> {
    this.requirePlatform(actor)
    return this.view(await this.prisma.platformUpdatePolicy.findUnique({ where: { id: policyId } }))
  }

  async save(actor: AdminActor, input: unknown): Promise<PublisherUpdatePolicy> {
    this.requirePlatform(actor)
    const data = normalizeInput(input)
    const saved = await this.prisma.$transaction(async (tx) => {
      const policy = await tx.platformUpdatePolicy.upsert({ where: { id: policyId }, update: data, create: { id: policyId, ...data } })
      await tx.auditLog.create({ data: { actorUserId: actor.userId, action: 'platform_update_policy.updated', entityType: 'PlatformUpdatePolicy', entityId: policyId, detail: { enabled: policy.enabled, hasFeedUrl: Boolean(policy.feedUrl), minimumVersion: policy.minimumVersion, releaseNotesLength: policy.releaseNotes.length } } })
      return policy
    })
    return this.view(saved)
  }

  async getForPublisher(): Promise<PublisherUpdatePolicy> {
    const policy = await this.prisma.platformUpdatePolicy.findUnique({ where: { id: policyId } })
    return this.view(policy)
  }

  private view(policy: { enabled: boolean; feedUrl: string | null; minimumVersion: string | null; releaseNotes: string; updatedAt: Date } | null): PublisherUpdatePolicy {
    if (!policy || !policy.enabled || !policy.feedUrl) return { enabled: false, feedUrl: null, minimumVersion: null, releaseNotes: '', updatedAt: policy?.updatedAt.toISOString() ?? null }
    return { enabled: true, feedUrl: policy.feedUrl, minimumVersion: policy.minimumVersion, releaseNotes: policy.releaseNotes, updatedAt: policy.updatedAt.toISOString() }
  }

  private requirePlatform(actor: AdminActor): void {
    if (actor.role !== UserRole.PLATFORM_ADMIN) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '仅总后台可配置发布助手更新策略' })
  }
}

function normalizeInput(input: unknown): { enabled: boolean; feedUrl: string | null; minimumVersion: string | null; releaseNotes: string } {
  if (!input || typeof input !== 'object') throw invalidPolicy()
  const value = input as { enabled?: unknown; feedUrl?: unknown; minimumVersion?: unknown; releaseNotes?: unknown }
  if (typeof value.enabled !== 'boolean') throw invalidPolicy()
  const feedUrl = typeof value.feedUrl === 'string' ? value.feedUrl.trim() : ''
  const minimumVersion = typeof value.minimumVersion === 'string' ? value.minimumVersion.trim() : ''
  const releaseNotes = typeof value.releaseNotes === 'string' ? value.releaseNotes.trim() : ''
  if (releaseNotes.length > 2_000 || minimumVersion.length > 40 || (minimumVersion && !/^\d+\.\d+\.\d+$/.test(minimumVersion))) throw invalidPolicy()
  if (!value.enabled) return { enabled: false, feedUrl: null, minimumVersion: minimumVersion || null, releaseNotes }
  if (!isTrustedUpdateFeed(feedUrl)) throw invalidPolicy()
  return { enabled: true, feedUrl: new URL(feedUrl).toString().replace(/\/$/, ''), minimumVersion: minimumVersion || null, releaseNotes }
}

function isTrustedUpdateFeed(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.local') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false
    return true
  } catch {
    return false
  }
}

function invalidPolicy(): ConflictException {
  return new ConflictException({ code: 'UPDATE_POLICY_INVALID', message: '更新策略无效：启用时必须填写公开 HTTPS 更新地址，且不能使用本机、私网 IP 或含凭据地址；最低版本需为 x.y.z' })
}
