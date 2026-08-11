import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'

import { StorageTestStatus, UserRole } from '../generated/prisma/client'
import type { AdminActor } from '../auth/auth.types'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../security/credential-crypto.service'
import { OutboundUrlPolicyService, parsePublicHttpsBaseUrl } from '../security/outbound-url-policy.service'

type StorageInput = { region: unknown; bucket: unknown; cdnBaseUrl?: unknown; accessKeyId: unknown; accessKeySecret: unknown }
type OssClient = {
  getBucketInfo: () => Promise<unknown>
  put: (name: string, content: Buffer, options: { headers: { 'Content-Type': string } }) => Promise<unknown>
  signatureUrl: (name: string, options: { method: 'PUT'; expires: number; 'Content-Type': string }) => string
  head: (name: string) => Promise<{ res?: { headers?: Record<string, unknown> } }>
  get: (name: string) => Promise<{ content?: Buffer | string }>
  delete: (name: string) => Promise<unknown>
}
type OssConstructor = new (options: { region: string; bucket: string; accessKeyId: string; accessKeySecret: string; authorizationV4: boolean; secure: boolean; timeout: number }) => OssClient
// ali-oss 未导出 TypeScript 声明；在边界处收窄为本服务实际使用的最小接口。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Oss = require('ali-oss') as OssConstructor

const probePrefix = '__doubaohk_storage_probe__'
const probeContentType = 'text/plain; charset=utf-8'
type PublicProbeFetcher = (url: string, init: { redirect: 'error'; signal: AbortSignal }) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>
export type StaticSiteObject = { path: string; content: Buffer; contentType: string }
export type StaticSiteUploadResult = { objectPrefix: string; manifestKey: string }

const safeSitePath = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[a-zA-Z0-9._/-]+$/

/**
 * 将一个完整站点写入从未复用的版本目录，最后再写完整性清单。
 * 任何步骤失败都只清理本次版本已写入的对象，不会触碰既有版本。
 */
export async function uploadOssSiteVersion(
  client: OssClient,
  input: { merchantTenantId: string; version: number; files: StaticSiteObject[] },
): Promise<StaticSiteUploadResult> {
  if (!/^[a-zA-Z0-9_-]+$/.test(input.merchantTenantId) || !Number.isSafeInteger(input.version) || input.version < 1 || !input.files.length)
    throw new Error('SITE_UPLOAD_INPUT_INVALID')
  const files = [...input.files].sort((left, right) => left.path.localeCompare(right.path))
  if (files.some((file, index) => !safeSitePath.test(file.path) || !file.contentType.trim() || files.findIndex((candidate) => candidate.path === file.path) !== index))
    throw new Error('SITE_UPLOAD_FILE_INVALID')

  const objectPrefix = `sites/${input.merchantTenantId}/versions/v${input.version}`
  const uploaded: string[] = []
  try {
    const manifestFiles: Array<{ path: string; size: number; sha256: string; contentType: string }> = []
    for (const file of files) {
      const objectKey = `${objectPrefix}/${file.path}`
      await client.put(objectKey, file.content, { headers: { 'Content-Type': file.contentType } })
      uploaded.push(objectKey)
      const metadata = await client.head(objectKey)
      const contentLength = Number(metadata.res?.headers?.['content-length'])
      if (!Number.isSafeInteger(contentLength) || contentLength !== file.content.length) throw new Error('SITE_UPLOAD_SIZE_MISMATCH')
      manifestFiles.push({
        path: file.path,
        size: file.content.length,
        sha256: createHash('sha256').update(file.content).digest('hex'),
        contentType: file.contentType,
      })
    }
    const manifestKey = `${objectPrefix}/manifest.json`
    const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, merchantTenantId: input.merchantTenantId, version: input.version, files: manifestFiles }), 'utf8')
    await client.put(manifestKey, manifest, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
    uploaded.push(manifestKey)
    const metadata = await client.head(manifestKey)
    if (Number(metadata.res?.headers?.['content-length']) !== manifest.length) throw new Error('SITE_UPLOAD_MANIFEST_MISMATCH')
    return { objectPrefix, manifestKey }
  } catch (reason) {
    await Promise.allSettled(uploaded.reverse().map((objectKey) => client.delete(objectKey)))
    throw reason
  }
}

/**
 * 只操作随机的隔离探针对象，用于证明凭证、Bucket、写入、读取和清理链路都可用。
 * 无论探针过程是否失败，都会尝试删除该随机对象；不会触碰商户业务文件。
 */
export async function verifyOssProbe(client: OssClient, options: { publicUrlForKey?: (objectKey: string) => string; fetcher?: PublicProbeFetcher } = {}): Promise<void> {
  const objectKey = `${probePrefix}/${randomUUID()}.txt`
  const payload = Buffer.from(`doubaohk-oss-probe:${randomUUID()}`, 'utf8')
  let verificationError: unknown = null
  try {
    await client.put(objectKey, payload, { headers: { 'Content-Type': probeContentType } })
    const metadata = await client.head(objectKey)
    const contentLength = Number(metadata.res?.headers?.['content-length'])
    if (!Number.isInteger(contentLength) || contentLength !== payload.length) throw new Error('STORAGE_PROBE_SIZE_MISMATCH')
    const downloaded = await client.get(objectKey)
    const content = Buffer.isBuffer(downloaded.content) ? downloaded.content : typeof downloaded.content === 'string' ? Buffer.from(downloaded.content) : null
    if (!content || !content.equals(payload)) throw new Error('STORAGE_PROBE_READ_MISMATCH')
    if (options.publicUrlForKey) {
      const fetcher = options.fetcher ?? fetch
      const response = await fetcher(options.publicUrlForKey(objectKey), { redirect: 'error', signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error('STORAGE_PROBE_PUBLIC_READ_FAILED')
      const publicContent = Buffer.from(await response.arrayBuffer())
      if (!publicContent.equals(payload)) throw new Error('STORAGE_PROBE_PUBLIC_READ_MISMATCH')
    }
  } catch (reason) {
    verificationError = reason
  }

  try {
    await client.delete(objectKey)
  } catch (cleanupError) {
    if (!verificationError) verificationError = cleanupError
  }
  if (verificationError) throw verificationError
}

@Injectable()
export class ObjectStorageConfigService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly outbound: OutboundUrlPolicyService) {}

  async get(actor: AdminActor) {
    const tenantId = this.whiteLabel(actor)
    const row = await this.prisma.objectStorageConfig.findUnique({ where: { tenantId } })
    return row ? this.view(row) : null
  }

  async save(actor: AdminActor, input: StorageInput) {
    const tenantId = this.whiteLabel(actor)
    const data = this.input(input)
    const id = this.crypto.encrypt(data.accessKeyId)
    const secret = this.crypto.encrypt(data.accessKeySecret)
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.objectStorageConfig.upsert({
        where: { tenantId },
        create: { tenantId, region: data.region, bucket: data.bucket, cdnBaseUrl: data.cdnBaseUrl, accessKeyIdCiphertext: id.ciphertext, accessKeyIdNonce: id.nonce, accessKeySecretCiphertext: secret.ciphertext, accessKeySecretNonce: secret.nonce, accessKeyIdMask: this.mask(data.accessKeyId) },
        update: { region: data.region, bucket: data.bucket, cdnBaseUrl: data.cdnBaseUrl, accessKeyIdCiphertext: id.ciphertext, accessKeyIdNonce: id.nonce, accessKeySecretCiphertext: secret.ciphertext, accessKeySecretNonce: secret.nonce, accessKeyIdMask: this.mask(data.accessKeyId), enabled: false, lastTestAt: null, lastTestStatus: StorageTestStatus.NEVER, lastTestError: null },
      })
      await tx.auditLog.create({ data: { tenantId, actorUserId: actor.userId, actorTenantId: tenantId, action: 'object_storage_config.saved', entityType: 'ObjectStorageConfig', entityId: saved.id, detail: { provider: 'alibaba_oss', region: data.region, bucket: data.bucket, cdnConfigured: Boolean(data.cdnBaseUrl) } } })
      return saved
    })
    return this.view(row)
  }

  async test(actor: AdminActor) {
    const tenantId = this.whiteLabel(actor)
    const config = await this.prisma.objectStorageConfig.findUnique({ where: { tenantId } })
    if (!config) throw new NotFoundException({ code: 'STORAGE_CONFIG_NOT_FOUND', message: '请先保存阿里云 OSS 配置' })
    const started = Date.now()
    let status: StorageTestStatus = StorageTestStatus.SUCCEEDED
    let error: string | null = null
    try {
      const client = new Oss({ region: config.region, bucket: config.bucket, accessKeyId: this.crypto.decrypt(config.accessKeyIdCiphertext, config.accessKeyIdNonce), accessKeySecret: this.crypto.decrypt(config.accessKeySecretCiphertext, config.accessKeySecretNonce), authorizationV4: true, secure: true, timeout: 10_000 })
      await client.getBucketInfo()
      const cdnBaseUrl = config.cdnBaseUrl ? await this.outbound.publicHttpsBaseUrl(config.cdnBaseUrl) : null
      await verifyOssProbe(client, { publicUrlForKey: (objectKey) => this.publicUrl({ region: config.region, bucket: config.bucket, cdnBaseUrl }, objectKey) })
    } catch (reason) {
      status = StorageTestStatus.FAILED
      error = this.safeError(reason)
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.objectStorageConfig.update({ where: { id: config.id }, data: { lastTestAt: new Date(), lastTestStatus: status, lastTestError: error, enabled: status === StorageTestStatus.SUCCEEDED ? config.enabled : false } })
      await tx.auditLog.create({ data: { tenantId, actorUserId: actor.userId, actorTenantId: tenantId, action: 'object_storage_config.tested', entityType: 'ObjectStorageConfig', entityId: config.id, detail: { status: status.toLowerCase(), durationMs: Date.now() - started, error } } })
      return updated
    })
    return this.view(row)
  }

  async setEnabled(actor: AdminActor, input: { enabled?: unknown }) {
    const tenantId = this.whiteLabel(actor)
    const enabled = input.enabled
    if (typeof enabled !== 'boolean') throw new ConflictException({ code: 'STORAGE_STATUS_INVALID', message: 'enabled 必须为布尔值' })
    const config = await this.prisma.objectStorageConfig.findUnique({ where: { tenantId } })
    if (!config) throw new NotFoundException({ code: 'STORAGE_CONFIG_NOT_FOUND', message: '请先保存阿里云 OSS 配置' })
    if (enabled && config.lastTestStatus !== StorageTestStatus.SUCCEEDED) throw new ConflictException({ code: 'STORAGE_TEST_REQUIRED', message: 'OSS 配置测试成功后才能启用' })
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.objectStorageConfig.update({ where: { id: config.id }, data: { enabled } })
      await tx.auditLog.create({ data: { tenantId, actorUserId: actor.userId, actorTenantId: tenantId, action: 'object_storage_config.enabled_changed', entityType: 'ObjectStorageConfig', entityId: config.id, detail: { enabled } } })
      return updated
    })
    return this.view(row)
  }

  async remove(actor: AdminActor): Promise<void> {
    const tenantId = this.whiteLabel(actor)
    const config = await this.prisma.objectStorageConfig.findUnique({ where: { tenantId } })
    if (!config) throw new NotFoundException({ code: 'STORAGE_CONFIG_NOT_FOUND', message: 'OSS 配置不存在' })
    await this.prisma.$transaction(async (tx) => {
      await tx.objectStorageConfig.delete({ where: { id: config.id } })
      await tx.auditLog.create({ data: { tenantId, actorUserId: actor.userId, actorTenantId: tenantId, action: 'object_storage_config.deleted', entityType: 'ObjectStorageConfig', entityId: config.id, detail: { region: config.region, bucket: config.bucket } } })
    })
  }

  async issueMerchantUpload(merchantTenantId: string, objectKey: string, mimeType: string): Promise<{ uploadUrl: string; expiresAt: string }> {
    const config = await this.enabledMerchantConfig(merchantTenantId)
    const client = this.client(config)
    return { uploadUrl: client.signatureUrl(objectKey, { method: 'PUT', expires: 300, 'Content-Type': mimeType }), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }
  }

  async verifyMerchantUpload(merchantTenantId: string, objectKey: string, mimeType: string, sizeBytes: number): Promise<{ publicUrl: string }> {
    const config = await this.enabledMerchantConfig(merchantTenantId)
    let result: { res?: { headers?: Record<string, unknown> } }
    try { result = await this.client(config).head(objectKey) } catch { throw new ConflictException({ code: 'STORAGE_OBJECT_UNAVAILABLE', message: '未找到已上传图片或对象存储暂不可用，请重新上传' }) }
    const headers = result.res?.headers ?? {}
    const contentLength = Number(headers['content-length'])
    const contentType = typeof headers['content-type'] === 'string' ? headers['content-type'].split(';')[0]?.trim().toLowerCase() : ''
    if (!Number.isInteger(contentLength) || contentLength !== sizeBytes || contentType !== mimeType) throw new ConflictException({ code: 'STORAGE_OBJECT_MISMATCH', message: '已上传图片的类型或大小校验失败，请重新选择图片上传' })
    return { publicUrl: this.publicUrl(config, objectKey) }
  }

  async deleteMerchantObject(merchantTenantId: string, objectKey: string): Promise<void> {
    const config = await this.enabledMerchantConfig(merchantTenantId)
    try { await this.client(config).delete(objectKey) } catch { throw new ConflictException({ code: 'STORAGE_OBJECT_DELETE_FAILED', message: '对象存储删除失败，图片元数据未删除，请稍后重试' }) }
  }

  async merchantStorageAvailable(merchantTenantId: string): Promise<boolean> {
    const merchant = await this.prisma.tenant.findUnique({ where: { id: merchantTenantId }, select: { whiteLabelId: true } })
    if (!merchant?.whiteLabelId) return false
    const config = await this.prisma.objectStorageConfig.findUnique({ where: { tenantId: merchant.whiteLabelId }, select: { enabled: true, lastTestStatus: true } })
    return Boolean(config?.enabled && config.lastTestStatus === StorageTestStatus.SUCCEEDED)
  }

  async uploadMerchantSiteVersion(merchantTenantId: string, version: number, files: StaticSiteObject[]): Promise<{ objectPrefix: string; manifestUrl: string }> {
    const config = await this.enabledMerchantConfig(merchantTenantId)
    try {
      const result = await uploadOssSiteVersion(this.client(config), { merchantTenantId, version, files })
      return { objectPrefix: result.objectPrefix, manifestUrl: this.publicUrl(config, result.manifestKey) }
    } catch {
      throw new ConflictException({ code: 'SITE_STORAGE_UPLOAD_FAILED', message: '网站文件写入对象存储失败，上一版网站未受影响，请检查存储配置后重试' })
    }
  }

  private whiteLabel(actor: AdminActor): string {
    if (actor.role !== UserRole.WHITE_LABEL_ADMIN || !actor.tenantId) throw new UnauthorizedException({ code: 'FORBIDDEN', message: '只有贴牌可配置对象存储，代理和商户仅继承' })
    return actor.tenantId
  }

  private async enabledMerchantConfig(merchantTenantId: string) {
    const merchant = await this.prisma.tenant.findUnique({ where: { id: merchantTenantId }, select: { whiteLabelId: true } })
    if (!merchant?.whiteLabelId) throw new ConflictException({ code: 'STORAGE_CONFIG_MISSING', message: '商户所属贴牌对象存储尚未配置' })
    const config = await this.prisma.objectStorageConfig.findUnique({ where: { tenantId: merchant.whiteLabelId } })
    if (!config || !config.enabled || config.lastTestStatus !== StorageTestStatus.SUCCEEDED) throw new ConflictException({ code: 'STORAGE_CONFIG_UNAVAILABLE', message: '贴牌对象存储尚未启用或测试未通过，不能上传图片' })
    return config
  }

  private client(config: { region: string; bucket: string; accessKeyIdCiphertext: string; accessKeyIdNonce: string; accessKeySecretCiphertext: string; accessKeySecretNonce: string }): OssClient {
    return new Oss({ region: config.region, bucket: config.bucket, accessKeyId: this.crypto.decrypt(config.accessKeyIdCiphertext, config.accessKeyIdNonce), accessKeySecret: this.crypto.decrypt(config.accessKeySecretCiphertext, config.accessKeySecretNonce), authorizationV4: true, secure: true, timeout: 10_000 })
  }

  private publicUrl(config: { region: string; bucket: string; cdnBaseUrl: string | null }, objectKey: string): string {
    const prefix = config.cdnBaseUrl ?? `https://${config.bucket}.${config.region}.aliyuncs.com`
    return `${prefix}/${objectKey.split('/').map(encodeURIComponent).join('/')}`
  }

  private input(input: StorageInput) {
    const region = typeof input.region === 'string' ? input.region.trim().toLowerCase() : ''
    const bucket = typeof input.bucket === 'string' ? input.bucket.trim().toLowerCase() : ''
    const accessKeyId = typeof input.accessKeyId === 'string' ? input.accessKeyId.trim() : ''
    const accessKeySecret = typeof input.accessKeySecret === 'string' ? input.accessKeySecret.trim() : ''
    const requestedCdnBaseUrl = typeof input.cdnBaseUrl === 'string' && input.cdnBaseUrl.trim() ? input.cdnBaseUrl.trim().replace(/\/$/, '') : null
    if (!/^oss-(?:cn|ap|eu|us|me|af)-[a-z0-9-]+$/.test(region) || !/^(?=.{3,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(bucket) || /^\d+\.\d+\.\d+\.\d+$/.test(bucket) || accessKeyId.length < 8 || accessKeyId.length > 256 || accessKeySecret.length < 8 || accessKeySecret.length > 2048 || (requestedCdnBaseUrl && (!parsePublicHttpsBaseUrl(requestedCdnBaseUrl) || new URL(requestedCdnBaseUrl).pathname !== '/'))) throw new ConflictException({ code: 'STORAGE_INPUT_INVALID', message: 'OSS Region、Bucket、CDN 地址或访问凭证不符合要求' })
    return { region, bucket, cdnBaseUrl: requestedCdnBaseUrl, accessKeyId, accessKeySecret }
  }

  private mask(value: string): string { return value.length <= 8 ? '********' : `${value.slice(0, 4)}…${value.slice(-4)}` }
  private safeError(reason: unknown): string {
    const value = reason instanceof Error ? reason.message : 'STORAGE_TEST_FAILED'
    return value.replace(/(accesskey|secret|authorization|signature)[^\s,:]*/gi, 'REDACTED').slice(0, 160)
  }
  private view(row: { id: string; provider: string; region: string; bucket: string; cdnBaseUrl: string | null; accessKeyIdMask: string; enabled: boolean; lastTestAt: Date | null; lastTestStatus: string; lastTestError: string | null }) { return { id: row.id, provider: row.provider.toLowerCase(), region: row.region, bucket: row.bucket, cdnBaseUrl: row.cdnBaseUrl, accessKeyIdMask: row.accessKeyIdMask, enabled: row.enabled, lastTestAt: row.lastTestAt?.toISOString() ?? null, lastTestStatus: row.lastTestStatus.toLowerCase(), lastTestError: row.lastTestError } }
}
