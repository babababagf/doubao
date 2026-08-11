import { describe, expect, it } from 'vitest'

const baseUrl = process.env.LOCAL_API_URL ?? 'http://127.0.0.1:3010/api'
const describeLocalWriteIntegration = process.env.LOCAL_API_INTEGRATION_WRITE === 'true' ? describe : describe.skip

async function request(path: string, init?: RequestInit, cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(cookie ? { cookie } : {}) },
  })
}

async function login(path: string, username: string, password: string): Promise<string> {
  const response = await request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
  expect(response.status).toBe(201)
  const value = response.headers.getSetCookie()[0]?.split(';')[0]
  if (!value) throw new Error('登录响应未返回会话 Cookie')
  return value
}

describeLocalWriteIntegration('本地真实租户开通 API', () => {
  it('按角色、席位和幂等键开通贴牌、代理、普通商户', async () => {
    const nonce = String(Date.now()).slice(-8)
    const whiteLabelUsername = `w${nonce}`
    const agentUsername = `a${nonce}`
    const merchantUsername = `m${nonce}`
    const superCookie = await login('/super/auth/login', 'admin001', 'admin123')
    const configuredPlatformDomains = await request('/super/platform-domains', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ superAdminHostname: `admin${nonce}.example.com`, tenantAdminHostname: `console${nonce}.example.com`, merchantWebHostname: `client${nonce}.example.com`, contentRootHostname: `content${nonce}.example.com` }) }, superCookie)
    expect(configuredPlatformDomains.status).toBe(200)
    expect(await configuredPlatformDomains.json()).toMatchObject({ contentRootHostname: `content${nonce}.example.com` })
    const whiteLabelPayload = { username: whiteLabelUsername, password: 'pass1234', companyName: `自动验收贴牌${nonce}`, agentLimit: 1, merchantLimit: 2, computePoints: 300, writingLimit: 10, primaryDomain: `wl${nonce}.example.com`, expiresAt: '2027-08-07T00:00:00.000Z' }
    const whiteLabelKey = `white-${nonce}`
    const createdWhiteLabel = await request('/super/white-labels', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': whiteLabelKey }, body: JSON.stringify(whiteLabelPayload) }, superCookie)
    expect(createdWhiteLabel.status).toBe(201)
    const whiteLabel = await createdWhiteLabel.json() as { tenantId: string; domainStatus: string | null }
    expect(whiteLabel.domainStatus).toBe('pending_verification')

    const domains = await request('/super/domains', undefined, superCookie)
    expect(domains.status).toBe(200)
    const createdDomain = (await domains.json() as Array<{ id: string; hostname: string; ownershipStatus: string; dnsRecordName: string | null; dnsRecordValue: string | null }>).find((item) => item.hostname === whiteLabelPayload.primaryDomain)
    expect(createdDomain?.ownershipStatus).toBe('pending_dns')
    expect(createdDomain?.dnsRecordName).toBe(`_doubaohk-verify.${whiteLabelPayload.primaryDomain}`)
    expect(createdDomain?.dnsRecordValue).toMatch(/^doubaohk-verification=/)

    const updatedBrand = await request(`/super/white-labels/${whiteLabel.tenantId}/brand`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: `验收品牌${nonce}`, logoUrl: 'https://assets.example.com/logo.png' }) }, superCookie)
    expect(updatedBrand.status).toBe(200)
    expect((await updatedBrand.json() as { nickname: string; version: number }).nickname).toBe(`验收品牌${nonce}`)

    const replayedWhiteLabel = await request('/super/white-labels', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': whiteLabelKey }, body: JSON.stringify(whiteLabelPayload) }, superCookie)
    expect(replayedWhiteLabel.status).toBe(201)
    expect((await replayedWhiteLabel.json() as { tenantId: string }).tenantId).toBe(whiteLabel.tenantId)

    const whiteLabelCookie = await login('/tenant/auth/login', whiteLabelUsername, 'pass1234')
    const whiteLabelBootstrap = await request('/tenant/bootstrap', undefined, whiteLabelCookie)
    expect(whiteLabelBootstrap.status).toBe(200)
    expect((await whiteLabelBootstrap.json() as { capabilities: { canCreateAgent: boolean } }).capabilities.canCreateAgent).toBe(true)
    const whiteLabelProviders = await request('/tenant/provider-configs', undefined, whiteLabelCookie)
    expect(whiteLabelProviders.status).toBe(200)
    expect(await whiteLabelProviders.json()).toEqual([])
    const providerSecret = 'local-provider-test-key-123456'
    const createdProvider = await request('/tenant/provider-configs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: `写作配置${nonce}`, platform: 'deepseek', protocol: 'chat_completions', modelName: 'deepseek-v4-flash', apiKey: providerSecret, supportsWriting: true, supportsDoubaoCheck: false, supportsWebSearch: false }) }, whiteLabelCookie)
    expect(createdProvider.status).toBe(201)
    const providerPayload = await createdProvider.json() as Record<string, unknown>
    expect(JSON.stringify(providerPayload)).not.toContain(providerSecret)
    expect(providerPayload.keyMask).toBeTruthy()
    const providerId = providerPayload.id as string
    const updatedProvider = await request(`/tenant/provider-configs/${providerId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias: `写作配置更新${nonce}`, platform: 'deepseek', protocol: 'chat_completions', modelName: 'deepseek-v4-flash', apiKey: '', supportsWriting: true, supportsDoubaoCheck: false, supportsWebSearch: false }) }, whiteLabelCookie)
    expect(updatedProvider.status).toBe(200)
    const updatedProviderPayload = await updatedProvider.json() as Record<string, unknown>
    expect(updatedProviderPayload).toMatchObject({ alias: `写作配置更新${nonce}`, enabled: false, lastTestStatus: 'never', lastTestAt: null })
    expect(updatedProviderPayload.keyMask).toBe(providerPayload.keyMask)
    expect(JSON.stringify(updatedProviderPayload)).not.toContain(providerSecret)
    const rejectedEnable = await request(`/tenant/provider-configs/${providerId}/enabled`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) }, whiteLabelCookie)
    expect(rejectedEnable.status).toBe(409)
    const deletedProvider = await request(`/tenant/provider-configs/${providerId}`, { method: 'DELETE' }, whiteLabelCookie)
    expect(deletedProvider.status).toBe(200)
    const storageSecret = 'local-storage-secret-123456'
    const savedStorage = await request('/tenant/object-storage', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ region: 'oss-cn-hangzhou', bucket: `local-acceptance-${nonce}`, cdnBaseUrl: 'https://cdn.example.com', accessKeyId: 'LTAIlocalacceptance1234', accessKeySecret: storageSecret }) }, whiteLabelCookie)
    expect(savedStorage.status).toBe(200)
    const storagePayload = await savedStorage.json() as Record<string, unknown>
    expect(JSON.stringify(storagePayload)).not.toContain(storageSecret)
    expect(storagePayload.accessKeyIdMask).toBeTruthy()
    const agentPayload = { username: agentUsername, password: 'pass1234', companyName: `自动验收代理${nonce}`, merchantLimit: 1, computePoints: 100, writingLimit: 3, expiresAt: '2027-07-01T00:00:00.000Z' }
    const createdAgent = await request('/tenant/agents', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `agent-${nonce}` }, body: JSON.stringify(agentPayload) }, whiteLabelCookie)
    expect(createdAgent.status).toBe(201)

    const agentCookie = await login('/tenant/auth/login', agentUsername, 'pass1234')
    const agentBootstrap = await request('/tenant/bootstrap', undefined, agentCookie)
    expect(agentBootstrap.status).toBe(200)
    expect((await agentBootstrap.json() as { capabilities: { canCreateAgent: boolean; canCreateMerchant: boolean } }).capabilities).toEqual({ canCreateAgent: false, canCreateMerchant: true, canManageProviders: false, canManageObjectStorage: false, canRunDoubaoChecks: false })
    const agentProviders = await request('/tenant/provider-configs', undefined, agentCookie)
    expect(agentProviders.status).toBe(401)
    const agentStorage = await request('/tenant/object-storage', undefined, agentCookie)
    expect(agentStorage.status).toBe(401)
    const merchantPayload = { username: merchantUsername, password: 'pass1234', companyName: `自动验收商户${nonce}`, keywordLimit: 20, computePoints: 30, writingLimit: 1, expiresAt: '2027-06-01T00:00:00.000Z' }
    const createdMerchant = await request('/tenant/merchants', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `merchant-${nonce}` }, body: JSON.stringify(merchantPayload) }, agentCookie)
    expect(createdMerchant.status).toBe(201)

    const agentMerchants = await request('/tenant/managed-merchants', undefined, agentCookie)
    expect(agentMerchants.status).toBe(200)
    expect((await agentMerchants.json() as Array<{ companyName: string }>).some((item) => item.companyName === merchantPayload.companyName)).toBe(true)

    const rejectedAgentCreation = await request('/tenant/agents', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `denied-${nonce}` }, body: JSON.stringify(agentPayload) }, agentCookie)
    expect(rejectedAgentCreation.status).toBe(401)

    const allTenants = await request('/super/tenants', undefined, superCookie)
    expect(allTenants.status).toBe(200)
    expect((await allTenants.json() as Array<{ companyName: string; kind: string; status: string }>).some((item) => item.companyName === whiteLabelPayload.companyName && item.kind === 'white_label' && item.status === 'active')).toBe(true)

    const disabledWhiteLabel = await request(`/super/tenants/${whiteLabel.tenantId}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'disabled' }) }, superCookie)
    expect(disabledWhiteLabel.status).toBe(200)
    expect((await disabledWhiteLabel.json() as { status: string }).status).toBe('disabled')

    const blockedAgentLogin = await request('/tenant/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: agentUsername, password: 'pass1234' }) })
    expect(blockedAgentLogin.status).toBe(401)
  })
})
