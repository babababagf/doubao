import type {
  ArticleInput,
  ArticleAiTaskInput,
  AiGenerationTask,
  AiTaskRetryableQuestion,
  BootstrapResponse,
  CreateKeywordRequest,
  CreateQuestionRequest,
  DashboardResponse,
  DoubaoCheckResult,
  MediaAccount,
  PublishTask,
  CreatePublishBatchResponse,
  CreatePublishTasksRequest,
  GalleryImage,
  GalleryImageInput,
  GalleryImageUploadTicket,
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
  MockQuestionExpandRequest,
  MockArticleCreateRequest,
  MockArticleCreateResponse,
  MockQuestionExpandResponse,
  ProfileUpdateRequest,
  QuestionBatchCreateRequest,
  QuestionBatchCreateResponse,
  QuestionExpansionTaskInput,
  UpdateKeywordRequest,
  UpdateQuestionRequest,
  WritingInstruction,
  WritingInstructionInput,
} from '@doubaohk/api-contract'

import { apiRequest } from './http'

export function getBootstrap(): Promise<BootstrapResponse> {
  return apiRequest<BootstrapResponse>('/merchant/bootstrap')
}

export function getDashboard(): Promise<DashboardResponse> {
  return apiRequest<DashboardResponse>('/merchant/dashboard')
}

export function getMerchantProfile(): Promise<MerchantProfile> {
  return apiRequest<MerchantProfile>('/merchant/profile')
}

export function updateMerchantProfile(input: ProfileUpdateRequest): Promise<MerchantProfile> {
  return apiRequest<MerchantProfile>('/merchant/profile', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function listKeywords(): Promise<MerchantKeyword[]> {
  return apiRequest<MerchantKeyword[]>('/merchant/keywords')
}

export function createKeyword(input: CreateKeywordRequest): Promise<MerchantKeyword> {
  return apiRequest<MerchantKeyword>('/merchant/keywords', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateKeyword(keywordId: string, input: UpdateKeywordRequest): Promise<MerchantKeyword> {
  return apiRequest<MerchantKeyword>(`/merchant/keywords/${encodeURIComponent(keywordId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteKeyword(keywordId: string): Promise<void> {
  return apiRequest<void>(`/merchant/keywords/${encodeURIComponent(keywordId)}`, {
    method: 'DELETE',
  })
}

export function listQuestions(keywordId: string): Promise<MerchantQuestion[]> {
  return apiRequest<MerchantQuestion[]>(`/merchant/keywords/${encodeURIComponent(keywordId)}/questions`)
}

export function createQuestion(
  keywordId: string,
  input: CreateQuestionRequest,
): Promise<MerchantQuestion> {
  return apiRequest<MerchantQuestion>(`/merchant/keywords/${encodeURIComponent(keywordId)}/questions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createQuestionsBatch(
  keywordId: string,
  input: QuestionBatchCreateRequest,
): Promise<QuestionBatchCreateResponse> {
  return apiRequest<QuestionBatchCreateResponse>(`/merchant/keywords/${encodeURIComponent(keywordId)}/questions/batch`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function expandQuestionsMock(
  keywordId: string,
  input: MockQuestionExpandRequest,
): Promise<MockQuestionExpandResponse> {
  return apiRequest<MockQuestionExpandResponse>(
    `/merchant/keywords/${encodeURIComponent(keywordId)}/questions/expand-mock`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function createQuestionExpansionTask(
  keywordId: string,
  input: QuestionExpansionTaskInput,
): Promise<AiGenerationTask> {
  return apiRequest<AiGenerationTask>(
    `/merchant/keywords/${encodeURIComponent(keywordId)}/questions/expand`,
    { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(input) },
  )
}

export function updateQuestion(questionId: string, input: UpdateQuestionRequest): Promise<MerchantQuestion> {
  return apiRequest<MerchantQuestion>(`/merchant/questions/${encodeURIComponent(questionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteQuestion(questionId: string): Promise<void> {
  return apiRequest<void>(`/merchant/questions/${encodeURIComponent(questionId)}`, {
    method: 'DELETE',
  })
}

export function listKnowledgeLibraries(): Promise<KnowledgeLibrary[]> {
  return apiRequest<KnowledgeLibrary[]>('/merchant/knowledge-libraries')
}

export function createKnowledgeLibrary(input: KnowledgeLibraryInput): Promise<KnowledgeLibrary> {
  return apiRequest<KnowledgeLibrary>('/merchant/knowledge-libraries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateKnowledgeLibrary(
  libraryId: string,
  input: KnowledgeLibraryInput,
): Promise<KnowledgeLibrary> {
  return apiRequest<KnowledgeLibrary>(`/merchant/knowledge-libraries/${encodeURIComponent(libraryId)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteKnowledgeLibrary(libraryId: string): Promise<void> {
  return apiRequest<void>(`/merchant/knowledge-libraries/${encodeURIComponent(libraryId)}`, {
    method: 'DELETE',
  })
}

export function listGalleries(): Promise<MerchantGallery[]> {
  return apiRequest<MerchantGallery[]>('/merchant/galleries')
}

export function createGallery(input: GalleryInput): Promise<MerchantGallery> {
  return apiRequest<MerchantGallery>('/merchant/galleries', { method: 'POST', body: JSON.stringify(input) })
}

export function updateGallery(galleryId: string, input: GalleryInput): Promise<MerchantGallery> {
  return apiRequest<MerchantGallery>(`/merchant/galleries/${encodeURIComponent(galleryId)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteGallery(galleryId: string): Promise<void> {
  return apiRequest<void>(`/merchant/galleries/${encodeURIComponent(galleryId)}`, { method: 'DELETE' })
}

export function listGalleryImages(galleryId: string): Promise<GalleryImage[]> {
  return apiRequest<GalleryImage[]>(`/merchant/galleries/${encodeURIComponent(galleryId)}/images`)
}

export function addGalleryImageMetadata(
  galleryId: string,
  input: GalleryImageInput,
): Promise<GalleryImage> {
  return apiRequest<GalleryImage>(`/merchant/galleries/${encodeURIComponent(galleryId)}/images`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createGalleryImageUpload(
  galleryId: string,
  input: GalleryImageInput,
): Promise<GalleryImageUploadTicket> {
  return apiRequest<GalleryImageUploadTicket>(`/merchant/galleries/${encodeURIComponent(galleryId)}/images`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function completeGalleryImageUpload(galleryId: string, uploadId: string): Promise<GalleryImage> {
  return apiRequest<GalleryImage>(`/merchant/galleries/${encodeURIComponent(galleryId)}/images/${encodeURIComponent(uploadId)}/complete`, { method: 'POST' })
}

export function deleteGalleryImage(imageId: string): Promise<void> {
  return apiRequest<void>(`/merchant/gallery-images/${encodeURIComponent(imageId)}`, { method: 'DELETE' })
}

export function listWritingInstructions(): Promise<WritingInstruction[]> {
  return apiRequest<WritingInstruction[]>('/merchant/writing-instructions')
}

export function createWritingInstruction(input: WritingInstructionInput): Promise<WritingInstruction> {
  return apiRequest<WritingInstruction>('/merchant/writing-instructions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateWritingInstruction(
  instructionId: string,
  input: WritingInstructionInput,
): Promise<WritingInstruction> {
  return apiRequest<WritingInstruction>(`/merchant/writing-instructions/${encodeURIComponent(instructionId)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteWritingInstruction(instructionId: string): Promise<void> {
  return apiRequest<void>(`/merchant/writing-instructions/${encodeURIComponent(instructionId)}`, {
    method: 'DELETE',
  })
}

export function listArticles(): Promise<MerchantArticle[]> {
  return apiRequest<MerchantArticle[]>('/merchant/articles')
}

export function createArticle(input: ArticleInput): Promise<MerchantArticle> {
  return apiRequest<MerchantArticle>('/merchant/articles', { method: 'POST', body: JSON.stringify(input) })
}

export function createArticlesMock(input: MockArticleCreateRequest): Promise<MockArticleCreateResponse> {
  return apiRequest<MockArticleCreateResponse>('/merchant/articles/create-mock', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function createArticleAiTask(input: ArticleAiTaskInput): Promise<AiGenerationTask> {
  return apiRequest<AiGenerationTask>('/merchant/ai-tasks', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  })
}

export function listAiTasks(): Promise<AiGenerationTask[]> {
  return apiRequest<AiGenerationTask[]>('/merchant/ai-tasks')
}

export function stopAiTask(taskId: string): Promise<AiGenerationTask> {
  return apiRequest<AiGenerationTask>(`/merchant/ai-tasks/${encodeURIComponent(taskId)}/stop`, { method: 'POST' })
}

export function listRetryableAiTaskQuestions(taskId: string): Promise<AiTaskRetryableQuestion[]> {
  return apiRequest<AiTaskRetryableQuestion[]>(`/merchant/ai-tasks/${encodeURIComponent(taskId)}/retryable-questions`)
}

export function retryArticleAiTask(taskId: string, questionId?: string): Promise<AiGenerationTask> {
  return apiRequest<AiGenerationTask>(`/merchant/ai-tasks/${encodeURIComponent(taskId)}/retry`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ questionId: questionId ?? null }),
  })
}

export function updateArticle(articleId: string, input: ArticleInput): Promise<MerchantArticle> {
  return apiRequest<MerchantArticle>(`/merchant/articles/${encodeURIComponent(articleId)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteArticle(articleId: string): Promise<void> {
  return apiRequest<void>(`/merchant/articles/${encodeURIComponent(articleId)}`, { method: 'DELETE' })
}

export function getWebsite(): Promise<MerchantWebsite> {
  return apiRequest<MerchantWebsite>('/merchant/website')
}

export function updateWebsite(input: MerchantWebsiteInput): Promise<MerchantWebsite> {
  return apiRequest<MerchantWebsite>('/merchant/website', { method: 'PUT', body: JSON.stringify(input) })
}

export function generateWebsiteMock(): Promise<MerchantWebsite> {
  return apiRequest<MerchantWebsite>('/merchant/website/generate-mock', { method: 'POST' })
}

export function generateWebsite(): Promise<MerchantWebsite> {
  return apiRequest<MerchantWebsite>('/merchant/website/generate', { method: 'POST' })
}

export function listDoubaoResults(): Promise<DoubaoCheckResult[]> {
  return apiRequest<DoubaoCheckResult[]>('/merchant/doubao-results')
}
export function listMediaAccounts(): Promise<MediaAccount[]> { return apiRequest<MediaAccount[]>('/merchant/media-accounts') }
export function listPublishTasks(): Promise<PublishTask[]> { return apiRequest<PublishTask[]>('/merchant/publish-tasks') }
export function createPublishTasks(input: CreatePublishTasksRequest): Promise<CreatePublishBatchResponse> {
  return apiRequest<CreatePublishBatchResponse>('/merchant/publish-tasks', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify(input),
  })
}
