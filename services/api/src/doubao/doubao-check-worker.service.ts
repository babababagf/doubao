import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Worker } from 'bullmq'
import IORedis from 'ioredis'

import { DoubaoCheckService } from './doubao-check.service'
import { DOUBAO_CHECK_QUEUE, type DoubaoQueuePayload } from './doubao-check-queue.service'
import { DOUBAO_WORKER_HEARTBEAT_KEY, controlledWorkerConcurrency, startWorkerHeartbeat } from '../health/worker-runtime'

@Injectable()
export class DoubaoCheckWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker: Worker<DoubaoQueuePayload> | null = null
  private connection: IORedis | null = null
  private stopHeartbeat: (() => void) | null = null
  constructor(private readonly config: ConfigService, private readonly checks: DoubaoCheckService) {}
  onModuleInit(): void {
    if (this.config.get<string>('AI_WORKER_ENABLED', 'false') !== 'true') return
    this.connection = new IORedis(this.config.get<string>('REDIS_URL', 'redis://127.0.0.1:6470'), { maxRetriesPerRequest: null, enableReadyCheck: true })
    this.worker = new Worker<DoubaoQueuePayload>(DOUBAO_CHECK_QUEUE, async (job) => this.checks.execute(job.data.batchId), { connection: this.connection, concurrency: controlledWorkerConcurrency(this.config.get<string>('DOUBAO_WORKER_CONCURRENCY')) })
    this.stopHeartbeat = startWorkerHeartbeat(this.connection, DOUBAO_WORKER_HEARTBEAT_KEY)
  }
  async onModuleDestroy(): Promise<void> { this.stopHeartbeat?.(); await this.worker?.close(); await this.connection?.quit() }
}
