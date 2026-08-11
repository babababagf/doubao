import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { SecurityModule } from '../security/security.module'
import { DoubaoCheckQueueService } from './doubao-check-queue.service'
import { DoubaoCheckService } from './doubao-check.service'
import { DoubaoCheckWorkerService } from './doubao-check-worker.service'
import { DoubaoProviderService } from './doubao-provider.service'

@Module({
  imports: [PrismaModule, SecurityModule],
  providers: [DoubaoProviderService, DoubaoCheckQueueService, DoubaoCheckService, DoubaoCheckWorkerService],
  exports: [DoubaoCheckService],
})
export class DoubaoModule {}
