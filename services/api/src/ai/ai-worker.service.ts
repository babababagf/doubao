import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'

import { AiTaskService } from './ai-task.service'
import { AI_TASK_QUEUE, type AiQueuePayload } from './ai-task-queue.service'
import { AI_WORKER_HEARTBEAT_KEY, controlledWorkerConcurrency, startWorkerHeartbeat } from '../health/worker-runtime'

@Injectable()
export class AiWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<AiQueuePayload> | null = null
  private connection: IORedis | null = null
  private stopHeartbeat: (() => void) | null = null

  constructor(private readonly config: ConfigService, private readonly tasks: AiTaskService) {}

  onModuleInit(): void {
    if (this.config.get<string>('AI_WORKER_ENABLED', 'false') !== 'true') return
    this.connection = new IORedis(this.config.get<string>('REDIS_URL', 'redis://127.0.0.1:6470'), { maxRetriesPerRequest: null, enableReadyCheck: true })
    this.worker = new Worker<AiQueuePayload>(AI_TASK_QUEUE, async (job) => this.tasks.execute(job.data.taskId), { connection: this.connection, concurrency: controlledWorkerConcurrency(this.config.get<string>('AI_WORKER_CONCURRENCY')) })
    this.stopHeartbeat = startWorkerHeartbeat(this.connection, AI_WORKER_HEARTBEAT_KEY)
  }

  async onModuleDestroy(): Promise<void> {
    this.stopHeartbeat?.()
    await this.worker?.close()
    await this.connection?.quit()
  }
}
