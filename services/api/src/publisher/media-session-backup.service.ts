import { Injectable, NotFoundException } from '@nestjs/common'

import type { PublisherActor } from '../auth/auth.types'
import { MediaPlatform } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { MediaSessionEnvelopeService } from '../security/media-session-envelope.service'
import { validateMediaSessionBundle } from './media-session-bundle'

const platformFromDb: Record<MediaPlatform, 'toutiao' | 'douyin'> = { [MediaPlatform.TOUTIAO]: 'toutiao', [MediaPlatform.DOUYIN]: 'douyin' }

@Injectable()
export class MediaSessionBackupService {
  constructor(private readonly prisma: PrismaService, private readonly envelope: MediaSessionEnvelopeService) {}

  async save(actor: PublisherActor, mediaAccountId: string, input: unknown): Promise<object> {
    const account = await this.account(actor, mediaAccountId)
    const platform = platformFromDb[account.platform]
    const { bundle, serialized } = validateMediaSessionBundle(input, { platform, localReferenceId: account.localReferenceId })
    const context = { tenantId: actor.tenantId, mediaAccountId: account.id, platform, localReferenceId: account.localReferenceId, schemaVersion: bundle.schemaVersion }
    const encrypted = this.envelope.encrypt(serialized, context)
    const backup = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.mediaSessionBackup.upsert({
        where: { mediaAccountId: account.id },
        create: { tenantId: actor.tenantId, mediaAccountId: account.id, sourceDeviceId: actor.publisherDeviceId, schemaVersion: bundle.schemaVersion, capturedAt: new Date(bundle.capturedAt), revokedAt: null, lastRestoredAt: null, ...encrypted },
        update: { sourceDeviceId: actor.publisherDeviceId, schemaVersion: bundle.schemaVersion, capturedAt: new Date(bundle.capturedAt), revokedAt: null, lastRestoredAt: null, ...encrypted },
      })
      await transaction.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'media_session.backup_saved', entityType: 'MediaAccount', entityId: account.id, detail: { schemaVersion: bundle.schemaVersion, payloadBytes: encrypted.payloadBytes, sourceDeviceId: actor.publisherDeviceId, cookieCount: bundle.cookies.length, originCount: bundle.origins.length } } })
      return saved
    })
    return { available: true, schemaVersion: backup.schemaVersion, capturedAt: backup.capturedAt.toISOString(), payloadBytes: backup.payloadBytes }
  }

  async restore(actor: PublisherActor, mediaAccountId: string): Promise<object> {
    const account = await this.account(actor, mediaAccountId)
    const backup = await this.prisma.mediaSessionBackup.findFirst({ where: { tenantId: actor.tenantId, mediaAccountId: account.id, revokedAt: null } })
    if (!backup) throw new NotFoundException({ code: 'MEDIA_SESSION_BACKUP_NOT_FOUND', message: '该媒体账号没有可恢复的云端会话备份' })
    const platform = platformFromDb[account.platform]
    const context = { tenantId: actor.tenantId, mediaAccountId: account.id, platform, localReferenceId: account.localReferenceId, schemaVersion: backup.schemaVersion }
    const plaintext = this.envelope.decrypt(backup, context)
    let parsed: unknown
    try { parsed = JSON.parse(plaintext.toString('utf8')) } catch { parsed = null }
    const { bundle } = validateMediaSessionBundle(parsed, { platform, localReferenceId: account.localReferenceId })
    const restoredAt = new Date()
    await this.prisma.$transaction([
      this.prisma.mediaSessionBackup.update({ where: { id: backup.id }, data: { lastRestoredAt: restoredAt } }),
      this.prisma.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'media_session.backup_restored', entityType: 'MediaAccount', entityId: account.id, detail: { schemaVersion: backup.schemaVersion, payloadBytes: backup.payloadBytes, sourceDeviceId: backup.sourceDeviceId, targetDeviceId: actor.publisherDeviceId, crossDevice: backup.sourceDeviceId !== actor.publisherDeviceId } } }),
    ])
    return { bundle, capturedAt: backup.capturedAt.toISOString(), crossDevice: backup.sourceDeviceId !== actor.publisherDeviceId }
  }

  async revoke(actor: PublisherActor, mediaAccountId: string): Promise<object> {
    const account = await this.account(actor, mediaAccountId)
    const revokedAt = new Date()
    const result = await this.prisma.mediaSessionBackup.updateMany({ where: { tenantId: actor.tenantId, mediaAccountId: account.id, revokedAt: null }, data: { revokedAt } })
    if (result.count) await this.prisma.auditLog.create({ data: { tenantId: actor.tenantId, actorUserId: actor.userId, actorTenantId: actor.tenantId, action: 'media_session.backup_revoked', entityType: 'MediaAccount', entityId: account.id, detail: { sourceDeviceId: actor.publisherDeviceId } } })
    return { available: false, revoked: result.count > 0 }
  }

  private async account(actor: PublisherActor, mediaAccountId: string): Promise<{ id: string; platform: MediaPlatform; localReferenceId: string }> {
    const account = await this.prisma.mediaAccount.findFirst({ where: { id: mediaAccountId, tenantId: actor.tenantId, localReferenceId: { not: null } }, select: { id: true, platform: true, localReferenceId: true } })
    if (!account?.localReferenceId) throw new NotFoundException({ code: 'MEDIA_ACCOUNT_NOT_FOUND', message: '媒体账号不存在、未绑定或无权访问' })
    return { id: account.id, platform: account.platform, localReferenceId: account.localReferenceId }
  }
}
