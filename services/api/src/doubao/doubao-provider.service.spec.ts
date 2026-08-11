import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProviderProtocol, ProviderTestStatus } from '../generated/prisma/client'
import { DoubaoProviderService } from './doubao-provider.service'

describe('DoubaoProviderService', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('联网搜索插件未开通时拒绝检测，不将失败当作未收录', async () => {
    const prisma = {
      providerConfig: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'provider-1',
          tenantId: 'white-1',
          alias: '豆包检测',
          modelName: 'doubao-seed-2-0-lite-260428',
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKeyCiphertext: 'ciphertext',
          apiKeyNonce: 'nonce',
          enabled: true,
          supportsDoubaoCheck: true,
          supportsWebSearch: true,
          protocol: ProviderProtocol.RESPONSES,
          lastTestStatus: ProviderTestStatus.SUCCEEDED,
        }),
      },
    }
    const service = new DoubaoProviderService(
      prisma as never,
      { decrypt: () => 'test-key' } as never,
      { apiEndpoint: async () => 'https://ark.cn-beijing.volces.com/api/v3/responses' } as never,
    )
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'ToolNotOpen' } }), { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(service.search('white-1', 'provider-1', '豆包检测验收企业提供什么服务？'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'DOUBAO_WEB_SEARCH_TOOL_NOT_OPEN' }) })
    const request = fetchMock.mock.calls[0]?.[1]
    if (!request) throw new Error('FETCH_CALL_MISSING')
    expect(JSON.parse(String(request.body))).toMatchObject({ max_output_tokens: 400, tools: [{ type: 'web_search' }] })
  })

  it('仅在联网回答带有 HTTPS 来源时返回可计入检测的结果', async () => {
    const prisma = {
      providerConfig: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'provider-1', tenantId: 'white-1', alias: '豆包检测', modelName: 'doubao-seed-2-0-lite-260428', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKeyCiphertext: 'ciphertext', apiKeyNonce: 'nonce', enabled: true, supportsDoubaoCheck: true, supportsWebSearch: true,
          protocol: ProviderProtocol.RESPONSES, lastTestStatus: ProviderTestStatus.SUCCEEDED,
        }),
      },
    }
    const service = new DoubaoProviderService(prisma as never, { decrypt: () => 'test-key' } as never, { apiEndpoint: async () => 'https://ark.cn-beijing.volces.com/api/v3/responses' } as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [
        { type: 'web_search_call' },
        { type: 'message', content: [{ text: '测试企业提供企业服务。', annotations: [{ type: 'url_citation', title: '示例来源', url: 'https://example.com/reference?tracking=1#top' }] }] },
      ],
    }), { status: 200 })))

    await expect(service.search('white-1', 'provider-1', '测试企业提供什么服务？')).resolves.toEqual({
      answer: '测试企业提供企业服务。',
      sources: [{ title: '示例来源', url: 'https://example.com/reference' }],
    })
  })

  it('忽略方舟检索跳转域，只保留可核验的实际内容来源', async () => {
    const prisma = {
      providerConfig: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'provider-1', tenantId: 'white-1', alias: '豆包检测', modelName: 'doubao-seed-2-0-lite-260428', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKeyCiphertext: 'ciphertext', apiKeyNonce: 'nonce', enabled: true, supportsDoubaoCheck: true, supportsWebSearch: true,
          protocol: ProviderProtocol.RESPONSES, lastTestStatus: ProviderTestStatus.SUCCEEDED,
        }),
      },
    }
    const service = new DoubaoProviderService(prisma as never, { decrypt: () => 'test-key' } as never, { apiEndpoint: async () => 'https://ark.cn-beijing.volces.com/api/v3/responses' } as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [
        { type: 'web_search_call', url: 'https://p11-volcsearch-sign.byteimg.com/internal?token=private' },
        { type: 'message', content: [{ text: '测试企业提供企业服务。', annotations: [
          { type: 'url_citation', title: '检索跳转', url: 'https://p11-volcsearch-sign.byteimg.com/redirect?token=private' },
          { type: 'url_citation', title: '实际来源', url: 'https://content.example.com/article?tracking=1' },
        ] }] },
      ],
    }), { status: 200 })))

    await expect(service.search('white-1', 'provider-1', '测试企业提供什么服务？')).resolves.toEqual({
      answer: '测试企业提供企业服务。',
      sources: [{ title: '实际来源', url: 'https://content.example.com/article' }],
    })
  })

  it('联网回答缺少可核验来源时拒绝计入检测', async () => {
    const prisma = { providerConfig: { findFirst: vi.fn().mockResolvedValue({ id: 'provider-1', tenantId: 'white-1', alias: '豆包检测', modelName: 'doubao-seed', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKeyCiphertext: 'ciphertext', apiKeyNonce: 'nonce', enabled: true, supportsDoubaoCheck: true, supportsWebSearch: true, protocol: ProviderProtocol.RESPONSES, lastTestStatus: ProviderTestStatus.SUCCEEDED }) } }
    const service = new DoubaoProviderService(prisma as never, { decrypt: () => 'test-key' } as never, { apiEndpoint: async () => 'https://ark.cn-beijing.volces.com/api/v3/responses' } as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output: [{ type: 'web_search_call' }, { type: 'message', content: [{ text: '测试企业提供企业服务。' }] }] }), { status: 200 })))

    await expect(service.search('white-1', 'provider-1', '测试企业提供什么服务？')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'DOUBAO_RESPONSE_SOURCE_MISSING' }) })
  })
})
