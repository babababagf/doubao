import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

import type { PublisherActor } from './auth.types'

export const CurrentPublisher = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublisherActor => {
    const request = context.switchToHttp().getRequest<FastifyRequest & { publisherActor?: PublisherActor }>()
    if (!request.publisherActor) throw new Error('受保护发布助手路由未注入商户身份。')
    return request.publisherActor
  },
)
