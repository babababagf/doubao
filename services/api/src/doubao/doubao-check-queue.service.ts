import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'

export const DOUBAO_CHECK_QUEUE = 'doubaohk-doubao-checks'
export type DoubaoQueuePayload = { batchId: string }

@Injectable()
export class DoubaoCheckQueueService implements OnModuleDestroy {
  private readonly connection: IORedis
  private readonly queue: Queue<DoubaoQueuePayload>
  constructor(config: ConfigService) { this.connection = new IORedis(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6470'), { maxRetriesPerRequest: 1, enableReadyCheck: true }); this.queue = new Queue<DoubaoQueuePayload>(DOUBAO_CHECK_QUEUE, { connection: this.connection }) }
  async enqueue(batchId: string): Promise<void> { await this.queue.add('run', { batchId }, { jobId: batchId, attempts: 2, backoff: { type: 'exponential', delay: 2_000 }, removeOnComplete: 300, removeOnFail: 1000 }) }
  async onModuleDestroy(): Promise<void> { await this.queue.close(); await this.connection.quit() }
}
