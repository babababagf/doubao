import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'

import { CurrentMerchant } from '../auth/current-merchant.decorator'
import { MerchantSessionGuard } from '../auth/merchant-session.guard'
import type { MerchantActor } from '../auth/auth.types'
import { MerchantService } from './merchant.service'
import { MerchantContentService } from './merchant-content.service'
import { AiTaskService } from '../ai/ai-task.service'

@UseGuards(MerchantSessionGuard)
@Controller('merchant')
export class MerchantController {
  constructor(
    private readonly merchantService: MerchantService,
    private readonly contentService: MerchantContentService,
    private readonly aiTasks: AiTaskService,
  ) {}

  @Get('bootstrap')
  getBootstrap(@CurrentMerchant() actor: MerchantActor): Promise<object> {
    return this.merchantService.getBootstrap(actor)
  }

  @Get('dashboard')
  getDashboard(@CurrentMerchant() actor: MerchantActor): Promise<object> { return this.contentService.getDashboard(actor) }

  @Get('profile')
  getProfile(@CurrentMerchant() actor: MerchantActor): Promise<object> {
    return this.merchantService.getProfile(actor)
  }

  @Put('profile')
  updateProfile(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown): Promise<object> {
    return this.merchantService.updateProfile(actor, body)
  }

  @Get('keywords')
  listKeywords(@CurrentMerchant() actor: MerchantActor): Promise<object[]> {
    return this.merchantService.listKeywords(actor)
  }

  @Post('keywords')
  createKeyword(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown): Promise<object> {
    return this.merchantService.createKeyword(actor, body)
  }

  @Patch('keywords/:keywordId')
  updateKeyword(
    @CurrentMerchant() actor: MerchantActor,
    @Param('keywordId') keywordId: string,
    @Body() body: unknown,
  ): Promise<object> {
    return this.merchantService.updateKeyword(actor, keywordId, body)
  }

  @Delete('keywords/:keywordId')
  @HttpCode(204)
  async deleteKeyword(@CurrentMerchant() actor: MerchantActor, @Param('keywordId') keywordId: string): Promise<void> {
    await this.merchantService.deleteKeyword(actor, keywordId)
  }

  @Get('keywords/:keywordId/questions')
  listQuestions(@CurrentMerchant() actor: MerchantActor, @Param('keywordId') keywordId: string): Promise<object[]> { return this.contentService.listQuestions(actor, keywordId) }
  @Post('keywords/:keywordId/questions')
  createQuestion(@CurrentMerchant() actor: MerchantActor, @Param('keywordId') keywordId: string, @Body() body: unknown): Promise<object> { return this.contentService.createQuestion(actor, keywordId, body) }
  @Post('keywords/:keywordId/questions/batch')
  createQuestionsBatch(@CurrentMerchant() actor: MerchantActor, @Param('keywordId') keywordId: string, @Body() body: unknown): Promise<object> { return this.contentService.createQuestionsBatch(actor, keywordId, body) }
  @Post('keywords/:keywordId/questions/expand-mock')
  expandQuestionsMock(): Promise<never> { return this.contentService.rejectAiCreation() }
  @Post('keywords/:keywordId/questions/expand')
  expandQuestions(@CurrentMerchant() actor: MerchantActor, @Param('keywordId') keywordId: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey: string | undefined): Promise<object> { return this.aiTasks.createQuestionTask(actor, keywordId, body as never, idempotencyKey ?? '') }
  @Patch('questions/:questionId')
  updateQuestion(@CurrentMerchant() actor: MerchantActor, @Param('questionId') questionId: string, @Body() body: unknown): Promise<object> { return this.contentService.updateQuestion(actor, questionId, body) }
  @Delete('questions/:questionId') @HttpCode(204)
  async deleteQuestion(@CurrentMerchant() actor: MerchantActor, @Param('questionId') questionId: string): Promise<void> { await this.contentService.deleteQuestion(actor, questionId) }

  @Get('knowledge-libraries') listKnowledge(@CurrentMerchant() actor: MerchantActor): Promise<object[]> { return this.contentService.listKnowledge(actor) }
  @Post('knowledge-libraries') createKnowledge(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown): Promise<object> { return this.contentService.createKnowledge(actor, body) }
  @Put('knowledge-libraries/:libraryId') updateKnowledge(@CurrentMerchant() actor: MerchantActor, @Param('libraryId') id: string, @Body() body: unknown): Promise<object> { return this.contentService.updateKnowledge(actor, id, body) }
  @Delete('knowledge-libraries/:libraryId') @HttpCode(204) async deleteKnowledge(@CurrentMerchant() actor: MerchantActor, @Param('libraryId') id: string): Promise<void> { await this.contentService.deleteKnowledge(actor, id) }

  @Get('galleries') listGalleries(@CurrentMerchant() actor: MerchantActor): Promise<object[]> { return this.contentService.listGalleries(actor) }
  @Post('galleries') createGallery(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown): Promise<object> { return this.contentService.createGallery(actor, body) }
  @Put('galleries/:galleryId') updateGallery(@CurrentMerchant() actor: MerchantActor, @Param('galleryId') id: string, @Body() body: unknown): Promise<object> { return this.contentService.updateGallery(actor, id, body) }
  @Delete('galleries/:galleryId') @HttpCode(204) async deleteGallery(@CurrentMerchant() actor: MerchantActor, @Param('galleryId') id: string): Promise<void> { await this.contentService.deleteGallery(actor, id) }
  @Get('galleries/:galleryId/images') listGalleryImages(@CurrentMerchant() actor: MerchantActor, @Param('galleryId') id: string): Promise<object[]> { return this.contentService.listGalleryImages(actor, id) }
  @Post('galleries/:galleryId/images') startGalleryImageUpload(@CurrentMerchant() actor: MerchantActor, @Param('galleryId') id: string, @Body() body: unknown): Promise<object> { return this.contentService.startGalleryImageUpload(actor, id, body) }
  @Post('galleries/:galleryId/images/:uploadId/complete') completeGalleryImageUpload(@CurrentMerchant() actor: MerchantActor, @Param('galleryId') galleryId: string, @Param('uploadId') uploadId: string): Promise<object> { return this.contentService.completeGalleryImageUpload(actor, galleryId, uploadId) }
  @Delete('gallery-images/:imageId') @HttpCode(204) async deleteGalleryImage(@CurrentMerchant() actor: MerchantActor, @Param('imageId') id: string): Promise<void> { await this.contentService.deleteGalleryImage(actor, id) }

  @Get('writing-instructions') listInstructions(@CurrentMerchant() actor: MerchantActor): Promise<object[]> { return this.contentService.listInstructions(actor) }
  @Post('writing-instructions') createInstruction(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown): Promise<object> { return this.contentService.createInstruction(actor, body) }
  @Put('writing-instructions/:instructionId') updateInstruction(@CurrentMerchant() actor: MerchantActor, @Param('instructionId') id: string, @Body() body: unknown): Promise<object> { return this.contentService.updateInstruction(actor, id, body) }
  @Delete('writing-instructions/:instructionId') @HttpCode(204) async deleteInstruction(@CurrentMerchant() actor: MerchantActor, @Param('instructionId') id: string): Promise<void> { await this.contentService.deleteInstruction(actor, id) }

  @Get('articles') listArticles(@CurrentMerchant() actor: MerchantActor): Promise<object[]> { return this.contentService.listArticles(actor) }
  @Post('articles') createArticle(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown): Promise<object> { return this.contentService.createArticle(actor, body) }
  @Post('articles/create-mock') createArticlesMock(): Promise<never> { return this.contentService.rejectAiCreation() }
  @Post('ai-tasks') createArticleTask(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey: string | undefined): Promise<object> { return this.aiTasks.createArticleTask(actor, body as never, idempotencyKey ?? '') }
  @Get('ai-tasks') listAiTasks(@CurrentMerchant() actor: MerchantActor): Promise<object[]> { return this.aiTasks.list(actor) }
  @Get('ai-tasks/:taskId/retryable-questions') listRetryableAiTaskQuestions(@CurrentMerchant() actor: MerchantActor, @Param('taskId') taskId: string): Promise<object[]> { return this.aiTasks.retryableArticleQuestions(actor, taskId) }
  @Post('ai-tasks/:taskId/retry') retryAiTask(@CurrentMerchant() actor: MerchantActor, @Param('taskId') taskId: string, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey: string | undefined): Promise<object> { return this.aiTasks.retryArticleTask(actor, taskId, body as never, idempotencyKey ?? '') }
  @Post('ai-tasks/:taskId/stop') stopAiTask(@CurrentMerchant() actor: MerchantActor, @Param('taskId') taskId: string): Promise<object> { return this.aiTasks.stop(actor, taskId) }
  @Put('articles/:articleId') updateArticle(@CurrentMerchant() actor: MerchantActor, @Param('articleId') id: string, @Body() body: unknown): Promise<object> { return this.contentService.updateArticle(actor, id, body) }
  @Delete('articles/:articleId') @HttpCode(204) async deleteArticle(@CurrentMerchant() actor: MerchantActor, @Param('articleId') id: string): Promise<void> { await this.contentService.deleteArticle(actor, id) }

  @Get('website') getWebsite(@CurrentMerchant() actor: MerchantActor): Promise<object> { return this.contentService.getWebsite(actor) }
  @Put('website') updateWebsite(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown): Promise<object> { return this.contentService.updateWebsite(actor, body) }
  @Post('website/generate') generateWebsite(@CurrentMerchant() actor: MerchantActor): Promise<object> { return this.contentService.generateWebsite(actor) }
  @Post('website/generate-mock') generateWebsiteMock(): Promise<never> { return this.contentService.rejectWebsiteGeneration() }
  @Get('doubao-results') listDoubaoResults(@CurrentMerchant() actor: MerchantActor): Promise<object[]> { return this.contentService.listDoubaoResults(actor) }

  @Get('media-accounts') listMediaAccounts(@CurrentMerchant() actor: MerchantActor): Promise<object[]> { return this.contentService.listMediaAccounts(actor) }
  @Post('media-accounts/:platform/connect-mock') requestMediaConnect(): Promise<never> { return this.contentService.rejectMediaConnect() }
  @Get('publish-tasks') listPublishTasks(@CurrentMerchant() actor: MerchantActor): Promise<object[]> { return this.contentService.listPublishTasks(actor) }
  @Post('publish-tasks') createPublishTasks(@CurrentMerchant() actor: MerchantActor, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey: string | undefined): Promise<object> { return this.contentService.createPublishTasks(actor, body, idempotencyKey ?? '') }
}
