import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export const AI_TASK_QUEUE = 'doubaohk-ai-tasks'
export type AiQueuePayload = { taskId: string }

@Injectable()
export class AiTaskQueueService implements OnModuleDestroy {
  private readonly connection: IORedis
  private readonly queue: Queue<AiQueuePayload>

  constructor(config: ConfigService) {
    this.connection = new IORedis(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6470'), { maxRetriesPerRequest: 1, enableReadyCheck: true })
    this.queue = new Queue<AiQueuePayload>(AI_TASK_QUEUE, { connection: this.connection })
  }

  async enqueue(taskId: string): Promise<void> {
    await this.queue.add('run', { taskId }, { jobId: taskId, attempts: 2, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 500, removeOnFail: 1000 })
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close()
    await this.connection.quit()
  }
}
