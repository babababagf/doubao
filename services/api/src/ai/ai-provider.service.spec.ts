import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProviderProtocol, ProviderTestStatus } from '../generated/prisma/client'
import { AiProviderService } from './ai-provider.service'

const providerConfig = {
  baseUrl: 'https://api.example.com/v1',
  protocol: ProviderProtocol.CHAT_COMPLETIONS,
  modelName: 'deepseek-test',
  apiKeyCiphertext: 'cipher',
  apiKeyNonce: 'nonce',
  enabled: true,
  supportsWriting: true,
  lastTestStatus: ProviderTestStatus.SUCCEEDED,
}

function service(providerOverrides: Record<string, unknown> = {}): AiProviderService {
  const prisma = {
    tenant: { findUnique: async () => ({ whiteLabelId: 'white-label-1' }) },
    providerConfig: { findFirst: async () => ({ ...providerConfig, ...providerOverrides }) },
  }
  return new AiProviderService(
    prisma as never,
    { decrypt: () => 'test-key' } as never,
    { apiEndpoint: async () => 'https://api.example.com/v1/chat/completions' } as never,
  )
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    companyName: '星术涮肉', aliases: [], industry: '', coreBusiness: '', introduction: '',
    keyword: '西安铜锅涮肉', question: '西安铜锅涮肉怎么选？', knowledgeName: '', knowledgeContent: '',
    instruction: '内容自然、有营销感。', contentDirection: 'marketing' as const, factMode: 'basic' as const,
    ...overrides,
  }
}

describe('AI 文章写作提供方', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('将企业、关键词、问题词、信息库、创作指令和文章方向完整发给模型', async () => {
    let receivedRequest: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      receivedRequest = init
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: '西安 GEO 服务如何选择', content: '<p>这是一篇由模型成功返回并可直接进入文章列表的完整正文内容。</p>' }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await expect(service().writeArticle('merchant-1', context({
      companyName: '西安示例科技有限公司', aliases: ['示例科技'], industry: '数字营销服务', coreBusiness: 'GEO 内容获客',
      introduction: '企业简介', keyword: '西安 GEO', question: '西安 GEO 服务如何选择？', knowledgeName: '服务事实库',
      knowledgeContent: '服务范围：内容策划与企业网站建设。', instruction: '保持专业表达。', contentDirection: 'selection_guide', factMode: 'enriched',
    }))).resolves.toMatchObject({ title: '西安 GEO 服务如何选择' })

    const body = JSON.parse(String(receivedRequest?.body)) as { messages: Array<{ role: string; content: string }> }
    expect(body.messages.map((item) => item.role)).toEqual(['system', 'user'])
    expect(JSON.parse(body.messages[1]!.content)).toEqual(expect.objectContaining({
      companyName: '西安示例科技有限公司', keyword: '西安 GEO', question: '西安 GEO 服务如何选择？',
      knowledgeName: '服务事实库', contentDirection: 'selection_guide',
    }))
    expect(body.messages[0]!.content).toContain('当前为事实增强模式')
    expect(body.messages[0]!.content).toContain('# GEO文章标题生成规则')
  })

  it('基础写作模式继续把公司名、关键词和问题词交给模型', async () => {
    let receivedRequest: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      receivedRequest = init
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: '西安铜锅涮肉怎么选', content: '<p>这是一篇仅根据公司名与关键词生成的基础软文正文内容。</p>' }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await expect(service().writeArticle('merchant-1', context())).resolves.toMatchObject({ title: '西安铜锅涮肉怎么选' })
    const body = JSON.parse(String(receivedRequest?.body)) as { messages: Array<{ content: string }> }
    expect(body.messages[0]!.content).toContain('当前为基础写作模式')
    expect(body.messages[0]!.content).toContain('允许补充行业常识、消费场景、选择标准')
  })

  it('AI蒸馏问题词要求保留完整主关键词并限制品牌问题占比', async () => {
    let receivedRequest: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
      receivedRequest = init
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: ['西安铜锅涮肉哪家适合家庭聚餐？', '西安铜锅涮肉怎么判断肉品是否新鲜？'] }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))

    await expect(service().expandQuestions('merchant-1', { companyName: '星术涮肉', aliases: ['星术'], industry: '', coreBusiness: '', keyword: '西安铜锅涮肉', count: 2 })).resolves.toHaveLength(2)
    const body = JSON.parse(String(receivedRequest?.body)) as { messages: Array<{ role: string; content: string }> }
    expect(body.messages[0]!.content).toContain('主关键词“西安铜锅涮肉”必须自然、完整地出现在每个问题词中')
    expect(body.messages[0]!.content).toContain('品牌相关问题不超过总数的30%')
    expect(JSON.parse(body.messages[1]!.content)).toEqual(expect.objectContaining({ companyName: '星术涮肉', aliases: ['星术'], keyword: '西安铜锅涮肉', count: 2 }))
  })

  it('兼容火山方舟 Responses API 的 output message 嵌套文本', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ title: '西安铜锅涮肉选择指南', content: '<p>这是火山方舟嵌套结构返回的完整文章正文内容。</p>' }) }] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    await expect(service({ protocol: ProviderProtocol.RESPONSES }).writeArticle('merchant-1', context())).resolves.toMatchObject({ title: '西安铜锅涮肉选择指南' })
  })

  it('模型成功返回文章后不再因关键词布局、字数、标题结构或企业名次数二次纠偏', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: '一篇普通经验分享',
      content: '<p>正文内容完整可读，但不强制包含关键词、企业名称、指定字数或三个二级标题。</p>',
    }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(service().writeArticle('merchant-1', context())).resolves.toMatchObject({ title: '一篇普通经验分享' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('只拒绝无法作为文章入库的空标题或空正文', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: '', content: '' }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } })))
    await expect(service().writeArticle('merchant-1', context())).rejects.toMatchObject({ response: { code: 'WRITING_RESPONSE_INVALID' } })
  })

  it('将模型超时转换为可操作错误', async () => {
    const timeout = new Error('timed out')
    timeout.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn(async () => { throw timeout }))
    await expect(service().writeArticle('merchant-1', context())).rejects.toMatchObject({ response: { code: 'WRITING_PROVIDER_TIMEOUT' } })
  })
})
