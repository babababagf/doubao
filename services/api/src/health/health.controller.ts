import { Controller, Get, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'

import { HealthService, type ReadinessResult } from './health.service'

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' }
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadinessResult> {
    const result = await this.health.ready()
    reply.code(result.ready ? 200 : 503)
    return result
  }
}
