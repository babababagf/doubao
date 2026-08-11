import { describe, expect, it } from 'vitest'

import { isAllowedResolvedAddress, isPublicIpAddress, parsePublicHttpsBaseUrl } from './outbound-url-policy.service'

describe('模型接口出站地址策略', () => {
  it('只接受不含凭据和查询参数的 HTTPS 域名地址', () => {
    expect(parsePublicHttpsBaseUrl('https://api.example.com/v1')?.toString()).toBe('https://api.example.com/v1')
    expect(parsePublicHttpsBaseUrl('http://api.example.com')).toBeNull()
    expect(parsePublicHttpsBaseUrl('https://localhost/v1')).toBeNull()
    expect(parsePublicHttpsBaseUrl('https://user:pass@api.example.com')).toBeNull()
    expect(parsePublicHttpsBaseUrl('https://api.example.com/v1?token=x')).toBeNull()
    expect(parsePublicHttpsBaseUrl('https://127.0.0.1/v1')).toBeNull()
    expect(parsePublicHttpsBaseUrl('https://[::1]/v1')).toBeNull()
  })

  it('拒绝解析到回环、内网、链路本地和保留网段的地址', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.1.1', '100.64.0.1', '198.18.0.1', '::1', 'fc00::1', 'fe80::1']) expect(isPublicIpAddress(address)).toBe(false)
    for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) expect(isPublicIpAddress(address)).toBe(true)
  })

  it('仅为固定官方预设域名保留最小地址例外', () => {
    expect(isAllowedResolvedAddress('ark.cn-beijing.volces.com', '198.18.12.1')).toBe(true)
    expect(isAllowedResolvedAddress('api.deepseek.com', '198.18.12.1')).toBe(true)
    expect(isAllowedResolvedAddress('ark.cn-beijing.volces.com', '10.0.0.1')).toBe(false)
    expect(isAllowedResolvedAddress('custom.example.com', '198.18.12.1')).toBe(false)
  })
})
