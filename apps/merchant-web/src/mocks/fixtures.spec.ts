import { describe, expect, it } from 'vitest'

import {
  createMockKeyword,
  createMockArticle,
  createMockArticles,
  createMockKnowledgeLibrary,
  createMockQuestion,
  deleteMockArticle,
  expandMockQuestions,
  getMockProfile,
  listMockQuestions,
  listMockArticles,
  mockDashboard,
  updateMockProfile,
} from './fixtures'

describe('merchant mock domain rules', () => {
  it('保存企业资料会产生新版本，而不是改写版本号', () => {
    const current = getMockProfile()
    const updated = updateMockProfile({
      companyName: current.companyName,
      aliases: current.aliases,
      industry: current.industry,
      coreBusiness: current.coreBusiness,
      serviceAreas: current.serviceAreas,
      introduction: current.introduction,
      advantages: current.advantages,
      products: current.products,
      address: current.address,
      phone: current.phone,
      wechat: current.wechat,
      businessHours: current.businessHours,
      credentials: current.credentials,
      cases: current.cases,
      proofMaterials: current.proofMaterials,
    })

    expect(updated.version).toBe(current.version + 1)
  })

  it('关键词和同关键词下的问题词按照规范化文本去重', () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const keyword = createMockKeyword(`企业获客测试 ${suffix}`)

    expect(keyword).toBeDefined()
    if (!keyword) return

    expect(createMockKeyword(` 企业 获客测试 ${suffix} `)).toBeUndefined()
    expect(createMockQuestion(keyword.id, '企业内容如何提升获客效果？')).not.toBe('duplicate')
    expect(createMockQuestion(keyword.id, '企业内容 如何提升获客效果？')).toBe('duplicate')
  })

  it('本地 Mock 拓展只返回结构化结果与说明，不声明真实模型扣点', () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const keyword = createMockKeyword(`本地拓展验证 ${suffix}`)

    expect(keyword).toBeDefined()
    if (!keyword) return

    const result = expandMockQuestions(keyword.id, 3)
    expect(result?.createdCount).toBe(3)
    expect(result?.mockNotice).toContain('未调用 DeepSeek')
    expect(listMockQuestions(keyword.id)).toHaveLength(3)
  })

  it('企业信息库保存结构化企业资料', () => {
    const library = createMockKnowledgeLibrary({
      name: `可信素材 ${Date.now()}`,
      companyName: '测试企业有限公司',
      brandAlias: '测试品牌',
      productServices: '提供企业内容策划与网站建设服务。',
      productFeatures: '',
      brandStory: '',
      userPainPoints: '',
      trustProof: '拥有可复核的服务流程和交付材料。',
      customerCases: '',
      otherInfo: '',
    })

    expect(library.companyName).toBe('测试企业有限公司')
    expect(library.trustProof).toContain('可复核')
  })

  it('批量文章 Mock 最多可生成 100 篇，且不扣算力或写作额度', () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const keyword = createMockKeyword(`文章创作验证 ${suffix}`)
    expect(keyword).toBeDefined()
    if (!keyword) return

    Array.from({ length: 100 }, (_, index) =>
      createMockQuestion(keyword.id, `文章创作验证问题 ${index + 1}：如何保证企业内容事实一致？`),
    )

    const computeBefore = mockDashboard.resources.computePoints.available
    const writingBefore = mockDashboard.resources.writing.used
    const totalBefore = listMockArticles().length
    const result = createMockArticles({
      keywordId: keyword.id,
      knowledgeLibraryIds: [],
      galleryId: 'gallery-1',
      imageCount: 1,
      instructionId: 'instruction-system-default',
      contentDirection: 'mixed',
      count: 100,
    })

    expect(result?.createdCount).toBe(100)
    expect(result?.mockNotice).toContain('未调用 DeepSeek')
    expect(mockDashboard.resources.computePoints.available).toBe(computeBefore)
    expect(mockDashboard.resources.writing.used).toBe(writingBefore)
    expect(listMockArticles()).toHaveLength(totalBefore + 100)
    expect(createMockArticles({
      keywordId: keyword.id,
      knowledgeLibraryIds: [],
      galleryId: 'gallery-1',
      imageCount: 1,
      instructionId: 'instruction-system-default',
      contentDirection: 'mixed',
      count: 1,
    })).toBeUndefined()
    result?.articles.forEach((article) => expect(deleteMockArticle(article.id)).toBe(true))
  })

  it('手动新增和删除文章会同步文章总量', () => {
    const before = mockDashboard.resources.articleCount
    const article = createMockArticle({
      title: `手动文章 ${Date.now()}`,
      content: '这是用于验证文章列表手动新增和删除同步逻辑的已核验测试正文，长度满足最小限制。',
      status: 'draft',
      galleryId: null,
      galleryImageIds: [],
    })

    expect(mockDashboard.resources.articleCount).toBe(before + 1)
    expect(deleteMockArticle(article.id)).toBe(true)
    expect(mockDashboard.resources.articleCount).toBe(before)
  })

  it('只有关键词时也能生成无图基础模式草稿', () => {
    const suffix = `${Date.now()}-${Math.random()}`
    const keyword = createMockKeyword(`基础模式验证 ${suffix}`)
    expect(keyword).toBeDefined()
    if (!keyword) return
    createMockQuestion(keyword.id, '只有公司名和关键词时如何正常生成文章？')

    const result = createMockArticles({
      keywordId: keyword.id, knowledgeLibraryIds: [], galleryId: null, imageCount: 0, instructionId: null, contentDirection: 'marketing', count: 1,
    })

    expect(result?.createdCount).toBe(1)
    expect(result?.articles[0]).toMatchObject({ knowledgeLibraryIds: [], galleryId: null, imageCount: 0 })
    expect(result?.articles[0]?.content).toContain('基础写作模式')
    result?.articles.forEach((article) => expect(deleteMockArticle(article.id)).toBe(true))
  })
})
