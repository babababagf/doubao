import { Injectable } from '@nestjs/common'
import { resolve4, resolve6 } from 'node:dns/promises'
import { isIP } from 'node:net'

const blockedHostnames = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal'])
const reservedRangeOfficialHostnames = new Set(['ark.cn-beijing.volces.com', 'api.deepseek.com'])

export function isPublicIpAddress(value: string): boolean {
  const normalized = value.toLowerCase()
  const family = isIP(normalized)
  if (family === 4) {
    const [a = 0, b = 0] = normalized.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false
    if (a === 100 && b >= 64 && b <= 127) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && (b === 0 || b === 168)) return false
    if (a === 198 && (b === 18 || b === 19)) return false
    return true
  }
  if (family === 6) {
    if (normalized === '::' || normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return false
    if (normalized.startsWith('::ffff:')) return isPublicIpAddress(normalized.slice(7))
    return true
  }
  return false
}

export function parsePublicHttpsBaseUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    const host = hostname(url)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !host || blockedHostnames.has(host) || host.endsWith('.local') || isIP(host)) return null
    return url
  } catch {
    return null
  }
}

export function isAllowedResolvedAddress(hostname: string, address: string): boolean {
  if (isPublicIpAddress(address)) return true
  return reservedRangeOfficialHostnames.has(hostname) && /^198\.(18|19)\./.test(address)
}

@Injectable()
export class OutboundUrlPolicyService {
  async publicHttpsBaseUrl(baseUrl: string): Promise<string> {
    const url = parsePublicHttpsBaseUrl(baseUrl)
    if (!url) throw new Error('OUTBOUND_URL_INVALID')
    const host = hostname(url)
    const addresses = await this.resolvePublicAddresses(host)
    if (!addresses.length || addresses.some((address) => !isAllowedResolvedAddress(host, address))) throw new Error('OUTBOUND_DNS_BLOCKED')
    return url.toString().replace(/\/$/, '')
  }

  async apiEndpoint(baseUrl: string, suffix: 'chat/completions' | 'responses'): Promise<string> {
    const url = parsePublicHttpsBaseUrl(baseUrl)
    if (!url) throw new Error('OUTBOUND_URL_INVALID')
    const addresses = await this.resolvePublicAddresses(hostname(url))
    if (!addresses.length || addresses.some((address) => !isAllowedResolvedAddress(hostname(url), address))) throw new Error('OUTBOUND_DNS_BLOCKED')
    return `${url.toString().replace(/\/$/, '')}/${suffix}`
  }

  private async resolvePublicAddresses(hostname: string): Promise<string[]> {
    const settled = await Promise.allSettled([resolve4(hostname), resolve6(hostname)])
    const addresses = settled.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    return [...new Set(addresses)]
  }
}

function hostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
}
