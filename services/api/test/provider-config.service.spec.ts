import { describe, expect, it } from 'vitest'

import { ProviderConfigService } from '../src/tenancy/provider-config.service'

describe('ProviderConfigService', () => {
  it('启用配置时仅停用同贴牌且用途重叠的已启用配置', async () => {
    const updates: Array<{ where: unknown; data: unknown }> = []
    const auditRows: unknown[] = []
    const target = { id: 'target', tenantId: 'wl-1', alias: '新写作', enabled: false, lastTestStatus: 'SUCCEEDED', supportsWriting: true, supportsDoubaoCheck: false, platform: 'DEEPSEEK', protocol: 'CHAT_COMPLETIONS', baseUrl: 'https://api.deepseek.com', modelName: 'deepseek-chat', keyMask: 'abcd…wxyz', supportsWebSearch: false, lastTestAt: null, lastTestError: null }
    const prisma = {
      providerConfig: {
        findFirst: async () => target,
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
        providerConfig: {
          findMany: async () => [{ id: 'old-writing', alias: '旧写作' }],
          updateMany: async (input: { where: unknown; data: unknown }) => { updates.push(input); return { count: 1 } },
          update: async () => ({ ...target, enabled: true }),
        },
        auditLog: {
          createMany: async (input: { data: unknown }) => { auditRows.push(input.data); return { count: 1 } },
          create: async (input: { data: unknown }) => { auditRows.push(input.data); return { id: 'audit' } },
        },
      }),
    }
    const service = new ProviderConfigService(prisma as never, {} as never, { apiEndpoint: async () => 'https://api.deepseek.com/chat/completions' } as never)

    const result = await service.setEnabled({ userId: 'user-1', tenantId: 'wl-1', role: 'WHITE_LABEL_ADMIN' } as never, 'target', { enabled: true })

    expect(result).toMatchObject({ id: 'target', enabled: true })
    expect(updates).toEqual([{ where: { id: { in: ['old-writing'] } }, data: { enabled: false } }])
    expect(auditRows).toHaveLength(2)
  })
})
