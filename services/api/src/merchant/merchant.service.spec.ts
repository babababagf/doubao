import { describe, expect, it } from 'vitest'

import { KeywordStatus } from '../generated/prisma/client'
import { MerchantService } from './merchant.service'

describe('MerchantService 关键词项目', () => {
  it('创建关键词时保存去重后的公司和品牌词', async () => {
    const created: Array<Record<string, unknown>> = []
    const prisma = {
      quotaBalance: { findUnique: async () => ({ keywordLimit: 50 }) },
      keyword: {
        count: async () => 0,
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data)
          return { id: 'keyword-1', ...data, status: KeywordStatus.ENABLED, createdAt: new Date('2026-08-11T00:00:00.000Z') }
        },
      },
      question: { count: async () => 0 },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    }
    const service = new MerchantService(prisma as never)

    await expect(service.createKeyword(
      { userId: 'user-1', tenantId: 'merchant-1', username: 'merchant1', role: 'MERCHANT', status: 'ACTIVE' },
      { name: '西安铜锅涮肉', brandTerms: ['星术涮肉', '星术', '星术涮肉'] },
    )).resolves.toEqual(expect.objectContaining({ name: '西安铜锅涮肉', brandTerms: ['星术涮肉', '星术'] }))
    expect(created[0]).toEqual(expect.objectContaining({ tenantId: 'merchant-1', normalizedName: '西安铜锅涮肉', brandTerms: ['星术涮肉', '星术'] }))
  })
})
