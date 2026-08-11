import { HttpException, HttpStatus, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import IORedis from 'ioredis'
import { createHash } from 'node:crypto'

import { LoginRealm } from '../generated/prisma/client'

/**
 * 登录失败计数仅保存在 Redis 中，并使用不可逆摘要作为键的一部分：
 * 不保存明文账号，不把短时风控状态写入业务数据库。
 */
@Injectable()
export class LoginProtectionService implements OnModuleDestroy {
  private readonly connection: IORedis
  private readonly failureLimit: number
  private readonly failureWindowSeconds: number
  private readonly lockSeconds: number

  constructor(config: ConfigService) {
    this.failureLimit = positiveInteger(config.get<string>('LOGIN_FAILURE_LIMIT', '5'), 5)
    this.failureWindowSeconds = positiveInteger(config.get<string>('LOGIN_FAILURE_WINDOW_SECONDS', '900'), 900)
    this.lockSeconds = positiveInteger(config.get<string>('LOGIN_LOCK_SECONDS', '900'), 900)
    this.connection = new IORedis(config.get<string>('REDIS_URL', 'redis://127.0.0.1:6470'), {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    })
  }

  async assertAllowed(realm: LoginRealm, usernameCanonical: string): Promise<void> {
    const connection = await this.readyConnection()
    const remaining = await connection.ttl(this.lockKey(realm, usernameCanonical))
    if (remaining > 0) {
      throw new HttpException({ code: 'LOGIN_RETRY_LATER', message: '登录尝试过于频繁，请稍后再试' }, HttpStatus.TOO_MANY_REQUESTS)
    }
  }

  /** @returns 是否在本次失败后进入短时锁定 */
  async recordFailure(realm: LoginRealm, usernameCanonical: string): Promise<boolean> {
    const connection = await this.readyConnection()
    const key = this.failureKey(realm, usernameCanonical)
    const count = await connection.incr(key)
    if (count === 1) await connection.expire(key, this.failureWindowSeconds)
    if (count < this.failureLimit) return false

    await connection.multi()
      .set(this.lockKey(realm, usernameCanonical), '1', 'EX', this.lockSeconds)
      .del(key)
      .exec()
    return true
  }

  async clearFailures(realm: LoginRealm, usernameCanonical: string): Promise<void> {
    const connection = await this.readyConnection()
    await connection.del(this.failureKey(realm, usernameCanonical))
  }

  async onModuleDestroy(): Promise<void> {
    if (this.connection.status !== 'end') await this.connection.quit()
  }

  private async readyConnection(): Promise<IORedis> {
    try {
      if (this.connection.status === 'wait') await this.connection.connect()
      if (this.connection.status !== 'ready') await this.connection.ping()
      return this.connection
    } catch {
      // 认证防护不可用时拒绝登录，避免 Redis 宕机后悄然失去暴力破解保护。
      throw new ServiceUnavailableException({ code: 'LOGIN_PROTECTION_UNAVAILABLE', message: '登录保护暂不可用，请稍后重试' })
    }
  }

  private failureKey(realm: LoginRealm, usernameCanonical: string): string {
    return `doubaohk:login:fail:${this.principalHash(realm, usernameCanonical)}`
  }

  private lockKey(realm: LoginRealm, usernameCanonical: string): string {
    return `doubaohk:login:lock:${this.principalHash(realm, usernameCanonical)}`
  }

  private principalHash(realm: LoginRealm, usernameCanonical: string): string {
    return createHash('sha256').update(`${realm}:${usernameCanonical}`).digest('hex')
  }
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}
