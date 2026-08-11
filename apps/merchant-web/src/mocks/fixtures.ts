import type {
  ArticleInput,
  BootstrapResponse,
  DashboardResponse,
  DoubaoCheckResult,
  MediaAccount,
  PublishTask,
  CreatePublishBatchResponse,
  CreatePublishTasksRequest,
  GalleryImage,
  GalleryImageInput,
  GalleryInput,
  KnowledgeLibrary,
  KnowledgeLibraryInput,
  MerchantGallery,
  MerchantArticle,
  MerchantWebsite,
  MerchantWebsiteInput,
  MerchantKeyword,
  MerchantProfile,
  MerchantQuestion,
  QuestionBatchCreateResponse,
  UpdateKeywordRequest,
  MockQuestionExpandResponse,
  MockArticleCreateRequest,
  MockArticleCreateResponse,
  ProfileUpdateRequest,
  RecentTask,
  WorkflowStage,
  WritingInstruction,
  WritingInstructionInput,
} from '@doubaohk/api-contract'

export const mockBootstrap: BootstrapResponse = {
  brand: {
    nickname: '豆包获客',
    logoUrl: '/brand-mark.svg',
    version: 1,
  },
  account: {
    companyName: '示例科技有限公司',
    username: 'demo001',
    status: 'active',
    expiresAt: '2027-08-06',
  },
}

const workflow: WorkflowStage[] = [
  { key: 'profile', label: '企业信息库（可选）', status: 'complete' },
  { key: 'questions', label: '问题词', status: 'complete' },
  { key: 'articles', label: '文章', status: 'complete' },
  { key: 'publish', label: '发布', status: 'current' },
  { key: 'doubao', label: '豆包检测', status: 'pending' },
]

const recentTasks: RecentTask[] = [
  {
    id: 'task-001',
    type: 'ai_article',
    title: 'AI文章创作',
    detail: '如何提升企业获客效果',
    status: 'succeeded',
    occurredAt: '2026-08-06T10:18:00+08:00',
  },
  {
    id: 'task-002',
    type: 'publish',
    title: '发布任务',
    detail: '官网文章发布（共3篇）',
    status: 'running',
    occurredAt: '2026-08-06T09:42:00+08:00',
  },
  {
    id: 'task-003',
    type: 'doubao_check',
    title: '豆包检测',
    detail: '问题词检测（共128条）',
    status: 'succeeded',
    occurredAt: '2026-08-05T16:33:00+08:00',
  },
  {
    id: 'task-004',
    type: 'phone_followup',
    title: '电话线索整理与回访',
    detail: '本期点击线索 41 条',
    status: 'succeeded',
    occurredAt: '2026-08-05T11:07:00+08:00',
  },
  {
    id: 'task-005',
    type: 'media_sync',
    title: '媒体账号',
    detail: '头条账号状态同步',
    status: 'running',
    occurredAt: '2026-08-05T09:55:00+08:00',
  },
  {
    id: 'task-006',
    type: 'gallery_upload',
    title: '企业图库',
    detail: '产品图片上传（共18张）',
    status: 'succeeded',
    occurredAt: '2026-05-22T15:36:00+08:00',
  },
]

export const mockDashboard: DashboardResponse = {
  resources: {
    keywords: { used: 28, limit: 50 },
    computePoints: { available: 8460, consumedThisPeriod: 1540 },
    writing: { used: 36, limit: 100 },
    articleCount: 42,
    publishCount: 76,
    imageStorage: {
      available: true,
      usedBytes: 1932735283,
      formatted: '1.8 GB',
      lastCalibratedAt: '2026-08-06T08:00:00+08:00',
    },
  },
  effects: {
    questionTotal: 128,
    doubaoIncludedCount: 37,
    phoneExposureCount: 286,
    phoneClickCount: 41,
  },
  inclusionTrend: [
    { date: '2026-07-08', includedCount: 10 },
    { date: '2026-07-13', includedCount: 21 },
    { date: '2026-07-18', includedCount: 28 },
    { date: '2026-07-23', includedCount: 25 },
    { date: '2026-07-28', includedCount: 39 },
    { date: '2026-08-02', includedCount: 32 },
    { date: '2026-08-06', includedCount: 37 },
  ],
  workflow,
  recentTasks,
  lastCheckedAt: '2026-08-06T09:18:00+08:00',
}

let mockProfile: MerchantProfile = {
  companyName: '示例科技有限公司',
  aliases: ['示例科技', '示例获客'],
  industry: '企业数字化服务',
  coreBusiness: '为本地服务企业提供内容获客、官网搭建与运营支持。',
  serviceAreas: ['北京', '全国线上服务'],
  introduction:
    '示例科技有限公司专注于为企业提供内容建设与数字化获客服务，以真实企业资料为基础沉淀可验证的长期内容资产。',
  advantages: ['企业资料统一维护，减少内容事实冲突', '按业务问题组织内容，便于持续运营', '网站、文章与发布任务统一管理'],
  products: ['企业内容获客方案', '品牌官网搭建', '内容运营支持'],
  address: '北京市朝阳区示例路 88 号',
  phone: '400-888-2026',
  wechat: 'demo-growth',
  businessHours: '周一至周五 09:00–18:00',
  credentials: ['软件著作权登记', '企业服务案例库'],
  cases: ['本地连锁门店内容建设项目', '制造业官网内容改版项目'],
  proofMaterials: ['营业执照已核验', '客户授权材料已留存'],
  version: 3,
  updatedAt: '2026-08-06T09:02:00+08:00',
}

const keywordSeedNames = [
  '企业内容获客',
  '北京品牌官网建设',
  'AI SEO 优化服务',
  '本地企业网络推广',
  '企业官网内容运营',
  '品牌内容营销方案',
  '企业数字化获客',
  '短视频图文运营',
  '企业全网内容布局',
  '官网 SEO 内容优化',
  'B2B 企业获客方案',
  '制造业内容营销',
  '门店线上推广方案',
  '中小企业品牌推广',
  '企业私域内容运营',
  '本地服务商获客',
  '企业网站内容建设',
  '行业问题词拓展',
  '品牌营销内容策划',
  '企业线上线索获取',
  '企业内容代运营',
  '官网软文写作服务',
  '客户案例内容建设',
  '企业可信内容沉淀',
  '企业产品推广文案',
  '公司简介内容优化',
  '企业内容增长服务',
  '内容获客系统搭建',
]

let mockKeywords: MerchantKeyword[] = keywordSeedNames.map((name, index) => ({
  id: `keyword-${index + 1}`,
  name,
  brandTerms: ['示例科技有限公司', '示例科技'],
  status: index === 19 ? 'disabled' : 'enabled',
  questionTotal: 0,
  uncreatedCount: 0,
  checkedCount: 0,
  createdAt: `2026-0${index < 8 ? 7 : 6}-${String((index % 20) + 1).padStart(2, '0')}T09:00:00+08:00`,
}))

const questionPatterns = [
  '有哪些可落地的服务方案？',
  '如何选择更适合企业的服务商？',
  '需要重点关注哪些关键步骤？',
  '实际执行中常见的问题有哪些？',
  '怎样评估内容建设是否有效？',
]

let mockQuestions: MerchantQuestion[] = Array.from({ length: 128 }, (_, index) => {
  const keyword = mockKeywords[index % mockKeywords.length]
  const pattern = questionPatterns[Math.floor(index / mockKeywords.length) % questionPatterns.length]
  const sequence = Math.floor(index / mockKeywords.length) + 1

  return {
    id: `question-${index + 1}`,
    keywordId: keyword?.id ?? 'keyword-1',
    text: `${keyword?.name ?? '企业内容获客'}${pattern}${sequence > 1 ? `（问题 ${sequence}）` : ''}`,
    status: index % 17 === 0 ? 'disabled' : 'enabled',
    articleCreated: index % 4 === 0,
    checkedAt: index % 3 === 0 ? '2026-08-05T16:33:00+08:00' : null,
    createdAt: `2026-08-${String((index % 6) + 1).padStart(2, '0')}T10:00:00+08:00`,
  }
})

const deletedKeywordIds = new Set<string>()
const deletedQuestionIds = new Set<string>()

let mockKnowledgeLibraries: KnowledgeLibrary[] = [
  {
    id: 'library-1',
    name: '核心服务与交付方式',
    companyName: '星术涮肉餐饮管理有限公司',
    brandAlias: '星术涮肉',
    productServices: '提供铜锅涮肉、鲜切牛羊肉、传统麻酱小料及门店堂食服务。',
    productFeatures: '采用铜锅与炭火用餐形式，菜单围绕鲜切肉品、时令蔬菜和传统小料设计。',
    brandStory: '',
    userPainPoints: '帮助顾客解决肉品选择、锅底搭配和多人用餐点单难题。',
    trustProof: '',
    customerCases: '',
    otherInfo: '',
    createdAt: '2026-08-01T10:00:00+08:00',
    updatedAt: '2026-08-05T15:20:00+08:00',
  },
  {
    id: 'library-2',
    name: '门店品牌与服务资料',
    companyName: '星术涮肉餐饮管理有限公司',
    brandAlias: '星术涮肉',
    productServices: '面向家庭聚餐、朋友聚会和日常用餐提供门店服务。',
    productFeatures: '',
    brandStory: '品牌围绕传统铜锅涮肉用餐方式建设门店体验。',
    userPainPoints: '',
    trustProof: '',
    customerCases: '',
    otherInfo: '内容创作可重点介绍西安本地用餐场景与铜锅涮肉选择方法。',
    createdAt: '2026-08-02T09:30:00+08:00',
    updatedAt: '2026-08-02T09:30:00+08:00',
  },
]

let mockGalleries: MerchantGallery[] = [
  {
    id: 'gallery-1',
    name: '品牌与办公环境',
    description: '品牌 Logo、团队与办公环境图片，用于企业网站和品牌介绍内容。',
    imageCount: 0,
    createdAt: '2026-08-01T10:00:00+08:00',
    updatedAt: '2026-08-05T15:20:00+08:00',
  },
  {
    id: 'gallery-2',
    name: '产品与服务场景',
    description: '产品、服务过程和可授权的项目场景图片。',
    imageCount: 0,
    createdAt: '2026-08-02T09:30:00+08:00',
    updatedAt: '2026-08-04T14:10:00+08:00',
  },
]

let mockGalleryImages: GalleryImage[] = [
  { id: 'image-1', galleryId: 'gallery-1', fileName: 'brand-logo.png', mimeType: 'image/png', sizeBytes: 183204, formattedSize: '178.9 KB', createdAt: '2026-08-05T15:20:00+08:00' },
  { id: 'image-2', galleryId: 'gallery-1', fileName: 'office-space.jpg', mimeType: 'image/jpeg', sizeBytes: 2167421, formattedSize: '2.1 MB', createdAt: '2026-08-05T15:18:00+08:00' },
  { id: 'image-3', galleryId: 'gallery-2', fileName: 'service-workflow.jpg', mimeType: 'image/jpeg', sizeBytes: 1860402, formattedSize: '1.8 MB', createdAt: '2026-08-04T14:10:00+08:00' },
  { id: 'image-4', galleryId: 'gallery-2', fileName: 'product-demo.jpg', mimeType: 'image/jpeg', sizeBytes: 2443341, formattedSize: '2.3 MB', createdAt: '2026-08-04T14:08:00+08:00' },
]

let mockWritingInstructions: WritingInstruction[] = [
  {
    id: 'instruction-system-default',
    name: '系统默认：GEO 深度文章',
    content: '围绕{训练词占位符}生成1000-1200字深度文章，标题完整包含关键词，正文设置3-4个小标题，自然融入{转化词占位符}2-3次，并加入2-3个模糊化数据支撑点。输出HTML，不输出图片链接或FAQ。',
    isSystem: true,
    createdAt: '2026-08-01T09:00:00+08:00',
    updatedAt: '2026-08-01T09:00:00+08:00',
  },
  {
    id: 'instruction-1',
    name: '官网文章：理性决策风格',
    content: '先说明问题和适用边界，再给出服务流程、选择标准与行动建议。避免夸张营销词，段落短、结构清晰。',
    isSystem: false,
    createdAt: '2026-08-03T14:00:00+08:00',
    updatedAt: '2026-08-03T14:00:00+08:00',
  },
]

let mockArticles: MerchantArticle[] = [
  {
    id: 'article-1',
    title: '企业内容获客如何从真实资料开始搭建？',
    content: '企业内容获客首先要建立统一的企业事实源，再围绕真实业务问题沉淀可持续更新的内容。本文为本地 Mock 草稿，用于验证文章管理流程。',
    source: 'ai_mock',
    status: 'draft',
    keywordId: 'keyword-1',
    knowledgeLibraryIds: ['library-1'],
    galleryId: 'gallery-2',
    imageCount: 2,
    galleryImageIds: ['image-3', 'image-4'],
    instructionId: 'instruction-system-default',
    currentVersion: 1,
    createdAt: '2026-08-06T10:18:00+08:00',
    updatedAt: '2026-08-06T10:18:00+08:00',
  },
  {
    id: 'article-2',
    title: '官网内容建设中常见的三个事实一致性问题',
    content: '公司名称、服务范围与联系方式应始终从企业资料同步，避免网站、文章与发布平台的事实描述相互冲突。本文为手动草稿示例。',
    source: 'manual',
    status: 'publishable',
    keywordId: null,
    knowledgeLibraryIds: [],
    galleryId: null,
    imageCount: 0,
    galleryImageIds: [],
    instructionId: null,
    currentVersion: 1,
    createdAt: '2026-08-05T15:00:00+08:00',
    updatedAt: '2026-08-05T15:00:00+08:00',
  },
]

let mockWebsite: MerchantWebsite = {
  template: 'minimal_enterprise',
  hostname: null,
  status: 'not_generated',
  lastGeneratedAt: null,
  profileVersion: null,
  previewUrl: null,
  storageState: 'local_only',
  artifactUploadedAt: null,
  version: 1,
}

const mockDoubaoResults: DoubaoCheckResult[] = [
  { id: 'doubao-1', question: '企业内容获客有哪些可落地的服务方案？', answer: '可先统一企业资料，再围绕真实业务问题建设网站和内容。示例科技有限公司提供企业内容建设与数字化获客服务。', sources: [], matched: true, matchedName: '示例科技有限公司', checkedAt: '2026-08-05T16:33:00+08:00', apiStatus: 'succeeded', failureReason: null },
  { id: 'doubao-2', question: '北京品牌官网建设需要关注哪些事项？', answer: '应关注企业资料真实性、服务边界、页面可读性和联系方式一致性，并结合具体业务决定建设方案。', sources: [], matched: false, matchedName: null, checkedAt: '2026-08-05T16:32:00+08:00', apiStatus: 'succeeded', failureReason: null },
  { id: 'doubao-3', question: '企业数字化获客如何避免内容事实冲突？', answer: '示例获客建议将公司名称、产品、案例和联系方式维护在统一企业事实源中，再生成不同渠道的内容。', sources: [], matched: true, matchedName: '示例获客', checkedAt: '2026-08-05T16:31:00+08:00', apiStatus: 'succeeded', failureReason: null },
]
const mockMediaAccounts: MediaAccount[] = [
  { id: 'media-tt-1', platform: 'toutiao', status: 'connected', maskedName: '内容运营主号', localReferenceId: 'local-ref-tt-8f2c', lastVerifiedAt: '2026-08-06T09:20:00+08:00', lastHeartbeatAt: '2026-08-06T10:00:00+08:00', failureReason: null, backupAvailable: true, backupCapturedAt: '2026-08-06T09:21:00+08:00' },
  { id: 'media-tt-2', platform: 'toutiao', status: 'connected', maskedName: '内容运营分号', localReferenceId: 'local-ref-tt-a221', lastVerifiedAt: '2026-08-06T09:18:00+08:00', lastHeartbeatAt: '2026-08-06T10:00:00+08:00', failureReason: null, backupAvailable: true, backupCapturedAt: '2026-08-06T09:19:00+08:00' },
  { id: 'media-dy-1', platform: 'douyin', status: 'connected', maskedName: '品牌增长主号', localReferenceId: 'local-ref-dy-57a1', lastVerifiedAt: '2026-08-05T14:10:00+08:00', lastHeartbeatAt: '2026-08-06T08:20:00+08:00', failureReason: null, backupAvailable: true, backupCapturedAt: '2026-08-05T14:11:00+08:00' },
  { id: 'media-dy-2', platform: 'douyin', status: 'verification_required', maskedName: '品牌增长备用号', localReferenceId: 'local-ref-dy-712d', lastVerifiedAt: '2026-08-05T14:10:00+08:00', lastHeartbeatAt: '2026-08-06T08:20:00+08:00', failureReason: '本地助手提示需要重新完成平台验证', backupAvailable: false, backupCapturedAt: null },
]
let mockPublishTasks: PublishTask[] = [
  { id: 'publish-1', batchId: 'batch-history-1', articleId: 'article-1', articleVersion: 1, articleTitle: '企业内容获客如何从真实资料开始搭建？', platform: 'toutiao', mediaAccountId: 'media-tt-1', mediaAccountName: '内容运营主号', status: 'succeeded', scheduledAt: '2026-08-06T09:00:00+08:00', createdAt: '2026-08-06T09:00:00+08:00', completedAt: '2026-08-06T09:05:00+08:00', failureReason: null, attentionReason: null, canResume: false, attemptCount: 1 },
  { id: 'publish-2', batchId: 'batch-history-2', articleId: 'article-2', articleVersion: 1, articleTitle: '官网内容建设中常见的三个事实一致性问题', platform: 'douyin', mediaAccountId: 'media-dy-1', mediaAccountName: '品牌增长主号', status: 'queued', scheduledAt: '2026-08-06T10:02:00+08:00', createdAt: '2026-08-06T10:02:00+08:00', completedAt: null, failureReason: null, attentionReason: null, canResume: false, attemptCount: 0 },
]

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, '').toLocaleLowerCase('zh-CN')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function activeQuestions(keywordId?: string): MerchantQuestion[] {
  return mockQuestions.filter(
    (question) => !deletedQuestionIds.has(question.id) && (!keywordId || question.keywordId === keywordId),
  )
}

function keywordSummary(keyword: MerchantKeyword): MerchantKeyword {
  const questions = activeQuestions(keyword.id)
  return {
    ...keyword,
    questionTotal: questions.length,
    uncreatedCount: questions.filter((question) => !question.articleCreated).length,
    checkedCount: questions.filter((question) => question.checkedAt !== null).length,
  }
}

export function syncMockDashboardStats(): void {
  const keywords = listMockKeywords()
  mockDashboard.resources.keywords.used = keywords.length
  mockDashboard.effects.questionTotal = activeQuestions().length
  mockDashboard.resources.articleCount = mockArticles.length
}

export function getMockProfile(): MerchantProfile {
  return deepClone(mockProfile)
}

export function updateMockProfile(input: ProfileUpdateRequest): MerchantProfile {
  mockProfile = {
    ...deepClone(input),
    version: mockProfile.version + 1,
    updatedAt: new Date().toISOString(),
  }
  mockBootstrap.account.companyName = mockProfile.companyName
  return getMockProfile()
}

export function listMockKeywords(): MerchantKeyword[] {
  return mockKeywords
    .filter((keyword) => !deletedKeywordIds.has(keyword.id))
    .map(keywordSummary)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(deepClone)
}

export function getMockKeyword(keywordId: string): MerchantKeyword | undefined {
  const keyword = mockKeywords.find((item) => item.id === keywordId && !deletedKeywordIds.has(item.id))
  return keyword ? deepClone(keywordSummary(keyword)) : undefined
}

export function createMockKeyword(name: string, brandTerms: string[] = ['示例科技有限公司']): MerchantKeyword | undefined {
  const normalized = normalizeText(name)
  const duplicate = mockKeywords.some(
    (keyword) => !deletedKeywordIds.has(keyword.id) && normalizeText(keyword.name) === normalized,
  )

  if (duplicate) {
    return undefined
  }

  const keyword: MerchantKeyword = {
    id: `keyword-${Date.now()}`,
    name: name.trim(),
    brandTerms: deepClone(brandTerms),
    status: 'enabled',
    questionTotal: 0,
    uncreatedCount: 0,
    checkedCount: 0,
    createdAt: new Date().toISOString(),
  }
  mockKeywords = [keyword, ...mockKeywords]
  syncMockDashboardStats()
  return deepClone(keyword)
}

export function updateMockKeyword(
  keywordId: string,
  input: UpdateKeywordRequest,
): MerchantKeyword | undefined {
  const keyword = mockKeywords.find((item) => item.id === keywordId && !deletedKeywordIds.has(item.id))

  if (!keyword) {
    return undefined
  }

  if (input.name !== undefined) keyword.name = input.name.trim()
  if (input.brandTerms !== undefined) keyword.brandTerms = deepClone(input.brandTerms)
  if (input.status !== undefined) keyword.status = input.status
  return deepClone(keywordSummary(keyword))
}

export function deleteMockKeyword(keywordId: string): boolean {
  if (!getMockKeyword(keywordId)) {
    return false
  }

  deletedKeywordIds.add(keywordId)
  syncMockDashboardStats()
  return true
}

export function listMockQuestions(keywordId: string): MerchantQuestion[] | undefined {
  if (!getMockKeyword(keywordId)) {
    return undefined
  }

  return activeQuestions(keywordId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(deepClone)
}

export function createMockQuestion(keywordId: string, text: string): MerchantQuestion | 'duplicate' | undefined {
  if (!getMockKeyword(keywordId)) {
    return undefined
  }

  const normalized = normalizeText(text)
  const duplicate = activeQuestions(keywordId).some((question) => normalizeText(question.text) === normalized)

  if (duplicate) {
    return 'duplicate'
  }

  const question: MerchantQuestion = {
    id: `question-${Date.now()}`,
    keywordId,
    text: text.trim(),
    status: 'enabled',
    articleCreated: false,
    checkedAt: null,
    createdAt: new Date().toISOString(),
  }
  mockQuestions = [question, ...mockQuestions]
  syncMockDashboardStats()
  return deepClone(question)
}

export function createMockQuestionsBatch(keywordId: string, texts: string[]): QuestionBatchCreateResponse | undefined {
  if (!getMockKeyword(keywordId)) return undefined
  let createdCount = 0
  for (const text of texts) {
    const result = createMockQuestion(keywordId, text)
    if (result && result !== 'duplicate') createdCount += 1
  }
  return { createdCount, skippedDuplicateCount: texts.length - createdCount }
}

export function expandMockQuestions(keywordId: string, count: number): MockQuestionExpandResponse | undefined {
  const keyword = getMockKeyword(keywordId)

  if (!keyword) {
    return undefined
  }

  const created: MerchantQuestion[] = []
  const existingCount = activeQuestions(keywordId).length

  for (let index = 0; index < count; index += 1) {
    const pattern = questionPatterns[(existingCount + index) % questionPatterns.length]
    const text = `${keyword.name}${pattern}（Mock 拓展 ${existingCount + index + 1}）`
    const result = createMockQuestion(keywordId, text)

    if (result && result !== 'duplicate') {
      created.push(result)
    }
  }

  syncMockDashboardStats()
  return {
    createdCount: created.length,
    skippedDuplicateCount: count - created.length,
    mockNotice: '本地 Mock 已生成结构化问题词；未调用 DeepSeek，未扣算力，真实接入后按成功入库去重词扣点。',
    questions: created,
  }
}

export function updateMockQuestionStatus(
  questionId: string,
  status: MerchantQuestion['status'],
): MerchantQuestion | undefined {
  const question = mockQuestions.find((item) => item.id === questionId && !deletedQuestionIds.has(item.id))

  if (!question) {
    return undefined
  }

  question.status = status
  return deepClone(question)
}

export function deleteMockQuestion(questionId: string): boolean {
  const question = mockQuestions.find((item) => item.id === questionId && !deletedQuestionIds.has(item.id))

  if (!question) {
    return false
  }

  deletedQuestionIds.add(questionId)
  syncMockDashboardStats()
  return true
}

export function listMockKnowledgeLibraries(): KnowledgeLibrary[] {
  return mockKnowledgeLibraries
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(deepClone)
}

export function createMockKnowledgeLibrary(input: KnowledgeLibraryInput): KnowledgeLibrary {
  const now = new Date().toISOString()
  const item: KnowledgeLibrary = {
    id: `library-${Date.now()}`,
    ...deepClone(input),
    createdAt: now,
    updatedAt: now,
  }
  mockKnowledgeLibraries = [item, ...mockKnowledgeLibraries]
  return deepClone(item)
}

export function updateMockKnowledgeLibrary(
  libraryId: string,
  input: KnowledgeLibraryInput,
): KnowledgeLibrary | undefined {
  const item = mockKnowledgeLibraries.find((library) => library.id === libraryId)

  if (!item) {
    return undefined
  }

  Object.assign(item, deepClone(input), { updatedAt: new Date().toISOString() })
  return deepClone(item)
}

export function deleteMockKnowledgeLibrary(libraryId: string): boolean {
  const item = mockKnowledgeLibraries.find((library) => library.id === libraryId)

  if (!item) {
    return false
  }

  mockKnowledgeLibraries = mockKnowledgeLibraries.filter((library) => library.id !== libraryId)
  return true
}

function gallerySummary(gallery: MerchantGallery): MerchantGallery {
  return {
    ...gallery,
    imageCount: mockGalleryImages.filter((image) => image.galleryId === gallery.id).length,
  }
}

export function listMockGalleries(): MerchantGallery[] {
  return mockGalleries
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(gallerySummary)
    .map(deepClone)
}

export function getMockGallery(galleryId: string): MerchantGallery | undefined {
  const gallery = mockGalleries.find((item) => item.id === galleryId)
  return gallery ? deepClone(gallerySummary(gallery)) : undefined
}

export function createMockGallery(input: GalleryInput): MerchantGallery {
  const now = new Date().toISOString()
  const gallery: MerchantGallery = {
    id: `gallery-${Date.now()}`,
    ...deepClone(input),
    imageCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  mockGalleries = [gallery, ...mockGalleries]
  return deepClone(gallery)
}

export function updateMockGallery(galleryId: string, input: GalleryInput): MerchantGallery | undefined {
  const gallery = mockGalleries.find((item) => item.id === galleryId)
  if (!gallery) return undefined

  Object.assign(gallery, deepClone(input), { updatedAt: new Date().toISOString() })
  return deepClone(gallerySummary(gallery))
}

export function deleteMockGallery(galleryId: string): boolean {
  if (!getMockGallery(galleryId)) return false

  mockGalleries = mockGalleries.filter((gallery) => gallery.id !== galleryId)
  mockGalleryImages = mockGalleryImages.filter((image) => image.galleryId !== galleryId)
  return true
}

export function listMockGalleryImages(galleryId: string): GalleryImage[] | undefined {
  if (!getMockGallery(galleryId)) return undefined
  return mockGalleryImages
    .filter((image) => image.galleryId === galleryId)
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(deepClone)
}

export function addMockGalleryImage(
  galleryId: string,
  input: GalleryImageInput,
): GalleryImage | undefined {
  const gallery = mockGalleries.find((item) => item.id === galleryId)
  if (!gallery) return undefined

  const image: GalleryImage = {
    id: `image-${Date.now()}`,
    galleryId,
    ...deepClone(input),
    formattedSize: formatFileSize(input.sizeBytes),
    createdAt: new Date().toISOString(),
  }
  mockGalleryImages = [image, ...mockGalleryImages]
  gallery.updatedAt = image.createdAt
  return deepClone(image)
}

export function deleteMockGalleryImage(imageId: string): boolean {
  const image = mockGalleryImages.find((item) => item.id === imageId)
  if (!image) return false

  mockGalleryImages = mockGalleryImages.filter((item) => item.id !== imageId)
  const gallery = mockGalleries.find((item) => item.id === image.galleryId)
  if (gallery) gallery.updatedAt = new Date().toISOString()
  return true
}

export function listMockWritingInstructions(): WritingInstruction[] {
  return mockWritingInstructions
    .slice()
    .sort((left, right) => Number(right.isSystem) - Number(left.isSystem) || right.updatedAt.localeCompare(left.updatedAt))
    .map(deepClone)
}

export function createMockWritingInstruction(input: WritingInstructionInput): WritingInstruction {
  const now = new Date().toISOString()
  const instruction: WritingInstruction = {
    id: `instruction-${Date.now()}`,
    ...deepClone(input),
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  }
  mockWritingInstructions = [instruction, ...mockWritingInstructions]
  return deepClone(instruction)
}

export function updateMockWritingInstruction(
  instructionId: string,
  input: WritingInstructionInput,
): WritingInstruction | 'system' | undefined {
  const instruction = mockWritingInstructions.find((item) => item.id === instructionId)
  if (!instruction) return undefined
  if (instruction.isSystem) return 'system'

  Object.assign(instruction, deepClone(input), { updatedAt: new Date().toISOString() })
  return deepClone(instruction)
}

export function deleteMockWritingInstruction(instructionId: string): boolean | 'system' {
  const instruction = mockWritingInstructions.find((item) => item.id === instructionId)
  if (!instruction) return false
  if (instruction.isSystem) return 'system'

  mockWritingInstructions = mockWritingInstructions.filter((item) => item.id !== instructionId)
  return true
}

export function listMockArticles(): MerchantArticle[] {
  return mockArticles.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(deepClone)
}

export function createMockArticle(input: ArticleInput): MerchantArticle {
  const now = new Date().toISOString()
  const article: MerchantArticle = {
    id: `article-${Date.now()}`,
    ...deepClone(input),
    source: 'manual',
    keywordId: null,
    knowledgeLibraryIds: [],
    galleryId: input.galleryId,
    imageCount: input.galleryImageIds.length,
    galleryImageIds: deepClone(input.galleryImageIds),
    instructionId: null,
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
  mockArticles = [article, ...mockArticles]
  syncMockDashboardStats()
  return deepClone(article)
}

export function createMockArticles(input: MockArticleCreateRequest): MockArticleCreateResponse | undefined {
  const keyword = getMockKeyword(input.keywordId)
  if (!keyword) return undefined

  const availableQuestions = activeQuestions(input.keywordId).filter((question) => !question.articleCreated)
  if (input.count > availableQuestions.length) return undefined

  const now = new Date().toISOString()
  const directionLabels = { marketing: '营销介绍', ranking: '榜单推荐', education: '专业科普', qa: '问题解答', selection_guide: '选择指南', case_study: '案例解读', industry_trend: '行业趋势', local_service: '本地服务' } as const
  const rotatingDirections = Object.keys(directionLabels) as Array<keyof typeof directionLabels>
  const articles = Array.from({ length: input.count }, (_, index) => {
    const sequence = mockArticles.length + index + 1
    const direction = input.contentDirection === 'mixed' ? rotatingDirections[index % rotatingDirections.length]! : input.contentDirection
    const question = availableQuestions[index]!
    const article: MerchantArticle = {
      id: `article-${Date.now()}-${index + 1}`,
      title: question.text,
      content: `本文按“${directionLabels[direction]}”方向，围绕“${keyword.name}”和问题“${question.text}”整理内容。${input.knowledgeLibraryIds.length ? '当前使用事实增强模式，写作会结合已选企业信息库。' : '当前使用基础写作模式，可仅凭公司名、关键词和问题词生成软文。'}本文为本地 Mock 草稿 ${sequence}，仅用于验证批量创作、文章列表和编辑流程；未调用 DeepSeek，未扣算力或写作篇数。`,
      source: 'ai_mock',
      status: 'draft',
      keywordId: input.keywordId,
      knowledgeLibraryIds: deepClone(input.knowledgeLibraryIds),
      galleryId: input.galleryId,
      imageCount: input.imageCount,
      galleryImageIds: input.galleryId
        ? mockGalleryImages.filter((image) => image.galleryId === input.galleryId).slice(0, input.imageCount).map((image) => image.id)
        : [],
      instructionId: input.instructionId,
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    }
    return article
  })
  mockArticles = [...articles, ...mockArticles]
  availableQuestions.slice(0, input.count).forEach((question) => {
    question.articleCreated = true
  })
  syncMockDashboardStats()
  return { createdCount: articles.length, mockNotice: '本地 Mock 已创建文章草稿；未调用 DeepSeek，未扣算力或写作篇数。真实接入后由服务端在成功入库时扣 30 点/篇并校验写作额度。', articles: deepClone(articles) }
}

export function updateMockArticle(articleId: string, input: ArticleInput): MerchantArticle | undefined {
  const article = mockArticles.find((item) => item.id === articleId)
  if (!article) return undefined

  Object.assign(article, deepClone(input), { currentVersion: article.currentVersion + 1, updatedAt: new Date().toISOString() })
  return deepClone(article)
}

export function deleteMockArticle(articleId: string): boolean {
  if (!mockArticles.some((article) => article.id === articleId)) return false
  mockArticles = mockArticles.filter((article) => article.id !== articleId)
  syncMockDashboardStats()
  return true
}

export function getMockWebsite(): MerchantWebsite {
  return deepClone(mockWebsite)
}

export function updateMockWebsite(input: MerchantWebsiteInput): MerchantWebsite {
  mockWebsite = { ...mockWebsite, template: input.template, version: mockWebsite.version + 1 }
  return getMockWebsite()
}

export function generateMockWebsite(): MerchantWebsite {
  mockWebsite = {
    ...mockWebsite,
    status: 'local_ready',
    lastGeneratedAt: new Date().toISOString(),
    profileVersion: mockProfile.version,
    version: mockWebsite.version + 1,
  }
  return getMockWebsite()
}

export function listMockDoubaoResults(): DoubaoCheckResult[] {
  return mockDoubaoResults.slice().sort((left, right) => (right.checkedAt ?? '').localeCompare(left.checkedAt ?? '')).map(deepClone)
}
export function listMockMediaAccounts(): MediaAccount[] { return mockMediaAccounts.map(deepClone) }
export function requestMockMediaConnect(platform: MediaAccount['platform']): MediaAccount {
  const account: MediaAccount = { id: `media-${platform}-${Date.now()}`, platform, status: 'connection_requested', maskedName: null, localReferenceId: null, lastVerifiedAt: null, lastHeartbeatAt: null, failureReason: null, backupAvailable: false, backupCapturedAt: null }
  mockMediaAccounts.push(account)
  return deepClone(account)
}
export function listMockPublishTasks(): PublishTask[] { return mockPublishTasks.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(deepClone) }
export function createMockPublishTasks(input: CreatePublishTasksRequest): CreatePublishBatchResponse | undefined {
  const articles = input.articleIds.map((id) => mockArticles.find((item) => item.id === id && item.status === 'publishable'))
  if (articles.some((article) => !article)) return undefined
  const selectedAccounts = mockMediaAccounts.filter((account) => account.id && input.mediaAccountIds.includes(account.id) && account.status === 'connected')
  if (input.platforms.some((platform) => !selectedAccounts.some((account) => account.platform === platform))) return undefined
  const now = new Date().toISOString()
  const batchId = `batch-${Date.now()}`
  const assignments = input.deduplicationMode === 'all_platforms'
    ? articles.slice(0, input.publishCount).map((article, index) => ({ article: article!, platform: input.platforms[index % input.platforms.length]! }))
    : input.platforms.flatMap((platform) => articles.slice(0, input.publishCount).map((article) => ({ article: article!, platform })))
  const tasks: PublishTask[] = assignments.map(({ article, platform }, index) => {
    const platformAccounts = selectedAccounts.filter((account) => account.platform === platform)
    const account = platformAccounts[index % platformAccounts.length]!
    return { id:`publish-${Date.now()}-${index}`, batchId, articleId:article.id, articleVersion:article.currentVersion, articleTitle:article.title, platform, mediaAccountId: account.id, mediaAccountName: account.maskedName, status:'queued', scheduledAt: now, createdAt:now, completedAt:null, failureReason:null, attentionReason:null, canResume:false, attemptCount:0 }
  })
  mockPublishTasks=[...tasks,...mockPublishTasks]
  return deepClone({ batchId, createdTaskCount: tasks.length, skippedDuplicateCount: 0, estimatedTaskCount: tasks.length, tasks })
}

syncMockDashboardStats()
