import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'

const maxImageBytes = 50 * 1024 * 1024
const mimeExtensions = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/bmp', '.bmp'],
  ['image/tiff', '.tif'],
])

export type PublisherImageSource = { id: string; mimeType: string; url: string }
export type PublisherAssetBundle = { directory: string; files: string[] }
type LookupAddress = { address: string; family: number }
type AssetDependencies = {
  fetch: typeof fetch
  lookup: (hostname: string) => Promise<LookupAddress[]>
}

const defaultDependencies: AssetDependencies = {
  fetch,
  lookup: async (hostname) => lookup(hostname, { all: true, verbatim: true }),
}

export async function downloadPublisherImages(temporaryRoot: string, images: readonly PublisherImageSource[], dependencies: AssetDependencies = defaultDependencies): Promise<PublisherAssetBundle> {
  if (!images.length || images.length > 3) throw new Error('发布配图数量必须为 1-3 张')
  const base = resolve(temporaryRoot, 'doubaohk-publisher')
  await mkdir(base, { recursive: true })
  const directory = await mkdtemp(join(base, 'task-'))
  const files: string[] = []
  try {
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]!
      const expectedMime = normalizeMime(image.mimeType)
      if (!mimeExtensions.has(expectedMime)) throw new Error(`第 ${index + 1} 张配图格式不受支持`)
      const response = await fetchValidated(image.url, dependencies)
      const actualMime = normalizeMime(response.headers.get('content-type') ?? '')
      if (actualMime !== expectedMime || !mimeExtensions.has(actualMime)) throw new Error(`第 ${index + 1} 张配图返回格式与快照不一致`)
      const contentLength = Number(response.headers.get('content-length') ?? 0)
      if (Number.isFinite(contentLength) && contentLength > maxImageBytes) throw new Error(`第 ${index + 1} 张配图超过 50MB`)
      if (!response.body) throw new Error(`第 ${index + 1} 张配图响应为空`)
      const filePath = join(directory, `${String(index + 1).padStart(2, '0')}-${safeId(image.id)}${mimeExtensions.get(actualMime)}`)
      await writeLimitedResponse(response, filePath, maxImageBytes)
      files.push(filePath)
    }
    return { directory, files }
  } catch (error) {
    await cleanupPublisherAssets(temporaryRoot, { directory, files: [] })
    throw error
  }
}

export async function cleanupPublisherAssets(temporaryRoot: string, bundle: PublisherAssetBundle): Promise<void> {
  const base = `${resolve(temporaryRoot, 'doubaohk-publisher')}${sep}`
  const target = resolve(bundle.directory)
  if (!target.startsWith(base) || !basename(target).startsWith('task-')) throw new Error('拒绝清理非发布助手临时目录')
  await rm(target, { recursive: true, force: true })
}

async function fetchValidated(input: string, dependencies: AssetDependencies): Promise<Response> {
  let current = await validateRemoteUrl(input, dependencies.lookup)
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await dependencies.fetch(current.toString(), { redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || redirects === 3) throw new Error('配图下载重定向无效或次数过多')
      current = await validateRemoteUrl(new URL(location, current).toString(), dependencies.lookup)
      continue
    }
    if (!response.ok) throw new Error(`配图下载失败（${response.status}）`)
    return response
  }
  throw new Error('配图下载重定向异常')
}

async function validateRemoteUrl(input: string, lookupHost: AssetDependencies['lookup']): Promise<URL> {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('配图地址无效') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('配图地址必须是无凭据的 HTTPS 地址')
  const directIp = isIP(url.hostname)
  const addresses = directIp ? [{ address: url.hostname, family: directIp }] : await lookupHost(url.hostname)
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('配图地址不能指向本机或内网')
  return url
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0]!
  if (normalized.includes(':')) {
    if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)) return true
    if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7))
    return false
  }
  const parts = normalized.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const a = parts[0]!
  const b = parts[1]!
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

async function writeLimitedResponse(response: Response, filePath: string, maximumBytes: number): Promise<void> {
  const handle = await open(filePath, 'wx')
  let written = 0
  try {
    const reader = response.body!.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      written += value.byteLength
      if (written > maximumBytes) { await reader.cancel(); throw new Error('配图下载内容超过 50MB') }
      await handle.write(value)
    }
    if (!written) throw new Error('配图下载内容为空')
  } finally { await handle.close() }
}

function normalizeMime(value: string): string { const mime = value.split(';')[0]!.trim().toLowerCase(); return mime === 'image/jpg' ? 'image/jpeg' : mime }
function safeId(value: string): string { const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40); return normalized || 'image' }
