import { ConflictException, Injectable } from '@nestjs/common'

import { ProviderProtocol, ProviderTestStatus } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CredentialCryptoService } from '../security/credential-crypto.service'
import { OutboundUrlPolicyService } from '../security/outbound-url-policy.service'
import { doubaoCheckInput } from './doubao-check-prompt'
import { hasWebSearchCall, responseSources, responseText, type DoubaoSourceRef } from './doubao-response'

type ProviderSnapshot = { id: string; alias: string; modelName: string }
type ResponsePayload = { output_text?: unknown; output?: Array<{ type?: unknown; content?: Array<{ text?: unknown; annotations?: unknown }> }> }
type ProviderErrorPayload = { error?: { code?: unknown } }

@Injectable()
export class DoubaoProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly outbound: OutboundUrlPolicyService,
  ) {}

  async available(whiteLabelId: string): Promise<ProviderSnapshot> {
    const row = await this.prisma.providerConfig.findFirst({
      where: { tenantId: whiteLabelId, enabled: true, supportsDoubaoCheck: true, supportsWebSearch: true, protocol: ProviderProtocol.RESPONSES, lastTestStatus: ProviderTestStatus.SUCCEEDED },
      orderBy: { updatedAt: 'desc' },
    })
    if (!row) throw new ConflictException({ code: 'DOUBAO_PROVIDER_NOT_AVAILABLE', message: '请先由贴牌配置、测试并启用支持联网搜索的豆包检测模型' })
    return { id: row.id, alias: row.alias, modelName: row.modelName }
  }

  async search(whiteLabelId: string, providerId: string, question: string): Promise<{ answer: string; sources: DoubaoSourceRef[] }> {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId: whiteLabelId, enabled: true, supportsDoubaoCheck: true, supportsWebSearch: true, protocol: ProviderProtocol.RESPONSES, lastTestStatus: ProviderTestStatus.SUCCEEDED },
    })
    if (!provider) throw new ConflictException({ code: 'DOUBAO_PROVIDER_UNAVAILABLE', message: '检测任务使用的贴牌模型已停用、删除或未通过测试' })
    const input = doubaoCheckInput(question)
    let response: Response
    try {
      const endpoint = await this.outbound.apiEndpoint(provider.baseUrl, 'responses')
      response = await fetch(endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
        headers: { authorization: `Bearer ${this.crypto.decrypt(provider.apiKeyCiphertext, provider.apiKeyNonce)}`, 'content-type': 'application/json' },
        // 为避免推理模型在执行联网搜索前耗尽输出预算，使用标准 Responses 参数保留受控上限。
        body: JSON.stringify({ model: provider.modelName, input, tools: [{ type: 'web_search' }], store: false, max_output_tokens: 400 }),
      })
    } catch {
      throw new ConflictException({ code: 'DOUBAO_PROVIDER_REQUEST_FAILED', message: '豆包检测模型请求失败，请由贴牌检查模型、联网搜索服务和网络连接' })
    }
    if (!response.ok) {
      if (await this.isWebSearchToolNotOpen(response)) {
        throw new ConflictException({ code: 'DOUBAO_WEB_SEARCH_TOOL_NOT_OPEN', message: '贴牌豆包模型的联网搜索插件尚未开通，本次检测未计入收录结果' })
      }
      throw new ConflictException({ code: 'DOUBAO_PROVIDER_RESPONSE_FAILED', message: `豆包检测模型返回异常状态：${response.status}` })
    }
    const payload = await response.json() as ResponsePayload
    if (!hasWebSearchCall(payload)) {
      throw new ConflictException({ code: 'DOUBAO_WEB_SEARCH_NOT_USED', message: '豆包检测模型未实际执行联网搜索，本次结果未计入收录检测' })
    }
    const answer = responseText(payload)
    if (!answer) throw new ConflictException({ code: 'DOUBAO_RESPONSE_INVALID', message: '豆包检测模型未返回可用回答' })
    const sources = responseSources(payload)
    if (!sources.length) throw new ConflictException({ code: 'DOUBAO_RESPONSE_SOURCE_MISSING', message: '豆包检测模型未返回可核验来源，本次检测未计入收录结果' })
    return { answer: answer.slice(0, 30_000), sources }
  }

  private async isWebSearchToolNotOpen(response: Response): Promise<boolean> {
    try {
      const payload = await response.json() as ProviderErrorPayload
      return payload.error?.code === 'ToolNotOpen'
    } catch {
      return false
    }
  }
}
