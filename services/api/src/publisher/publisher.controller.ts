import { Body, Controller, Delete, Get, Header, Param, Post, Put, UseGuards } from '@nestjs/common'

import { CurrentPublisher } from '../auth/current-publisher.decorator'
import { PublisherSessionGuard } from '../auth/publisher-session.guard'
import type { PublisherActor } from '../auth/auth.types'
import { PublisherService } from './publisher.service'
import { PlatformUpdatePolicyService } from '../tenancy/platform-update-policy.service'
import { MediaSessionBackupService } from './media-session-backup.service'

@UseGuards(PublisherSessionGuard)
@Controller('publisher')
export class PublisherController {
  constructor(private readonly publisher: PublisherService, private readonly updatePolicy: PlatformUpdatePolicyService, private readonly mediaSessions: MediaSessionBackupService) {}

  @Get('bootstrap') bootstrap(@CurrentPublisher() actor: PublisherActor): Promise<object> { return this.publisher.getBootstrap(actor) }
  @Get('tasks') tasks(@CurrentPublisher() actor: PublisherActor): Promise<object[]> { return this.publisher.listTasks(actor) }
  @Get('tasks/:taskId/images') taskImages(@CurrentPublisher() actor: PublisherActor, @Param('taskId') taskId: string): Promise<object> { return this.publisher.taskImages(actor, taskId) }
  @Get('update-policy') updatePolicyForDesktop(): Promise<object> { return this.updatePolicy.getForPublisher() }
  @Post('tasks/:taskId/claim') claim(@CurrentPublisher() actor: PublisherActor, @Param('taskId') taskId: string): Promise<object> { return this.publisher.claimTask(actor, taskId) }
  @Post('tasks/:taskId/heartbeat') heartbeat(@CurrentPublisher() actor: PublisherActor, @Param('taskId') taskId: string): Promise<object> { return this.publisher.heartbeatTask(actor, taskId) }
  @Post('tasks/:taskId/attention') attention(@CurrentPublisher() actor: PublisherActor, @Param('taskId') taskId: string, @Body() body: { reason?: unknown }): Promise<object> { return this.publisher.reportAttention(actor, taskId, body?.reason) }
  @Post('tasks/:taskId/resume') resume(@CurrentPublisher() actor: PublisherActor, @Param('taskId') taskId: string): Promise<object> { return this.publisher.resumeTask(actor, taskId) }
  @Post('tasks/:taskId/complete') complete(@CurrentPublisher() actor: PublisherActor, @Param('taskId') taskId: string, @Body() body: { resultUrl?: unknown }): Promise<object> { return this.publisher.confirmTaskSuccess(actor, taskId, body?.resultUrl) }
  @Post('tasks/:taskId/resolve-published') resolvePublished(@CurrentPublisher() actor: PublisherActor, @Param('taskId') taskId: string, @Body() body: { resultUrl?: unknown }): Promise<object> { return this.publisher.resolveTaskAsPublished(actor, taskId, body?.resultUrl) }
  @Post('media-accounts/:platform/state') accountState(@CurrentPublisher() actor: PublisherActor, @Param('platform') platform: string, @Body() body: unknown): Promise<object> { return this.publisher.updateAccountState(actor, platform, body) }
  @Put('media-accounts/:accountId/session-backup') saveSessionBackup(@CurrentPublisher() actor: PublisherActor, @Param('accountId') accountId: string, @Body() body: unknown): Promise<object> { return this.mediaSessions.save(actor, accountId, body) }
  @Get('media-accounts/:accountId/session-backup') @Header('Cache-Control', 'no-store') restoreSessionBackup(@CurrentPublisher() actor: PublisherActor, @Param('accountId') accountId: string): Promise<object> { return this.mediaSessions.restore(actor, accountId) }
  @Delete('media-accounts/:accountId/session-backup') revokeSessionBackup(@CurrentPublisher() actor: PublisherActor, @Param('accountId') accountId: string): Promise<object> { return this.mediaSessions.revoke(actor, accountId) }
}
