import { randomUUID } from 'node:crypto'
import type IORedis from 'ioredis'

export const AI_WORKER_HEARTBEAT_KEY = 'doubaohk:health:worker:ai'
export const DOUBAO_WORKER_HEARTBEAT_KEY = 'doubaohk:health:worker:doubao'

export function controlledWorkerConcurrency(value: string | undefined, fallback = 1): number {
  if (!value || !/^\d+$/.test(value)) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 16 ? parsed : fallback
}

export function startWorkerHeartbeat(connection: IORedis, key: string): () => void {
  const instanceId = randomUUID()
  const publish = async (): Promise<void> => {
    try {
      await connection.set(key, JSON.stringify({ instanceId, at: new Date().toISOString() }), 'EX', 30)
    } catch {
      // BullMQ 会单独报告连接异常；健康心跳失败不能制造第二个未处理异常。
    }
  }
  void publish()
  const timer = setInterval(() => { void publish() }, 10_000)
  timer.unref()
  return () => clearInterval(timer)
}
