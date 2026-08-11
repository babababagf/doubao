import { BadRequestException } from '@nestjs/common'

export type MediaSessionPlatform = 'toutiao' | 'douyin'
export type MediaSessionStorageItem = { name: string; value: string }
export type PortableMediaSessionBundle = {
  schemaVersion: 1
  platform: MediaSessionPlatform
  localReferenceId: string
  capturedAt: string
  cookies: Array<{
    name: string
    value: string
    domain: string
    hostOnly?: boolean
    path: string
    secure: boolean
    httpOnly: boolean
    session?: boolean
    sameSite?: string
    partitionKey?: string
    expirationDate?: number
    expires?: number
  }>
  origins: Array<{
    origin: string
    localStorage: MediaSessionStorageItem[]
    sessionStorage: MediaSessionStorageItem[]
    indexedDB?: unknown[]
  }>
}

export const mediaSessionMaximumBytes = 2 * 1024 * 1024

const platformDomainSuffixes: Record<MediaSessionPlatform, readonly string[]> = {
  toutiao: ['toutiao.com', 'toutiaocdn.com', 'byteimg.com', 'snssdk.com', 'bytedance.com', 'bytegoofy.com', 'zijieapi.com'],
  douyin: ['douyin.com', 'iesdouyin.com', 'douyinvod.com', 'douyinpic.com', 'douyincdn.com', 'byteimg.com', 'snssdk.com', 'bytedance.com', 'bytegoofy.com', 'zijieapi.com'],
}

function invalid(message = '媒体账号会话包格式无效'): never {
  throw new BadRequestException({ code: 'MEDIA_SESSION_BUNDLE_INVALID', message })
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.length < 1)) invalid()
  return value
}

function allowedHost(value: string, platform: MediaSessionPlatform): boolean {
  const hostname = value.toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
  return platformDomainSuffixes[platform].some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
}

function storageItems(value: unknown): MediaSessionStorageItem[] {
  if (!Array.isArray(value) || value.length > 500) invalid()
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid()
    const raw = item as Record<string, unknown>
    return { name: boundedString(raw.name, 2_048), value: boundedString(raw.value, 65_536, true) }
  })
}

function safeJson(value: unknown, state: { nodes: number }, depth = 0): unknown {
  state.nodes += 1
  if (state.nodes > 20_000 || depth > 20) invalid('媒体账号 IndexedDB 会话数据过大或嵌套过深')
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return boundedString(value, 65_536, true)
  if (Array.isArray(value)) {
    if (value.length > 5_000) invalid('媒体账号 IndexedDB 会话数据过大')
    return value.map((item) => safeJson(item, state, depth + 1))
  }
  if (!value || typeof value !== 'object') invalid()
  const result: Record<string, unknown> = {}
  const entries = Object.entries(value)
  if (entries.length > 2_000) invalid('媒体账号 IndexedDB 会话数据过大')
  for (const [key, item] of entries) result[boundedString(key, 2_048)] = safeJson(item, state, depth + 1)
  return result
}

export function validateMediaSessionBundle(input: unknown, expected: { platform: MediaSessionPlatform; localReferenceId: string }): { bundle: PortableMediaSessionBundle; serialized: Buffer } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid()
  const raw = input as Record<string, unknown>
  if (raw.schemaVersion !== 1 || raw.platform !== expected.platform || raw.localReferenceId !== expected.localReferenceId) invalid('媒体账号会话包与目标账号不匹配')
  const capturedAtDate = new Date(boundedString(raw.capturedAt, 64))
  if (!Number.isFinite(capturedAtDate.getTime()) || capturedAtDate.getTime() > Date.now() + 10 * 60_000) invalid('媒体账号会话包采集时间无效')
  if (!Array.isArray(raw.cookies) || raw.cookies.length > 500 || !Array.isArray(raw.origins) || raw.origins.length > 20) invalid()

  const cookies = raw.cookies.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid()
    const cookie = item as Record<string, unknown>
    const domain = boundedString(cookie.domain, 255)
    if (!allowedHost(domain, expected.platform)) invalid('媒体账号会话包包含非目标平台域名')
    const normalized: PortableMediaSessionBundle['cookies'][number] = {
      name: boundedString(cookie.name, 1_024),
      value: boundedString(cookie.value, 16_384, true),
      domain,
      path: boundedString(cookie.path, 2_048),
      secure: cookie.secure === true,
      httpOnly: cookie.httpOnly === true,
    }
    if (typeof cookie.hostOnly === 'boolean') normalized.hostOnly = cookie.hostOnly
    if (typeof cookie.session === 'boolean') normalized.session = cookie.session
    if (typeof cookie.sameSite === 'string' && ['Strict', 'Lax', 'None', 'strict', 'lax', 'no_restriction', 'unspecified'].includes(cookie.sameSite)) normalized.sameSite = cookie.sameSite
    if (typeof cookie.partitionKey === 'string') {
      let partitionKey: URL
      try { partitionKey = new URL(boundedString(cookie.partitionKey, 2_048)) } catch { invalid('媒体账号 Cookie 分区键无效') }
      if (partitionKey.protocol !== 'https:' || partitionKey.username || partitionKey.password || partitionKey.pathname !== '/' || partitionKey.search || partitionKey.hash || !allowedHost(partitionKey.hostname, expected.platform)) invalid('媒体账号 Cookie 分区键不属于目标平台')
      normalized.partitionKey = partitionKey.origin
    }
    for (const field of ['expirationDate', 'expires'] as const) {
      const value = cookie[field]
      if (typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 4_102_444_800) normalized[field] = value
    }
    return normalized
  })

  const origins = raw.origins.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid()
    const originRecord = item as Record<string, unknown>
    let url: URL
    try { url = new URL(boundedString(originRecord.origin, 2_048)) } catch { invalid() }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !allowedHost(url.hostname, expected.platform)) invalid('媒体账号会话包包含非目标平台来源')
    const origin: PortableMediaSessionBundle['origins'][number] = {
      origin: url.origin,
      localStorage: storageItems(originRecord.localStorage),
      sessionStorage: storageItems(originRecord.sessionStorage),
    }
    if (originRecord.indexedDB !== undefined) {
      if (!Array.isArray(originRecord.indexedDB) || originRecord.indexedDB.length > 100) invalid('媒体账号 IndexedDB 会话数据过大')
      origin.indexedDB = safeJson(originRecord.indexedDB, { nodes: 0 }) as unknown[]
    }
    return origin
  })

  const bundle: PortableMediaSessionBundle = {
    schemaVersion: 1,
    platform: expected.platform,
    localReferenceId: expected.localReferenceId,
    capturedAt: capturedAtDate.toISOString(),
    cookies,
    origins,
  }
  const serialized = Buffer.from(JSON.stringify(bundle), 'utf8')
  if (serialized.length > mediaSessionMaximumBytes) invalid(`媒体账号会话包不能超过 ${mediaSessionMaximumBytes} 字节`)
  return { bundle, serialized }
}
