import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { SecurityModule } from '../security/security.module'
import { AiProviderService } from './ai-provider.service'
import { AiTaskQueueService } from './ai-task-queue.service'
import { AiTaskService } from './ai-task.service'
import { AiWorkerService } from './ai-worker.service'

@Module({
  imports: [PrismaModule, SecurityModule],
  providers: [AiProviderService, AiTaskQueueService, AiTaskService, AiWorkerService],
  exports: [AiTaskService],
})
export class AiModule {}
