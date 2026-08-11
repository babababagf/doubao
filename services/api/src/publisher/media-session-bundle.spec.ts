import { describe, expect, it } from 'vitest'

import { validateMediaSessionBundle } from './media-session-bundle'

const expected = { platform: 'douyin' as const, localReferenceId: '11111111-1111-4111-8111-111111111111' }

function bundle(domain = '.douyin.com') {
  return {
    schemaVersion: 1,
    platform: 'douyin',
    localReferenceId: expected.localReferenceId,
    capturedAt: '2026-08-08T00:00:00.000Z',
    cookies: [{ name: 'sessionid', value: 'secret', domain, path: '/', secure: true, httpOnly: true, session: false, sameSite: 'None', partitionKey: 'https://creator.douyin.com', expirationDate: 1_800_000_000 }],
    origins: [{ origin: 'https://creator.douyin.com', localStorage: [{ name: 'account', value: '1' }], sessionStorage: [{ name: 'csrf', value: '2' }], indexedDB: [{ name: 'auth', version: 1, stores: [] }] }],
  }
}

describe('validateMediaSessionBundle', () => {
  it('保留 HttpOnly Cookie、完整属性和三类网页存储', () => {
    const result = validateMediaSessionBundle(bundle(), expected)
    expect(result.bundle.cookies[0]).toMatchObject({ name: 'sessionid', httpOnly: true, secure: true, partitionKey: 'https://creator.douyin.com', expirationDate: 1_800_000_000 })
    expect(result.bundle.origins[0]).toMatchObject({ localStorage: [{ name: 'account', value: '1' }], sessionStorage: [{ name: 'csrf', value: '2' }], indexedDB: [{ name: 'auth' }] })
    expect(result.serialized.length).toBeGreaterThan(0)
  })

  it('拒绝混入非目标平台 Cookie 域名', () => {
    expect(() => validateMediaSessionBundle(bundle('.example.com'), expected)).toThrowError()
  })

  it('拒绝混入非目标平台的 Cookie 分区键', () => {
    const input = bundle()
    input.cookies[0]!.partitionKey = 'https://example.com'
    expect(() => validateMediaSessionBundle(input, expected)).toThrowError()
  })
})
