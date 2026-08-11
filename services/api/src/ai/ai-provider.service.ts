import { ConflictException, Injectable } from '@nestjs/common'

import { ProviderProtocol, ProviderTestStatus } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../security/credential-crypto.service'
import { OutboundUrlPolicyService } from '../security/outbound-url-policy.service'

export type ArticleContentDirection = 'marketing' | 'ranking' | 'education' | 'qa' | 'selection_guide' | 'case_study' | 'industry_trend' | 'local_service'
type ArticleContext = { companyName: string; aliases: string[]; industry: string; coreBusiness: string; introduction: string; keyword: string; question: string; knowledgeName: string; knowledgeContent: string; instruction: string; contentDirection: ArticleContentDirection; factMode: 'basic' | 'enriched' }
type QuestionContext = { companyName: string; aliases: string[]; industry: string; coreBusiness: string; keyword: string; count: number }
type ArticleDraft = { title: string; content: string }

const ARTICLE_DIRECTION_GUIDANCE: Record<ArticleContentDirection, string> = {
  marketing: '营销介绍：说明企业服务价值、适用客户与差异点，表达克制，不使用绝对化承诺。',
  ranking: '榜单推荐：围绕选择标准和对比维度作答；只有企业信息库明确提供可核验依据时才可出现具体名次。',
  education: '专业科普：解释概念、原理、适用场景和常见误区，以知识价值为主。',
  qa: '问题解答：直接回答用户问题，先给结论，再分点说明依据与边界。',
  selection_guide: '选择指南：提供可执行的筛选步骤、核验清单、风险提示和决策建议。',
  case_study: '案例解读：仅能使用企业信息库中明确存在的真实案例和数据；没有案例时改写为方法解析，禁止虚构客户、金额和效果。',
  industry_trend: '行业趋势：分析行业变化、用户需求与企业应对建议，不编造市场统计或政策结论。',
  local_service: '本地服务：结合明确提供的地区、服务范围和联系方式说明本地适配性，不虚构门店、覆盖范围或地域排名。',
}

@Injectable()
export class AiProviderService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CredentialCryptoService, private readonly outbound: OutboundUrlPolicyService) {}

  async writeArticle(tenantId: string, context: ArticleContext): Promise<{ title: string; content: string }> {
    const currentYear = new Date().getFullYear()
    const factGuidance = context.factMode === 'enriched'
      ? '当前为事实增强模式：用户选择的企业信息库是文章的事实来源，可据此说明明确的服务、产品、地区、优势和案例；未提供的具体事实仍不得补造，不得读取网站信息。'
      : '当前为基础写作模式：只有企业名称、简称、优化关键词和问题词属于已确认信息。允许补充行业常识、消费场景、选择标准、问题分析和克制的营销表达，使文章具备软文可读性；不得虚构门店地址、具体菜品或产品、价格、资质、销量、排名、顾客评价、合作案例、实测经历、统计数据和效果承诺。不要在正文反复出现“资料不足”“无法确认”“请核实”等免责声明，也不要向读者解释当前模式。'
    const system = [
      '你是擅长 GEO 内容的企业软文编辑，文章要自然、完整、有营销感，但不能伪造可核验事实或第三方背书。',
      '目标是提高内容被搜索与AI问答系统准确理解、抓取和引用的概率，但不得声称保证收录或排名。',
      factGuidance,
      '# GEO文章标题生成规则',
      '你是一位专业的GEO内容标题优化专家。请根据优化关键词、用户问题和企业名称，为文章生成1个准确、自然、有点击吸引力的标题。',
      `优化关键词：${context.keyword}`,
      `用户问题：${context.question}`,
      `企业名称：${context.companyName}`,
      `当前年份：${currentYear}年`,
      `1. 标题必须完整、自然地包含“${context.keyword}”，不得拆分、替换或省略核心关键词。`,
      `2. 标题必须准确回应“${context.question}”的搜索意图，让用户和AI能够直接判断文章主题。`,
      '3. 标题建议控制在20-30字，受今日头条发布规则约束，任何情况下都不得超过30字。',
      '4. 可采用问题解答、选择指南、行业分析、经验总结、避坑建议或趋势观察等标题结构。',
      `5. 在语义自然的情况下加入“${context.companyName}”，不得生硬堆叠企业名称。`,
      `6. 只有涉及榜单、趋势、价格或年度变化等时效性主题时，才加入“${currentYear}年”；常青内容不强制添加年份。`,
      '7. 标题需要有明确的信息价值和适度好奇心，但不得使用夸张、误导、极限词或与正文不符的结论。',
      '8. 禁止使用“震惊、必看、第一、最好、百分百、绝对”等标题党或承诺性词语。',
      '9. 不得虚构排名、销量、评价、资质、数据或第三方背书。',
      '10. 不得堆砌多个近义关键词，不使用无意义的感叹号或特殊符号。',
      '标题输出要求：只生成1个标题并写入最终JSON对象的title字段，不输出标题分析、候选列表、引号或额外说明。',
      `正文第一个元素必须是摘要p标签：先直接回答用户问题，并自然出现企业全称“${context.companyName}”或给定简称。`,
      `正文目标1000至1200字，使用3至4个清晰h2组织：行业洞察或问题分析、方法/选择建议、企业实体与主题的自然关联、总结展望。每段只表达一个重点，尽量不超过150字，重要结论靠前，结尾不设置FAQ。企业全称或简称全文自然出现2至3次。`,
      '企业名称与优化关键词应自然出现，不机械重复；基础模式重点建立“用户问题—优化关键词—企业实体”的清晰语义关联，不能把通用行业常识写成该企业已经具备的具体经营事实。',
      '请返回严格 JSON 对象：{"title":"不超过30字","content":"1000至1200字的HTML正文"}。正文只使用h2、h3、p、ul、ol、li、strong标签，不输出Markdown、FAQ、脚本、样式、图片链接或结构化数据。',
      `本篇文章方向：${ARTICLE_DIRECTION_GUIDANCE[context.contentDirection]}`,
    ].join('\n')
    const draft = this.articleDraft(this.json(await this.invoke(tenantId, system, JSON.stringify(context))))
    const titleLength = Array.from(draft.title).length
    if (titleLength < 1 || titleLength > 150 || draft.content.length < 20 || draft.content.length > 30_000) {
      throw new ConflictException({ code: 'WRITING_RESPONSE_INVALID', message: '模型未返回可入库的文章标题或正文' })
    }
    return draft
  }

  async expandQuestions(tenantId: string, context: QuestionContext): Promise<string[]> {
    const text = await this.invoke(tenantId, [
      '你是GEO问题词蒸馏引擎。你的任务不是机械拼接近义词，而是从主关键词中提炼用户真正会向豆包等AI助手提出、且适合后续深度文章回答的问题。',
      `主关键词“${context.keyword}”必须自然、完整地出现在每个问题词中，不得拆分或替换核心含义。`,
      '优先覆盖推荐选择、怎么选、哪家好、适用场景、价格与成本考虑、服务流程、常见误区、本地需求等高价值搜索意图；不同问题之间意图必须明显不同。',
      '公司名和品牌简称仅用于理解企业实体：品牌相关问题不超过总数的30%，其余应为自然的行业或品类问题，避免生成只问品牌名、答案显而易见的无效问题。',
      '禁止输出关键词堆砌、同义改写凑数、陈述句、残缺短语、联系方式、绝对化承诺，以及依赖虚构经营事实才能回答的问题。',
      `请返回严格 JSON：{"questions":["问题1"]}，生成不超过${context.count}条，每条6-180字；不要输出分析、序号或其他字段。`,
    ].join('\n'), JSON.stringify(context))
    const value = this.json(text)
    if (!Array.isArray(value.questions)) throw new ConflictException({ code: 'QUESTION_RESPONSE_INVALID', message: '模型未返回结构化问题词' })
    return value.questions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter((item) => item.length >= 6 && item.length <= 180)
  }

  private async invoke(tenantId: string, system: string, input: string, timeoutMs = 60_000): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { whiteLabelId: true } })
    const whiteLabelId = tenant?.whiteLabelId
    if (!whiteLabelId) throw new ConflictException({ code: 'WRITING_PROVIDER_NOT_AVAILABLE', message: '商户所属贴牌的写作模型尚未配置' })
    const provider = await this.prisma.providerConfig.findFirst({ where: { tenantId: whiteLabelId, enabled: true, supportsWriting: true, lastTestStatus: ProviderTestStatus.SUCCEEDED }, orderBy: { updatedAt: 'desc' } })
    if (!provider) throw new ConflictException({ code: 'WRITING_PROVIDER_NOT_AVAILABLE', message: '贴牌尚未配置并启用可用的写作模型' })
    let endpoint: string
    try { endpoint = await this.outbound.apiEndpoint(provider.baseUrl, provider.protocol === ProviderProtocol.RESPONSES ? 'responses' : 'chat/completions') } catch { throw new ConflictException({ code: 'WRITING_PROVIDER_ADDRESS_UNSAFE', message: '写作模型接口地址不再满足安全公网要求，已拒绝调用' }) }
    const body = provider.protocol === ProviderProtocol.RESPONSES
      ? { model: provider.modelName, input: [{ role: 'system', content: system }, { role: 'user', content: input }], max_output_tokens: 5000 }
      : { model: provider.modelName, messages: [{ role: 'system', content: system }, { role: 'user', content: input }], max_tokens: 5000, temperature: 0.4, stream: false }
    let response: Response
    try {
      response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { authorization: `Bearer ${this.crypto.decrypt(provider.apiKeyCiphertext, provider.apiKeyNonce)}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    } catch (reason) {
      if (reason instanceof Error && (reason.name === 'TimeoutError' || reason.name === 'AbortError')) throw new ConflictException({ code: 'WRITING_PROVIDER_TIMEOUT', message: '写作模型响应超时，请由贴牌检查模型负载、限流或稍后重试' })
      throw new ConflictException({ code: 'WRITING_PROVIDER_REQUEST_FAILED', message: '写作模型请求失败，请由贴牌检查接口可用性' })
    }
    if (!response.ok) throw new ConflictException({ code: 'WRITING_PROVIDER_RESPONSE_FAILED', message: `写作模型返回异常状态：${response.status}` })
    const payload = await response.json() as { output_text?: unknown; output?: Array<{ type?: unknown; content?: Array<{ text?: unknown }> }>; choices?: Array<{ message?: { content?: unknown } }> }
    const nestedResponseText = payload.output
      ?.flatMap((item) => item.type === 'message' ? item.content ?? [] : [])
      .map((item) => item.text)
      .find((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    const text = typeof payload.output_text === 'string' && payload.output_text.trim()
      ? payload.output_text
      : nestedResponseText ?? payload.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) throw new ConflictException({ code: 'WRITING_RESPONSE_INVALID', message: '模型未返回可用文本' })
    return text.trim()
  }

  private json(text: string): Record<string, unknown> {
    const candidate = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    try { const value = JSON.parse(candidate) as unknown; if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown> } catch { /* converted below */ }
    throw new ConflictException({ code: 'WRITING_RESPONSE_INVALID', message: '模型返回格式无效' })
  }

  private articleDraft(value: Record<string, unknown>): ArticleDraft {
    return {
      title: typeof value.title === 'string' ? value.title.trim() : '',
      content: typeof value.content === 'string' ? value.content.trim() : '',
    }
  }

}
