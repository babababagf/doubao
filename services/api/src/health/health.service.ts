import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import IORedis from 'ioredis'

import { PrismaService } from '../prisma/prisma.service'
import { AI_WORKER_HEARTBEAT_KEY, DOUBAO_WORKER_HEARTBEAT_KEY } from './worker-runtime'

type CheckStatus = 'ok' | 'failed'
type WorkerStatus = 'ok' | 'missing'
export type ReadinessResult = {
  status: 'ok' | 'degraded'
  ready: boolean
  checks: {
    database: CheckStatus
    redis: CheckStatus
    workers: { required: boolean; ai: WorkerStatus; doubao: WorkerStatus }
  }
}

export function readinessResult(input: { database: boolean; redis: boolean; aiWorker: boolean; doubaoWorker: boolean; requireWorkers: boolean }): ReadinessResult {
  const ready = input.database && input.redis && (!input.requireWorkers || (input.aiWorker && input.doubaoWorker))
  return {
    status: ready ? 'ok' : 'degraded',
    ready,
    checks: {
      database: input.database ? 'ok' : 'failed',
      redis: input.redis ? 'ok' : 'failed',
      workers: { required: input.requireWorkers, ai: input.aiWorker ? 'ok' : 'missing', doubao: input.doubaoWorker ? 'ok' : 'missing' },
    },
  }
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: IORedis

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.redis = new IORedis(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6470'), {
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
    })
    this.redis.on('error', () => undefined)
  }

  async ready(): Promise<ReadinessResult> {
    const requireWorkers = this.config.get<string>('HEALTH_REQUIRE_WORKERS', 'false') === 'true'
    const [database, redisResult] = await Promise.all([
      this.withTimeout(this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false)),
      this.withTimeout(this.redis.multi().ping().mget(AI_WORKER_HEARTBEAT_KEY, DOUBAO_WORKER_HEARTBEAT_KEY).exec()
        .then((rows) => ({ ok: rows?.[0]?.[1] === 'PONG', heartbeats: Array.isArray(rows?.[1]?.[1]) ? rows[1][1] as Array<string | null> : [] }))
        .catch(() => ({ ok: false, heartbeats: [] as Array<string | null> })), { ok: false, heartbeats: [] as Array<string | null> }),
    ])
    return readinessResult({
      database,
      redis: redisResult.ok,
      aiWorker: Boolean(redisResult.heartbeats[0]),
      doubaoWorker: Boolean(redisResult.heartbeats[1]),
      requireWorkers,
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined)
  }

  private async withTimeout<T>(promise: Promise<T>, fallback = false as T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), 2_500); timer.unref() }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
