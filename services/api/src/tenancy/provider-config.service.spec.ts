import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProviderPlatform, ProviderProtocol, ProviderTestStatus, UserRole } from '../generated/prisma/client'
import { ProviderConfigService } from './provider-config.service'

const actor = { userId: 'white-user', tenantId: 'white-1', username: 'white001', role: UserRole.WHITE_LABEL_ADMIN, status: 'ACTIVE' } as never
const existing = {
  id: 'provider-1', tenantId: 'white-1', alias: '旧模型', platform: ProviderPlatform.DEEPSEEK, protocol: ProviderProtocol.CHAT_COMPLETIONS,
  baseUrl: 'https://api.deepseek.com', modelName: 'deepseek-chat', apiKeyCiphertext: 'old-ciphertext', apiKeyNonce: 'old-nonce', keyMask: 'old…key',
  supportsWriting: true, supportsDoubaoCheck: false, supportsWebSearch: false, enabled: true, lastTestAt: new Date(), lastTestStatus: ProviderTestStatus.SUCCEEDED, lastTestError: null,
}

function fixture() {
  const audit: unknown[] = []
  const updates: unknown[] = []
  const crypto = { encrypt: (value: string) => ({ ciphertext: `cipher:${value}`, nonce: `nonce:${value}` }), decrypt: () => 'test-provider-key' }
  const prisma = {
    providerConfig: { findFirst: async () => existing },
    $transaction: async (work: (tx: unknown) => unknown) => work({
      providerConfig: {
        findFirst: async () => null,
        update: async ({ data }: { data: object }) => { updates.push(data); return { ...existing, ...data } },
      },
      auditLog: { create: async ({ data }: { data: unknown }) => audit.push(data) },
    }),
  }
  const outbound = { apiEndpoint: async () => 'https://api.deepseek.com/chat/completions' }
  return { service: new ProviderConfigService(prisma as never, crypto as never, outbound as never), audit, updates }
}

const baseInput = { alias: '更新模型', platform: 'deepseek', protocol: 'chat_completions', baseUrl: '', modelName: 'deepseek-chat', supportsWriting: true, supportsDoubaoCheck: false, supportsWebSearch: false }

describe('ProviderConfigService 编辑配置', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('空 API Key 保留原密文，但强制停用并重新测试', async () => {
    const { service, audit, updates } = fixture()

    const result = await service.update(actor, existing.id, { ...baseInput, apiKey: '' })

    expect(result).toMatchObject({ alias: '更新模型', keyMask: 'old…key', enabled: false, lastTestStatus: 'never', lastTestAt: null })
    expect(updates[0]).toMatchObject({ enabled: false, lastTestStatus: ProviderTestStatus.NEVER, lastTestAt: null, lastTestError: null })
    expect(updates[0]).not.toHaveProperty('apiKeyCiphertext')
    expect(audit[0]).toMatchObject({ detail: { apiKeyReplaced: false, retestRequired: true } })
  })

  it('填写新 API Key 仅替换密文和掩码，审计不记录明文', async () => {
    const { service, audit, updates } = fixture()

    const result = await service.update(actor, existing.id, { ...baseInput, apiKey: 'replacement-key-123' })

    expect(result).toMatchObject({ keyMask: 'repl…-123', enabled: false, lastTestStatus: 'never' })
    expect(updates[0]).toMatchObject({ apiKeyCiphertext: 'cipher:replacement-key-123', apiKeyNonce: 'nonce:replacement-key-123' })
    expect(JSON.stringify(audit[0])).not.toContain('replacement-key-123')
  })

  it('兼用写作和豆包检测时，必须分别完成结构化写作与联网搜索测试', async () => {
    const { service, updates } = fixture()
    const combined = { ...existing, platform: ProviderPlatform.VOLCENGINE_ARK, protocol: ProviderProtocol.RESPONSES, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', modelName: 'doubao-seed-2-0-lite-260215', supportsWriting: true, supportsDoubaoCheck: true, supportsWebSearch: true }
    const prisma = (service as unknown as { prisma: { providerConfig: { findFirst: () => Promise<object> } } }).prisma
    prisma.providerConfig.findFirst = async () => combined
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '{"title":"测试标题","content":"<p>测试正文</p>"}' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: '北京今日天气晴朗', output: [{ type: 'web_search_call' }, { type: 'message', content: [{ text: '北京今日天气晴朗', annotations: [{ type: 'url_citation', title: '验证来源', url: 'https://example.com/weather?tracking=1' }] }] }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await service.test(actor, existing.id)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ lastTestStatus: 'succeeded' })
    expect(updates[0]).toMatchObject({ lastTestStatus: ProviderTestStatus.SUCCEEDED })
  })

  it('联网搜索插件未开通时，返回可操作的配置错误且不启用模型', async () => {
    const { service, updates } = fixture()
    const doubaoOnly = { ...existing, platform: ProviderPlatform.VOLCENGINE_ARK, protocol: ProviderProtocol.RESPONSES, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', modelName: 'doubao-seed-2-0-lite-260428', supportsWriting: false, supportsDoubaoCheck: true, supportsWebSearch: true }
    const prisma = (service as unknown as { prisma: { providerConfig: { findFirst: () => Promise<object> } } }).prisma
    prisma.providerConfig.findFirst = async () => doubaoOnly
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'ToolNotOpen' } }), { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await service.test(actor, existing.id)

    expect(result).toMatchObject({ lastTestStatus: 'failed', lastTestError: 'WEB_SEARCH_TOOL_NOT_OPEN', enabled: false })
    expect(updates[0]).toMatchObject({ lastTestStatus: ProviderTestStatus.FAILED, lastTestError: 'WEB_SEARCH_TOOL_NOT_OPEN', enabled: false })
    const request = fetchMock.mock.calls[0]?.[1]
    if (!request) throw new Error('FETCH_CALL_MISSING')
    expect(JSON.parse(String(request.body))).toMatchObject({ max_output_tokens: 400 })
  })

  it('联网回答没有可核验来源时，不能将模型配置标记为可用', async () => {
    const { service, updates } = fixture()
    const doubaoOnly = { ...existing, platform: ProviderPlatform.VOLCENGINE_ARK, protocol: ProviderProtocol.RESPONSES, baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', modelName: 'doubao-seed-2-0-lite-260428', supportsWriting: false, supportsDoubaoCheck: true, supportsWebSearch: true }
    const prisma = (service as unknown as { prisma: { providerConfig: { findFirst: () => Promise<object> } } }).prisma
    prisma.providerConfig.findFirst = async () => doubaoOnly
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: '北京今日天气晴朗', output: [{ type: 'web_search_call' }, { type: 'message', content: [{ text: '北京今日天气晴朗' }] }] }), { status: 200 })))

    const result = await service.test(actor, existing.id)

    expect(result).toMatchObject({ lastTestStatus: 'failed', lastTestError: 'WEB_SEARCH_SOURCE_MISSING', enabled: false })
    expect(updates[0]).toMatchObject({ lastTestStatus: ProviderTestStatus.FAILED, lastTestError: 'WEB_SEARCH_SOURCE_MISSING', enabled: false })
  })
})
