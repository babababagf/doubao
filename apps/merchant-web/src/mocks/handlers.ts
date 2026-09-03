import type {
  ArticleInput,
  ArticleGroupInput,
  CreateKeywordRequest,
  CreateQuestionRequest,
  QuestionBatchCreateRequest,
  QuestionBatchDeleteRequest,
  GalleryImageInput,
  GalleryInput,
  KnowledgeLibraryInput,
  LoginRequest,
  MockQuestionExpandRequest,
  MockArticleCreateRequest,
  MerchantWebsiteInput,
  WebsiteAiProfileInput,
  CreatePublishTasksRequest,
  ProfileUpdateRequest,
  UpdateKeywordRequest,
  UpdateQuestionRequest,
  WritingInstructionInput,
} from '@doubaohk/api-contract'
import { delay, http, HttpResponse } from 'msw'

import {
  addMockGalleryImage,
  createMockArticle,
  createMockArticles,
  createMockKeyword,
  createMockKnowledgeLibrary,
  createMockQuestion,
  createMockQuestionsBatch,
  createMockGallery,
  createMockWritingInstruction,
  deleteMockGallery,
  deleteMockGalleryImage,
  deleteMockArticle,
  deleteMockKeyword,
  deleteMockKnowledgeLibrary,
  deleteMockQuestion,
  deleteMockQuestions,
  deleteMockWritingInstruction,
  expandMockQuestions,
  getMockProfile,
  getMockKeyword,
  getMockWebsite,
  generateMockWebsite,
  createMockWebsiteProfileDraft,
  listMockDoubaoResults,
  listMockMediaAccounts,
  listMockPublishTasks,
  listMockKeywords,
  listMockArticles,
  listMockArticleGroups,
  listMockGalleries,
  listMockGalleryImages,
  listMockKnowledgeLibraries,
  listMockQuestions,
  listMockWritingInstructions,
  mockBootstrap,
  mockDashboard,
  updateMockKeyword,
  updateMockArticle,
  updateMockArticleGroup,
  updateMockGallery,
  updateMockKnowledgeLibrary,
  updateMockProfile,
  updateMockQuestionStatus,
  updateMockWritingInstruction,
  updateMockWebsite,
  requestMockMediaConnect,
  createMockPublishTasks,
} from './fixtures'

export const MOCK_SESSION_ID = 'mock-session-admin'

function requestId(): string {
  return `mock-${crypto.randomUUID()}`
}

function unauthorized() {
  return HttpResponse.json(
    {
      code: 'AUTH_REQUIRED',
      message: '登录状态已失效，请重新登录',
      requestId: requestId(),
    },
    { status: 401 },
  )
}

function apiError(status: number, code: string, message: string) {
  return HttpResponse.json(
    {
      code,
      message,
      requestId: requestId(),
    },
    { status },
  )
}

function hasValidSession(request: Request): boolean {
  return request.headers.get('X-Mock-Session') === MOCK_SESSION_ID
}

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    await delay(380)
    const body = (await request.json()) as LoginRequest
    if (body.username !== 'admin' || body.password !== 'demo1234') {
      return HttpResponse.json(
        {
          code: 'INVALID_CREDENTIALS',
          message: '账号或密码错误',
          requestId: requestId(),
        },
        { status: 401 },
      )
    }

    return HttpResponse.json({
      sessionId: MOCK_SESSION_ID,
      expiresAt: '2026-08-06T23:59:59+08:00',
    })
  }),
  http.post('/api/auth/logout', async () => {
    await delay(120)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/merchant/bootstrap', async ({ request }) => {
    await delay(220)
    return hasValidSession(request) ? HttpResponse.json(mockBootstrap) : unauthorized()
  }),
  http.get('/api/merchant/dashboard', async ({ request }) => {
    await delay(520)
    return hasValidSession(request) ? HttpResponse.json(mockDashboard) : unauthorized()
  }),
  http.get('/api/merchant/profile', async ({ request }) => {
    await delay(180)
    return hasValidSession(request) ? HttpResponse.json(getMockProfile()) : unauthorized()
  }),
  http.put('/api/merchant/profile', async ({ request }) => {
    await delay(280)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const body = (await request.json()) as ProfileUpdateRequest
    if (!body.companyName?.trim()) {
      return apiError(422, 'PROFILE_COMPANY_NAME_REQUIRED', '请填写公司或门店全称')
    }

    return HttpResponse.json(updateMockProfile(body))
  }),
  http.get('/api/merchant/keywords', async ({ request }) => {
    await delay(180)
    return hasValidSession(request) ? HttpResponse.json(listMockKeywords()) : unauthorized()
  }),
  http.post('/api/merchant/keywords', async ({ request }) => {
    await delay(220)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const body = (await request.json()) as CreateKeywordRequest
    if (!body.name?.trim()) {
      return apiError(422, 'KEYWORD_NAME_REQUIRED', '请填写核心关键词')
    }

    if (!body.brandTerms?.length) return apiError(422, 'KEYWORD_BRAND_TERMS_REQUIRED', '请填写公司或品牌名')
    const keyword = createMockKeyword(body.name, body.brandTerms)
    return keyword
      ? HttpResponse.json(keyword, { status: 201 })
      : apiError(409, 'KEYWORD_DUPLICATE', '该核心关键词已存在')
  }),
  http.patch('/api/merchant/keywords/:keywordId', async ({ request, params }) => {
    await delay(160)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const body = (await request.json()) as UpdateKeywordRequest
    const keyword = updateMockKeyword(String(params.keywordId), body)
    return keyword ? HttpResponse.json(keyword) : apiError(404, 'KEYWORD_NOT_FOUND', '关键词不存在或已删除')
  }),
  http.delete('/api/merchant/keywords/:keywordId', async ({ request, params }) => {
    await delay(160)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    return deleteMockKeyword(String(params.keywordId))
      ? new HttpResponse(null, { status: 204 })
      : apiError(404, 'KEYWORD_NOT_FOUND', '关键词不存在或已删除')
  }),
  http.get('/api/merchant/keywords/:keywordId/questions', async ({ request, params }) => {
    await delay(170)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const questions = listMockQuestions(String(params.keywordId))
    return questions ? HttpResponse.json(questions) : apiError(404, 'KEYWORD_NOT_FOUND', '关键词不存在或已删除')
  }),
  http.post('/api/merchant/keywords/:keywordId/questions', async ({ request, params }) => {
    await delay(180)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const body = (await request.json()) as CreateQuestionRequest
    if (!body.text?.trim()) {
      return apiError(422, 'QUESTION_TEXT_REQUIRED', '请填写问题词')
    }

    const question = createMockQuestion(String(params.keywordId), body.text)
    if (question === 'duplicate') {
      return apiError(409, 'QUESTION_DUPLICATE', '同一关键词下已存在完全相同的问题词')
    }

    return question
      ? HttpResponse.json(question, { status: 201 })
      : apiError(404, 'KEYWORD_NOT_FOUND', '关键词不存在或已删除')
  }),
  http.post('/api/merchant/keywords/:keywordId/questions/batch', async ({ request, params }) => {
    await delay(220)
    if (!hasValidSession(request)) return unauthorized()
    const body = (await request.json()) as QuestionBatchCreateRequest
    if (!Array.isArray(body.texts) || body.texts.length < 1 || body.texts.length > 500) return apiError(422, 'QUESTION_BATCH_INPUT_INVALID', '批量问题词需为1至500条')
    const result = createMockQuestionsBatch(String(params.keywordId), body.texts)
    return result ? HttpResponse.json(result, { status: 201 }) : apiError(404, 'KEYWORD_NOT_FOUND', '关键词不存在或已删除')
  }),
  http.post('/api/merchant/keywords/:keywordId/questions/expand-mock', async ({ request, params }) => {
    await delay(420)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const body = (await request.json()) as MockQuestionExpandRequest
    if (!Number.isInteger(body.count) || body.count < 1 || body.count > 20) {
      return apiError(422, 'MOCK_EXPAND_COUNT_INVALID', '本地 Mock 单次可拓展 1 到 20 个问题词')
    }

    const result = expandMockQuestions(String(params.keywordId), body.count)
    return result
      ? HttpResponse.json(result)
      : apiError(404, 'KEYWORD_NOT_FOUND', '关键词不存在或已删除')
  }),
  http.patch('/api/merchant/questions/:questionId', async ({ request, params }) => {
    await delay(150)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const body = (await request.json()) as UpdateQuestionRequest
    const question = updateMockQuestionStatus(String(params.questionId), body.status)
    return question ? HttpResponse.json(question) : apiError(404, 'QUESTION_NOT_FOUND', '问题词不存在或已删除')
  }),
  http.delete('/api/merchant/questions/:questionId', async ({ request, params }) => {
    await delay(150)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    return deleteMockQuestion(String(params.questionId))
      ? new HttpResponse(null, { status: 204 })
      : apiError(404, 'QUESTION_NOT_FOUND', '问题词不存在或已删除')
  }),
  http.post('/api/merchant/questions/batch-delete', async ({ request }) => {
    await delay(180)
    if (!hasValidSession(request)) return unauthorized()
    const body = (await request.json()) as QuestionBatchDeleteRequest
    if (!Array.isArray(body.ids) || body.ids.length < 1 || body.ids.length > 500) return apiError(409, 'QUESTION_BATCH_DELETE_INPUT_INVALID', '批量删除需选择1至500条有效问题词')
    const deletedCount = deleteMockQuestions(body.ids)
    return deletedCount === null
      ? apiError(404, 'QUESTION_NOT_FOUND', '部分问题词不存在或无权访问')
      : HttpResponse.json({ deletedCount })
  }),
  http.get('/api/merchant/knowledge-libraries', async ({ request }) => {
    await delay(180)
    return hasValidSession(request) ? HttpResponse.json(listMockKnowledgeLibraries()) : unauthorized()
  }),
  http.post('/api/merchant/knowledge-libraries', async ({ request }) => {
    await delay(220)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const body = (await request.json()) as KnowledgeLibraryInput
    const hasContent = [body.productServices, body.productFeatures, body.brandStory, body.userPainPoints, body.trustProof, body.customerCases, body.otherInfo].some((value) => value?.trim())
    if (!body.name?.trim() || !body.companyName?.trim() || !body.brandAlias?.trim() || !hasContent) {
      return apiError(422, 'KNOWLEDGE_LIBRARY_REQUIRED', '请填写知识库名称、公司名称、品牌简称，并至少补充一项企业资料')
    }

    return HttpResponse.json(createMockKnowledgeLibrary(body), { status: 201 })
  }),
  http.put('/api/merchant/knowledge-libraries/:libraryId', async ({ request, params }) => {
    await delay(200)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    const body = (await request.json()) as KnowledgeLibraryInput
    const hasContent = [body.productServices, body.productFeatures, body.brandStory, body.userPainPoints, body.trustProof, body.customerCases, body.otherInfo].some((value) => value?.trim())
    if (!body.name?.trim() || !body.companyName?.trim() || !body.brandAlias?.trim() || !hasContent) {
      return apiError(422, 'KNOWLEDGE_LIBRARY_REQUIRED', '请填写知识库名称、公司名称、品牌简称，并至少补充一项企业资料')
    }
    const library = updateMockKnowledgeLibrary(String(params.libraryId), body)
    return library ? HttpResponse.json(library) : apiError(404, 'KNOWLEDGE_LIBRARY_NOT_FOUND', '信息库不存在或已删除')
  }),
  http.delete('/api/merchant/knowledge-libraries/:libraryId', async ({ request, params }) => {
    await delay(160)

    if (!hasValidSession(request)) {
      return unauthorized()
    }

    return deleteMockKnowledgeLibrary(String(params.libraryId))
      ? new HttpResponse(null, { status: 204 })
      : apiError(404, 'KNOWLEDGE_LIBRARY_NOT_FOUND', '信息库不存在或已删除')
  }),
  http.get('/api/merchant/galleries', async ({ request }) => {
    await delay(180)
    return hasValidSession(request) ? HttpResponse.json(listMockGalleries()) : unauthorized()
  }),
  http.post('/api/merchant/galleries', async ({ request }) => {
    await delay(220)
    if (!hasValidSession(request)) return unauthorized()

    const body = (await request.json()) as GalleryInput
    if (!body.name?.trim()) return apiError(422, 'GALLERY_NAME_REQUIRED', '请填写图库名称')
    return HttpResponse.json(createMockGallery(body), { status: 201 })
  }),
  http.put('/api/merchant/galleries/:galleryId', async ({ request, params }) => {
    await delay(180)
    if (!hasValidSession(request)) return unauthorized()

    const body = (await request.json()) as GalleryInput
    const gallery = updateMockGallery(String(params.galleryId), body)
    return gallery ? HttpResponse.json(gallery) : apiError(404, 'GALLERY_NOT_FOUND', '图库不存在或已删除')
  }),
  http.delete('/api/merchant/galleries/:galleryId', async ({ request, params }) => {
    await delay(160)
    if (!hasValidSession(request)) return unauthorized()

    return deleteMockGallery(String(params.galleryId))
      ? new HttpResponse(null, { status: 204 })
      : apiError(404, 'GALLERY_NOT_FOUND', '图库不存在或已删除')
  }),
  http.get('/api/merchant/galleries/:galleryId/images', async ({ request, params }) => {
    await delay(170)
    if (!hasValidSession(request)) return unauthorized()

    const images = listMockGalleryImages(String(params.galleryId))
    return images ? HttpResponse.json(images) : apiError(404, 'GALLERY_NOT_FOUND', '图库不存在或已删除')
  }),
  http.post('/api/merchant/galleries/:galleryId/images', async ({ request, params }) => {
    await delay(220)
    if (!hasValidSession(request)) return unauthorized()

    const body = (await request.json()) as GalleryImageInput
    if (!body.fileName?.trim()) return apiError(422, 'IMAGE_NAME_REQUIRED', '未识别到图片文件名')
    const image = addMockGalleryImage(String(params.galleryId), body)
    return image ? HttpResponse.json(image, { status: 201 }) : apiError(404, 'GALLERY_NOT_FOUND', '图库不存在或已删除')
  }),
  http.delete('/api/merchant/gallery-images/:imageId', async ({ request, params }) => {
    await delay(150)
    if (!hasValidSession(request)) return unauthorized()

    return deleteMockGalleryImage(String(params.imageId))
      ? new HttpResponse(null, { status: 204 })
      : apiError(404, 'GALLERY_IMAGE_NOT_FOUND', '图片不存在或已删除')
  }),
  http.get('/api/merchant/writing-instructions', async ({ request }) => {
    await delay(180)
    return hasValidSession(request) ? HttpResponse.json(listMockWritingInstructions()) : unauthorized()
  }),
  http.post('/api/merchant/writing-instructions', async ({ request }) => {
    await delay(220)
    if (!hasValidSession(request)) return unauthorized()

    const body = (await request.json()) as WritingInstructionInput
    if (!body.name?.trim() || !body.content?.trim()) return apiError(422, 'WRITING_INSTRUCTION_REQUIRED', '请填写指令名称和内容')
    return HttpResponse.json(createMockWritingInstruction(body), { status: 201 })
  }),
  http.put('/api/merchant/writing-instructions/:instructionId', async ({ request, params }) => {
    await delay(180)
    if (!hasValidSession(request)) return unauthorized()

    const body = (await request.json()) as WritingInstructionInput
    const instruction = updateMockWritingInstruction(String(params.instructionId), body)
    return instruction ? HttpResponse.json(instruction) : apiError(404, 'WRITING_INSTRUCTION_NOT_FOUND', '创作指令不存在或已删除')
  }),
  http.delete('/api/merchant/writing-instructions/:instructionId', async ({ request, params }) => {
    await delay(150)
    if (!hasValidSession(request)) return unauthorized()

    const result = deleteMockWritingInstruction(String(params.instructionId))
    if (result === 'system') return apiError(403, 'SYSTEM_INSTRUCTION_READ_ONLY', '系统默认指令不可删除')
    return result
      ? new HttpResponse(null, { status: 204 })
      : apiError(404, 'WRITING_INSTRUCTION_NOT_FOUND', '创作指令不存在或已删除')
  }),
  http.get('/api/merchant/article-groups', async ({ request }) => {
    await delay(180)
    return hasValidSession(request) ? HttpResponse.json(listMockArticleGroups()) : unauthorized()
  }),
  http.patch('/api/merchant/article-groups/:groupId', async ({ request, params }) => {
    await delay(180)
    if (!hasValidSession(request)) return unauthorized()
    const body = (await request.json()) as ArticleGroupInput
    if (!body.name?.trim()) return apiError(422, 'ARTICLE_GROUP_INPUT_INVALID', '请填写分组名称')
    const group = updateMockArticleGroup(String(params.groupId), body.name.trim())
    return group ? HttpResponse.json(group) : apiError(404, 'ARTICLE_GROUP_NOT_FOUND', '文章分组不存在')
  }),
  http.get('/api/merchant/articles', async ({ request }) => {
    await delay(200)
    const groupId = new URL(request.url).searchParams.get('groupId') ?? undefined
    return hasValidSession(request) ? HttpResponse.json(listMockArticles(groupId)) : unauthorized()
  }),
  http.post('/api/merchant/articles', async ({ request }) => {
    await delay(240)
    if (!hasValidSession(request)) return unauthorized()

    const body = (await request.json()) as ArticleInput
    if (!body.title?.trim() || !body.content?.trim()) {
      return apiError(422, 'ARTICLE_CONTENT_REQUIRED', '请填写文章标题和正文')
    }
    return HttpResponse.json(createMockArticle(body), { status: 201 })
  }),
  http.post('/api/merchant/articles/create-mock', async ({ request }) => {
    await delay(620)
    if (!hasValidSession(request)) return unauthorized()

    const body = (await request.json()) as MockArticleCreateRequest
    if (!body.keywordId || !Number.isInteger(body.count) || body.count < 1 || body.count > 100) {
      return apiError(422, 'MOCK_ARTICLE_INPUT_INVALID', '请选择关键词，创作篇数为 1 到 100')
    }
    if (!Number.isInteger(body.imageCount) || body.imageCount < 0 || body.imageCount > 3 || (!body.galleryId && body.imageCount !== 0)) {
      return apiError(422, 'MOCK_ARTICLE_IMAGE_COUNT_INVALID', '未选图库时配图必须为0，选择图库后可设置0到3张')
    }
    if (!['mixed', 'marketing', 'ranking', 'education', 'qa', 'selection_guide', 'case_study', 'industry_trend', 'local_service'].includes(body.contentDirection)) {
      return apiError(422, 'MOCK_ARTICLE_DIRECTION_INVALID', '请选择有效的文章方向')
    }
    const keyword = getMockKeyword(body.keywordId)
    if (!keyword) return apiError(404, 'KEYWORD_NOT_FOUND', '优化关键词不存在或已删除')
    if (body.customTitles && (body.customTitles.length > body.count || body.customTitles.some((title) => !title.trim() || Array.from(title.trim()).length > 30))) {
      return apiError(422, 'MOCK_ARTICLE_TITLE_INVALID', '自定义标题必须逐行填写、每条不超过30字，且数量不能超过创作篇数')
    }
    const result = createMockArticles(body)
    return result
      ? HttpResponse.json(result, { status: 201 })
      : apiError(422, 'MOCK_ARTICLE_CREATE_FAILED', '本地 Mock 文章创建失败，请刷新关键词后重试')
  }),
  http.put('/api/merchant/articles/:articleId', async ({ request, params }) => {
    await delay(200)
    if (!hasValidSession(request)) return unauthorized()

    const body = (await request.json()) as ArticleInput
    const article = updateMockArticle(String(params.articleId), body)
    return article ? HttpResponse.json(article) : apiError(404, 'ARTICLE_NOT_FOUND', '文章不存在或已删除')
  }),
  http.delete('/api/merchant/articles/:articleId', async ({ request, params }) => {
    await delay(160)
    if (!hasValidSession(request)) return unauthorized()

    return deleteMockArticle(String(params.articleId))
      ? new HttpResponse(null, { status: 204 })
      : apiError(404, 'ARTICLE_NOT_FOUND', '文章不存在或已删除')
  }),
  http.get('/api/merchant/website', async ({ request }) => {
    await delay(180)
    return hasValidSession(request) ? HttpResponse.json(getMockWebsite()) : unauthorized()
  }),
  http.put('/api/merchant/website', async ({ request }) => {
    await delay(180)
    if (!hasValidSession(request)) return unauthorized()
    const body = (await request.json()) as MerchantWebsiteInput
    if (!['minimal_enterprise', 'local_store', 'brand_content'].includes(body.template)) {
      return apiError(422, 'WEBSITE_TEMPLATE_INVALID', '请选择有效的网站模板')
    }
    if (!['terracotta', 'forest', 'blue', 'brick', 'violet', 'graphite_gold'].includes(body.themePreset)) {
      return apiError(422, 'WEBSITE_THEME_INVALID', '请选择有效的网站配色')
    }
    return HttpResponse.json(updateMockWebsite(body))
  }),
  http.post('/api/merchant/website/ai-profile', async ({ request }) => {
    await delay(650)
    if (!hasValidSession(request)) return unauthorized()
    const body = (await request.json()) as WebsiteAiProfileInput
    const draft = createMockWebsiteProfileDraft(body.knowledgeLibraryId)
    return draft ? HttpResponse.json(draft, { status: 201 }) : apiError(404, 'KNOWLEDGE_LIBRARY_NOT_FOUND', '企业信息库不存在或无权访问')
  }),
  http.post('/api/merchant/website/generate-mock', async ({ request }) => {
    await delay(480)
    return hasValidSession(request) ? HttpResponse.json(generateMockWebsite()) : unauthorized()
  }),
  http.get('/api/merchant/doubao-results', async ({ request }) => {
    await delay(210)
    return hasValidSession(request) ? HttpResponse.json(listMockDoubaoResults()) : unauthorized()
  }),
  http.get('/api/merchant/media-accounts', async ({ request }) => { await delay(180); return hasValidSession(request) ? HttpResponse.json(listMockMediaAccounts()) : unauthorized() }),
  http.post('/api/merchant/media-accounts/:platform/connect-mock', async ({ request, params }) => {
    await delay(260); if (!hasValidSession(request)) return unauthorized()
    const platform = String(params.platform)
    return ['toutiao','douyin','smzdm'].includes(platform) ? HttpResponse.json(requestMockMediaConnect(platform as 'toutiao' | 'douyin' | 'smzdm')) : apiError(422,'MEDIA_PLATFORM_INVALID','仅支持今日头条、抖音或什么值得买')
  }),
  http.get('/api/merchant/publish-tasks', async ({ request }) => { await delay(190); return hasValidSession(request) ? HttpResponse.json(listMockPublishTasks()) : unauthorized() }),
  http.post('/api/merchant/publish-tasks', async ({ request }) => {
    await delay(260); if (!hasValidSession(request)) return unauthorized()
    const body = (await request.json()) as CreatePublishTasksRequest
    if (typeof body.articleGroupId !== 'string' || !body.articleGroupId || !Array.isArray(body.platforms) || !body.platforms.length || !Array.isArray(body.mediaAccountIds) || !body.mediaAccountIds.length) return apiError(422,'PUBLISH_TASK_INPUT_INVALID','请选择文章分组、发布平台和已连接账号')
    const batch = createMockPublishTasks(body)
    return batch ? HttpResponse.json(batch,{status:201}) : apiError(409,'PUBLISH_TASK_CREATE_FAILED','文章分组内可发布文章不足，或发布账号不可用')
  }),
]
